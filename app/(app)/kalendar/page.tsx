import { Calendar } from "@/components/Calendar";
import { createClient } from "@/lib/supabase/server";
import { requireMe, todayIso, iso, type Me } from "@/lib/data";
import { calParams } from "@/lib/params";

/**
 * Predošlý mesiac, ktorý si prihlásený ešte neodsúhlasil (napr. 2. 11. → október), inak null.
 * Platí pre každého s vlastným záznamom zamestnanca okrem dohodárov (tí mesiac neodsúhlasujú)
 * a len ak v predošlom mesiaci už pracoval vo firme.
 */
async function unconfirmedPrevMonth(me: Me): Promise<string | null> {
  if (!me.isEmployee || me.contract_type === "DOH") return null;
  const t = todayIso();
  let y = Number(t.slice(0, 4));
  let m = Number(t.slice(5, 7)) - 1;
  if (m === 0) {
    y -= 1;
    m = 12;
  }
  const first = iso(y, m, 1);
  const last = iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());

  const supabase = await createClient();
  const [{ data: emp }, { data: conf }] = await Promise.all([
    supabase.from("employees").select("date_from, date_to").eq("id", me.id).maybeSingle(),
    supabase
      .from("month_confirmations")
      .select("employee_id")
      .eq("employee_id", me.id)
      .eq("year", y)
      .eq("month", m)
      .maybeSingle(),
  ]);
  if (conf) return null;
  // v predošlom mesiaci ešte nenastúpil alebo už nepracoval
  if (emp?.date_from && emp.date_from > last) return null;
  if (emp?.date_to && emp.date_to < first) return null;
  return first;
}

export default async function TeamCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; d?: string; m?: string }>;
}) {
  const me = await requireMe();
  const sp = await searchParams;
  let { view, anchor } = calParams(sp, "month");

  // Otvorenie aplikácie (bez zvoleného obdobia): kým nie je odsúhlasený predošlý mesiac, ukáž ten.
  // Tlačidlo „Dnes“ a šípky posielajú dátum v adrese, takže sa dá kedykoľvek prejsť ďalej.
  if (!sp.d && !sp.m && !sp.v) {
    const prev = await unconfirmedPrevMonth(me);
    if (prev) {
      view = "month";
      anchor = prev;
    }
  }

  return <Calendar me={me} view={view} anchor={anchor} basePath="/kalendar" onlyMe={!me.sees_calendar && me.role !== "admin"} />;
}
