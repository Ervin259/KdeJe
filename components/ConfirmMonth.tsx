import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CONFIRM_DAYS_BEFORE, MN, confirmOpen, fd, plus } from "@/lib/calc";

async function confirmMonth(form: FormData) {
  "use server";
  const supabase = await createClient();
  const empId = String(form.get("emp"));
  const y = Number(form.get("y"));
  const m = Number(form.get("m"));
  await supabase.from("month_confirmations").insert({ employee_id: empId, year: y, month: m });
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
}) {
  const label = short ? "Odsúhlasiť" : `Odsúhlasiť ${MN[m - 1]}`;
  if (confirmedAt)
    return (
      <span
        className="pill open confpill"
        title={`Dochádzka ${forName ? `(${forName}) ` : ""}za ${MN[m - 1]} odsúhlasená ${fd(confirmedAt.slice(0, 10))}`}
      >
        ✓ Odsúhlasené
      </span>
    );
  if (!confirmOpen(today, last))
    return (
      <button
        className="btn confbtn"
        disabled
        title={`Odsúhlasiť sa dá od ${fd(plus(last, -CONFIRM_DAYS_BEFORE))} (${CONFIRM_DAYS_BEFORE} dni pred koncom mesiaca)`}
      >
        {label}
      </button>
    );
  return (
    <form action={confirmMonth}>
      <input type="hidden" name="emp" value={empId} />
      <input type="hidden" name="y" value={y} />
      <input type="hidden" name="m" value={m} />
      <button
        className="btn confbtn"
        title={
          forName
            ? `Odsúhlasíš dochádzku za ${MN[m - 1]} za: ${forName}. Záznamy sa potom uzamknú.`
            : `Potvrdíš, že tvoje záznamy za ${MN[m - 1]} sú úplné. Potom sa uzamknú.`
        }
      >
        {label}
      </button>
    </form>
  );
}
