import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Export dát firmy pre admina (CSV so stredníkom a BOM – otvorí sa priamo v Exceli). */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) return new NextResponse("Len pre admina firmy", { status: 403 });
  const typ = new URL(request.url).searchParams.get("typ") ?? "zaznamy";

  const { data: emps } = await supabase
    .from("employees")
    .select("id, name, email, contract_type, firm, date_from, date_to, active, role, is_manager")
    .order("name");
  const name = new Map((emps ?? []).map((e) => [e.id as string, e.name as string]));

  let header: string[] = [];
  let rows: (string | number | boolean | null)[][] = [];

  if (typ === "zamestnanci") {
    header = ["Meno", "E-mail", "Pracovný pomer", "Firma", "Od", "Do", "Aktívny", "Admin", "Vedúci"];
    rows = (emps ?? []).map((e) => [e.name, e.email, e.contract_type, e.firm, e.date_from, e.date_to, e.active ? "áno" : "nie", e.role === "admin" ? "áno" : "nie", e.is_manager ? "áno" : "nie"]);
  } else if (typ === "dovolenky") {
    const { data } = await supabase.from("vacation_years").select("employee_id, year, entitlement_full, entitlement, carry_in, closed").order("year");
    header = ["Meno", "Rok", "Plný ročný nárok", "Nárok v roku", "Prenos z minulého roka", "Uzavretý"];
    rows = (data ?? []).map((v) => [name.get(v.employee_id) ?? "", v.year, v.entitlement_full, v.entitlement, v.carry_in, v.closed ? "áno" : "nie"]);
  } else {
    header = ["Meno", "Typ", "Od", "Do", "Rozsah", "Čas od", "Čas do", "Zástup", "Poznámka", "Vytvorené", "Upravené"];
    for (let page = 0; ; page++) {
      const { data } = await supabase
        .from("entries")
        .select("employee_id, type, date_from, date_to, part, time_from, time_to, substitute_id, note, created_at, updated_at")
        .order("date_from")
        .range(page * 1000, page * 1000 + 999);
      for (const x of data ?? [])
        rows.push([
          name.get(x.employee_id) ?? "",
          x.type,
          x.date_from,
          x.date_to,
          { full: "celý deň", am: "dopoludnie", pm: "popoludnie", hrs: "hodiny" }[x.part as string] ?? x.part,
          x.time_from?.slice(0, 5) ?? "",
          x.time_to?.slice(0, 5) ?? "",
          x.substitute_id ? name.get(x.substitute_id) ?? "" : "",
          x.note,
          x.created_at?.slice(0, 19).replace("T", " "),
          x.updated_at?.slice(0, 19).replace("T", " "),
        ]);
      if (!data || data.length < 1000) break;
    }
  }

  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
  const file = `kdeje-${typ}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` },
  });
}
