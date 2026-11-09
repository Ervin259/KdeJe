import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAdmin, todayIso } from "@/lib/data";
import { buildPayroll } from "@/lib/payroll";
import { MNC, TYPE_NAME, byLastName } from "@/lib/calc";
import { ppLabel } from "@/lib/report";

export const runtime = "nodejs";

// farby aplikácie
const INK = "FF161D2B";
const MUTED = "FF596379";
const HEAD = "FF2F3743";
const HEAD_OFF = "FF262D37";
const LINE = "FFD9DFE8";
const OFF = "FFEEF1F5";
const WD = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin" as const, color: { argb: LINE } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
/** dátum s rokom, napr. 1. 11. 2026 */
const fdy = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;
const num = (n: number) => Math.round(n * 1000) / 1000;
const isDohG = (g: string | null) => g === "DOH";
const safe = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Podklady pre mzdy ako skutočný súbor .xlsx s formátovaním.
 * ?m=10&g=TPP  → súhrn neprítomností a SL pre typ vzťahu
 * ?m=10&g=DOH  → výkaz hodín dohodárov po dňoch
 */
export async function GET(request: Request) {
  const me = await requireAdmin();
  const sp = new URL(request.url).searchParams;
  const year = Number(todayIso().slice(0, 4));
  const mq = Number(sp.get("m"));
  const m = mq >= 1 && mq <= 12 ? mq : Number(todayIso().slice(5, 7));
  const g = sp.get("g") || "TPP";

  const P = await buildPayroll(year, m);
  const { calc, cols, days, wd, groups, doh, otCols } = P;
  const oc = !isDohG(sp.get("g")) && otCols(sp.get("g") || "TPP");
  const OTH = ["Nadčas preplatiť h", "Nadčas → NV h", "Zostatok NV h"];
  const period = `${MNC[m - 1]} ${year}`;
  const isDoh = g === "DOH";
  const groupName = isDoh ? "Dohody – výkaz hodín" : ppLabel(g);

  const wb = new ExcelJS.Workbook();
  wb.creator = "KdeJe";
  wb.created = new Date();
  const ws = wb.addWorksheet(`${isDoh ? "Dohody" : g.slice(0, 20)} ${String(m).padStart(2, "0")}-${year}`, {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L${me.company_name} · ${groupName} · ${period}&RStrana &P z &N` },
  });

  // hlavička dokumentu
  const header: string[] = isDoh ? ["Meno", ...days.map((d) => String(Number(d.slice(8)))), "Spolu"] : ["Meno", ...cols, ...(oc ? OTH : []), "SL", "Odsúhlasené"];
  const width = header.length;
  ws.mergeCells(1, 1, 1, width);
  ws.getCell(1, 1).value = `Podklady pre mzdy – ${groupName}`;
  ws.getCell(1, 1).font = { size: 15, bold: true, color: { argb: INK } };
  ws.mergeCells(2, 1, 2, width);
  ws.getCell(2, 1).value = `${me.company_name} · ${period} · ${wd} pracovných dní`;
  ws.getCell(2, 1).font = { size: 11, bold: true, color: { argb: INK } };
  ws.mergeCells(3, 1, 3, width);
  ws.getCell(3, 1).value = `Vytvorené ${fdy(todayIso())} v aplikácii KdeJe`;
  ws.getCell(3, 1).font = { size: 9, color: { argb: MUTED } };
  ws.getRow(1).height = 22;

  // hlavička tabuľky
  const H = 5;
  const hr = ws.getRow(H);
  header.forEach((t, i) => {
    const c = hr.getCell(i + 1);
    c.value = t;
    const off = isDoh && i > 0 && i <= days.length && !calc.isWork(days[i - 1]);
    c.fill = fill(off ? HEAD_OFF : HEAD);
    c.font = { bold: true, color: { argb: off ? "FF9AA4B2" : "FFFFFFFF" }, size: 10 };
    c.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle", wrapText: true };
    c.border = box;
    if (!isDoh && i > 0 && i <= cols.length && TYPE_NAME[t]) c.note = TYPE_NAME[t];
  });
  hr.height = oc ? 30 : 20;
  if (isDoh) {
    // druhý riadok hlavičky: deň v týždni
    const r2 = ws.getRow(H + 1);
    header.forEach((_, i) => {
      const c = r2.getCell(i + 1);
      const d = i > 0 && i <= days.length ? days[i - 1] : null;
      c.value = d ? WD[new Date(d + "T00:00:00Z").getUTCDay()] : "";
      const off = d && !calc.isWork(d);
      c.fill = fill(off ? HEAD_OFF : HEAD);
      c.font = { color: { argb: "FF9AA4B2" }, size: 8 };
      c.alignment = { horizontal: "center" };
      c.border = box;
    });
  }
  const first = isDoh ? H + 2 : H + 1;

  // riadky
  let r = first;
  if (isDoh) {
    for (const x of doh.slice().sort((a, b) => byLastName(a.e, b.e))) {
      const row = ws.getRow(r);
      row.getCell(1).value = x.e.name;
      days.forEach((d, i) => {
        const c = row.getCell(i + 2);
        const h = x.hours[d] ?? 0;
        c.value = h ? num(h) : null;
        if (!calc.isWork(d)) c.fill = fill(OFF);
      });
      row.getCell(days.length + 2).value = { formula: `SUM(${ws.getCell(r, 2).address}:${ws.getCell(r, days.length + 1).address})`, result: num(x.sum) };
      row.getCell(days.length + 2).font = { bold: true };
      r++;
    }
  } else {
    for (const x of (groups[g] ?? []).slice().sort((a, b) => byLastName(a.e, b.e))) {
      const row = ws.getRow(r);
      row.getCell(1).value = x.e.name;
      cols.forEach((k, i) => (row.getCell(i + 2).value = x.v[k] ? num(x.v[k]) : null));
      let c0 = cols.length + 2;
      if (oc) {
        const o = x.ot;
        const nz = (n: number) => (Math.abs(n) > 0.004 ? Math.round(n * 100) / 100 : null);
        row.getCell(c0).value = o ? nz(o.pay + o.expired) : null;
        if (o?.expired) row.getCell(c0).note = `z toho prepadnuté náhradné voľno ${num(o.expired)} h`;
        row.getCell(c0 + 1).value = o ? nz(o.nv) : null;
        row.getCell(c0 + 2).value = o ? nz(o.balance) : null;
        c0 += 3;
      }
      row.getCell(c0).value = x.sl;
      row.getCell(c0 + 1).value = x.e.contract_type === "DOH" ? "–" : x.conf ? fdy(x.conf.at) : "nie";
      if (!x.conf && x.e.contract_type !== "DOH") row.getCell(c0 + 1).font = { color: { argb: "FFB4314C" } };
      r++;
    }
  }

  // formát buniek
  for (let i = first; i < r; i++) {
    const row = ws.getRow(i);
    for (let j = 1; j <= width; j++) {
      const c = row.getCell(j);
      c.border = box;
      c.alignment = j > 1 ? { horizontal: "center", vertical: "middle" } : { vertical: "middle" };
      if (j > 1) c.numFmt = "General;-General;;@";
    }
    row.height = 18;
  }
  // šírky stĺpcov
  const names = [...(isDoh ? doh.map((x) => x.e.name) : (groups[g] ?? []).map((x) => x.e.name)), "Meno"];
  ws.getColumn(1).width = Math.min(34, Math.max(18, ...names.map((n) => n.length + 3)));
  for (let j = 2; j <= width; j++) ws.getColumn(j).width = isDoh ? (j === width ? 8 : 5) : j === width ? 13 : OTH.includes(header[j - 1]) ? 11 : 8;

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: first - 1 }];
  ws.pageSetup.printTitlesRow = `${H}:${first - 1}`;

  const buf = await wb.xlsx.writeBuffer();
  const file = `KdeJe-mzdy-${safe(isDoh ? "Dohody" : g)}-${year}-${String(m).padStart(2, "0")}.xlsx`;
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
