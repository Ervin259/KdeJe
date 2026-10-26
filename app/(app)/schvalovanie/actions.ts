"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireLead } from "@/lib/data";
import { loadCompany } from "@/lib/loaders";
import { requestLocked } from "@/lib/requests";
import { TYPE_NAME, eachDay, fd, fdw, partTxt, type Entry } from "@/lib/calc";

export type ActState = { error?: string; ok?: string };

const FIELDS = ["employee_id", "type", "date_from", "date_to", "part", "time_from", "time_to", "substitute_id", "note"] as const;
const pick = (p: Record<string, unknown>) => Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? null]));

const entryTxt = (x: Pick<Entry, "type" | "date_from" | "date_to" | "part" | "time_from" | "time_to">) =>
  `${x.type} ${x.date_from === x.date_to ? fd(x.date_from) : fd(x.date_from) + "–" + fd(x.date_to)}${
    x.part !== "full" ? " " + partTxt(x) : ""
  }`;

export async function approveRequest(prev: ActState, form: FormData) {
  return decide(prev, form, true);
}
export async function rejectRequest(prev: ActState, form: FormData) {
  return decide(prev, form, false);
}

async function decide(_prev: ActState, form: FormData, approve: boolean): Promise<ActState> {
  const me = await requireLead();
  const supabase = await createClient();
  const { calc, emps } = await loadCompany();
  const id = String(form.get("id"));
  const note = String(form.get("note") ?? "").trim();

  const { data: r } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
  if (!r || r.status !== "pending") return { error: "Žiadosť už bola vybavená." };
  if (me.role !== "admin") {
    // vedúci: len žiadosti svojich ľudí a len mimo uzávierky
    if (r.employee_id === me.id || !me.managed.includes(r.employee_id)) return { error: "Túto žiadosť vybavuje admin." };
    if (await requestLocked(r)) return { error: "Zmena je po uzávierke – žiadosť vybaví admin." };
  }
  const name = emps.find((e) => e.id === r.employee_id)?.name ?? "";
  const rec = r.payload as Entry;
  const old = (r.original as Entry | null) ?? null;
  const desc =
    r.kind === "new"
      ? `Pridať ${entryTxt(rec)}`
      : r.kind === "delete"
        ? `Vymazať ${old ? entryTxt(old) : "záznam"}`
        : `Zmeniť ${old ? entryTxt(old) : "záznam"} → ${entryTxt(rec)}`;

  if (approve) {
    if (r.kind !== "delete") {
      // kolízia s existujúcimi záznamami
      const { data: others } = await supabase
        .from("entries")
        .select("id, employee_id, type, date_from, date_to, part, time_from, time_to")
        .eq("employee_id", rec.employee_id)
        .lte("date_from", rec.date_to)
        .gte("date_to", rec.date_from);
      const [a1, a2] = calc.span(rec);
      let clash = "";
      eachDay(rec.date_from, rec.date_to, (d) => {
        if (clash || !calc.isWork(d)) return;
        for (const x of (others ?? []) as Entry[]) {
          if (x.id === r.target_entry_id || x.date_from > d || x.date_to < d) continue;
          const [b1, b2] = calc.span(x);
          if (a1 < b2 && b1 < a2) clash = `${fdw(d)}: ${(TYPE_NAME[x.type] ?? x.type).toLowerCase()} (${partTxt(x)})`;
        }
      });
      if (clash) return { error: "Nedá sa schváliť – kolízia: " + clash };
    }

    let res;
    if (r.kind === "new") res = await supabase.from("entries").insert({ ...pick(rec as never), created_by: r.created_by });
    else if (r.kind === "edit") res = await supabase.from("entries").update(pick(rec as never)).eq("id", r.target_entry_id);
    else res = await supabase.from("entries").delete().eq("id", r.target_entry_id);
    if (res.error) return { error: "Zmenu sa nepodarilo uložiť: " + res.error.message };

    // zmena v odsúhlasenom mesiaci zruší odsúhlasenie
    const months = new Set<string>();
    for (const x of [old, r.kind === "delete" ? null : rec]) {
      if (!x) continue;
      eachDay(x.date_from, x.date_to, (d) => months.add(`${d.slice(0, 4)}|${Number(d.slice(5, 7))}`));
    }
    for (const k of months) {
      const [y, m] = k.split("|").map(Number);
      await supabase.from("month_confirmations").delete().eq("employee_id", r.employee_id).eq("year", y).eq("month", m);
    }
  }

  const { error } = await supabase
    .from("requests")
    .update({
      status: approve ? "approved" : "rejected",
      decided_by: me.id || null,
      decided_at: new Date().toISOString(),
      reject_reason: approve ? null : note || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    employee_id: r.employee_id,
    table_name: "requests",
    action: approve ? "APPROVE" : "REJECT",
    row_id: id,
    after_lock: true,
    text: `${name} · ${approve ? "schválená" : "zamietnutá"} žiadosť: ${desc}${approve ? ` (${r.reason})` : note ? " – " + note : ""}`,
  });

  revalidatePath("/", "layout");
  return { ok: approve ? "Žiadosť schválená, zmena je uložená" : "Žiadosť zamietnutá" };
}

