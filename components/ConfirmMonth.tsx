import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { CONFIRM_DAYS_BEFORE, MN, MNC, confirmOpen, fd, plus } from "@/lib/calc";

async function confirmMonth(form: FormData) {
  "use server";
  const supabase = await createClient();
  const empId = String(form.get("emp"));
  const y = Number(form.get("y"));
  const m = Number(form.get("m"));
  await supabase.from("month_confirmations").insert({ employee_id: empId, year: y, month: m });
  revalidatePath("/", "layout");
}

/** Admin zruší odsúhlasenie – mesiac sa zamestnancovi znova odomkne. */
async function unconfirmMonth(form: FormData) {
  "use server";
  await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("month_confirmations")
    .delete()
    .eq("employee_id", String(form.get("emp")))
    .eq("year", Number(form.get("y")))
    .eq("month", Number(form.get("m")));
  revalidatePath("/", "layout");
}

/** Odsúhlasenia mesiaca pre zoznam zamestnancov (jeden dopyt pre celý kalendár). */
export async function loadConfirmations(y: number, m: number, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase
    .from("month_confirmations")
    .select("employee_id, confirmed_at")
    .eq("year", y)
    .eq("month", m)
    .in("employee_id", ids);
  return new Map((data ?? []).map((r) => [r.employee_id as string, r.confirmed_at as string]));
}

/**
 * Tlačidlo „Odsúhlasiť“ v mesačnom náhľade (všetci okrem dohodárov). Zamestnanec za seba, admin za kohokoľvek.
 * Aktívne od 3 dní pred koncom mesiaca.
 */
export function ConfirmMonthButton({
  y,
  m,
  last,
  today,
  empId,
  confirmedAt,
  forName,
  canUnlock = false,
  short = false,
}: {
  short?: boolean;
  y: number;
  m: number;
  last: string;
  today: string;
  empId: string;
  /** kedy bol mesiac odsúhlasený (undefined = ešte nie) */
  confirmedAt?: string;
  /** meno zamestnanca, keď odsúhlasuje admin za iného */
  forName?: string;
  /** admin môže odsúhlasenie zrušiť kliknutím na zámok */
  canUnlock?: boolean;
}) {
  void short;
  const when = confirmedAt ? fd(confirmedAt.slice(0, 10)) : "";
  if (confirmedAt && canUnlock)
    return (
      <form action={unconfirmMonth}>
        <input type="hidden" name="emp" value={empId} />
        <input type="hidden" name="y" value={y} />
        <input type="hidden" name="m" value={m} />
        <button
          className="okc2 done unlock"
          title={`Odsúhlasené ${when}. Kliknutím odsúhlasenie zrušíš a ${MN[m - 1]} sa ${forName ? "zamestnancovi" : "ti"} znova odomkne.`}
        >
          <LockIcon />
          <span className="t">Odomknúť</span>
        </button>
      </form>
    );
  if (confirmedAt)
    return (
      <span
        className="okc2 done"
        role="img"
        aria-label="Odsúhlasené"
        title={`Dochádzka ${forName ? `(${forName}) ` : ""}za ${MN[m - 1]} je odsúhlasená ${when} a uzamknutá`}
      >
        <LockIcon />
      </span>
    );
  if (!confirmOpen(today, last))
    return (
      <span
        className="okc2 wait"
        role="img"
        aria-label="Zatiaľ nie je možné odsúhlasiť"
        title={`Odsúhlasiť sa dá od ${fd(plus(last, -CONFIRM_DAYS_BEFORE))} (${CONFIRM_DAYS_BEFORE} dni pred koncom mesiaca)`}
      >
        <CheckIcon />
      </span>
    );
  return (
    <form action={confirmMonth}>
      <input type="hidden" name="emp" value={empId} />
      <input type="hidden" name="y" value={y} />
      <input type="hidden" name="m" value={m} />
      <button
        className="okc2 todo"
        title={`Odsúhlasenie dochádzky za ${MNC[m - 1]}. Záznamy sa po odsúhlasení uzamknú.`}
      >
        <CheckIcon />
        <span className="t">Odsúhlasiť</span>
      </button>
    </form>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" />
      <path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
