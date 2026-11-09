import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireMe, todayIso } from "@/lib/data";
import { TYPE_NAME, WD } from "@/lib/calc";
import { longInfo } from "@/lib/worktime";
import { ppLabel } from "@/lib/report";
import { loadVykaz, period } from "@/lib/vykazLoad";

export const runtime = "nodejs";

const INK = "FF161D2B";
const MUTED = "FF596379";
const HEAD = "FF2F3743";
const LINE = "FFD9DFE8";
const OFF = "FFEEF1F5";
const SUM = "FFE4E9FB";
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin" as const, color: { argb: LINE } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fdy = (d: string) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`;
/** hodiny ako čas Excelu (zlomok dňa) s formátom [h]:mm */
const hx = (n: number) => (Math.abs(n) < 1 / 120 ? null : n / 24);
const safe = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Výkaz dochádzky ako .xlsx – každý zamestnanec na samostatnom hárku. */
export async function GET(request: Request) {
  const me = await requireMe();
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const { from, to } = period(sp, todayIso());
  const { list } = await loadVykaz(me, sp, from, to);

  const wb = new ExcelJS.Workbook();
  wb.creator = "KdeJe";
  wb.created = new Date();
  const used = new Set<string>();

  for (const v of list) {
    const { emp, days, sum } = v;
    const doh = emp.contract_type === "DOH";
    let name = emp.name.replace(/[\\/?*[\]:]/g, "").slice(0, 28) || "Zamestnanec";
    while (used.has(name)) name = name.slice(0, 26) + "_" + used.size;
    used.add(name);
    const ws = wb.addWorksheet(name, {
      pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: `&L${me.company_name} · ${emp.name} · ${fdy(from)} – ${fdy(to)}&RStrana &P z &N` },
    });
    const head = ["Deň", "Dátum", "Príchod", "Odchod", "Prestávka od", "Prestávka min", "Odpracované", "Neprítomnosť", "Nočná", "So/Ne/Sviatok", ...(doh ? [] : ["Rozdiel"]), "Poznámka"];
    const W = head.length;
    ws.mergeCells(1, 1, 1, W);
    ws.getCell(1, 1).value = `Výkaz dochádzky – ${emp.name}`;
    ws.getCell(1, 1).font = { size: 15, bold: true, color: { argb: INK } };
    ws.mergeCells(2, 1, 2, W);
    ws.getCell(2, 1).value = `${me.company_name} · ${ppLabel(emp.contract_type)}${emp.site ? " · " + emp.site : ""}${emp.department ? " · " + emp.department : ""} · ${fdy(from)} – ${fdy(to)}`;
    ws.getCell(2, 1).font = { size: 11, bold: true, color: { argb: INK } };
    ws.mergeCells(3, 1, 3, W);
    ws.getCell(3, 1).value = doh ? "Dohoda – časy podľa rozpisu hodín" : longInfo(v.w).join(" · ");
    ws.getCell(3, 1).font = { size: 9, color: { argb: MUTED } };
    ws.mergeCells(4, 1, 4, W);
    ws.getCell(4, 1).value = `Vytvorené ${fdy(todayIso())} v aplikácii KdeJe`;
    ws.getCell(4, 1).font = { size: 9, color: { argb: MUTED } };

    const H = 6;
    head.forEach((t, i) => {
      const c = ws.getRow(H).getCell(i + 1);
      c.value = t;
      c.fill = fill(HEAD);
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      c.alignment = { horizontal: i > 1 && i < W - 1 ? "center" : "left", vertical: "middle", wrapText: true };
      c.border = box;
    });
    ws.getRow(H).height = 30;

    let r = H + 1;
    const timeCols = [3, 4, 5];
    const hourCols = [7, 9, 10, ...(doh ? [] : [11])];
    for (const x of days) {
      const row = ws.getRow(r);
      const abs = x.codes.filter((c) => x.absBy[c] || x.absentFull);
      const vals: (string | number | null)[] = [
        WD[x.dow] + (x.holiday ? " (sviatok)" : ""),
        fdy(x.day),
        x.arrive,
        x.leave,
        x.break_min ? x.break_start : null,
        x.break_min || null,
        hx(x.worked),
        abs.map((c) => (x.absentFull ? c : `${c} ${Math.round(x.absBy[c] * 100) / 100} h`)).join(", ") || null,
        hx(x.night),
        hx(x.weekend + x.holidayWork),
        ...(doh ? [] : [hx(x.diff)]),
        x.note ?? null,
      ];
      vals.forEach((val, i) => {
        const c = row.getCell(i + 1);
        c.value = val;
        c.border = box;
        if (!x.work) c.fill = fill(OFF);
        if (hourCols.includes(i + 1)) c.numFmt = "[h]:mm;-[h]:mm;;@";
        if (timeCols.includes(i + 1) || hourCols.includes(i + 1) || i + 1 === 6) c.alignment = { horizontal: "center" };
      });
      if (abs.length) row.getCell(8).note = abs.map((c) => TYPE_NAME[c] ?? c).join(", ");
      r++;
    }
    // súčty
    const tr = ws.getRow(r);
    tr.getCell(1).value = "Spolu";
    for (const col of hourCols) {
      const L = ws.getColumn(col).letter;
      tr.getCell(col).value = { formula: `SUM(${L}${H + 1}:${L}${r - 1})` };
      tr.getCell(col).numFmt = "[h]:mm;-[h]:mm;0:00;@";
      tr.getCell(col).alignment = { horizontal: "center" };
    }
    tr.getCell(8).value = Object.entries(sum.absBy).map(([k, n]) => `${k} ${Math.round(n * 100) / 100} h`).join(", ") || null;
    for (let i = 1; i <= W; i++) {
      tr.getCell(i).fill = fill(SUM);
      tr.getCell(i).font = { bold: true, color: { argb: INK } };
      tr.getCell(i).border = { ...box, top: { style: "medium", color: { argb: HEAD } } };
    }
    r += 2;
    const info: [string, number | null][] = [
      ...(doh ? [] : ([["Fond", sum.fond]] as [string, number][])),
      ["Odpracované", sum.worked],
      ...(!doh && v.w.overtime !== "none" ? ([[`Nadčas (${v.w.overtime === "nv" ? "predvolene náhradné voľno" : "predvolene preplatiť"})`, sum.overtime]] as [string, number][]) : []),
      ...(!doh && v.w.flexible && v.w.flex_period !== "day" ? ([["Saldo pružného času", sum.saldo]] as [string, number][]) : []),
      ["Nočná práca", sum.night],
      ["Sobota/nedeľa", sum.weekend],
      ["Sviatok", sum.holidayWork],
    ];
    for (const [k, n] of info) {
      ws.getCell(r, 1).value = k;
      ws.mergeCells(r, 1, r, 3);
      ws.getCell(r, 4).value = n == null ? null : n / 24;
      ws.getCell(r, 4).numFmt = "[h]:mm;-[h]:mm;0:00";
      ws.getCell(r, 4).font = { bold: true };
      r++;
    }
    r += 2;
    ws.getCell(r, 1).value = "Zamestnanec: ____________________";
    ws.getCell(r, 5).value = "Vedúci / zamestnávateľ: ____________________";
    ws.getCell(r, 10).value = "Dátum: ____________";

    const widths = [10, 12, 9, 9, 11, 10, 12, 22, 8, 12, ...(doh ? [] : [9]), 30];
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: H }];
    ws.pageSetup.printTitlesRow = `${H}:${H}`;
  }
  if (!list.length) wb.addWorksheet("Výkaz").getCell(1, 1).value = "V tomto období tu nie je nikto na zobrazenie.";

  const buf = await wb.xlsx.writeBuffer();
  const who = list.length === 1 ? safe(list[0].emp.name) : "vsetci";
  const file = `KdeJe-vykaz-${who}-${from}-${to}.xlsx`;
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
