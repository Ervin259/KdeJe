import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MN, fd } from "@/lib/calc";

async function confirmMonth(form: FormData) {
  "use server";
  const supabase = await createClient();
  const empId = String(form.get("emp"));
  const y = Number(form.get("y"));
  const m = Number(form.get("m"));
  await supabase.from("month_confirmations").insert({ employee_id: empId, year: y, month: m });
  revalidatePath("/", "layout");
}

/** Tlačidlo „Odsúhlasiť [mesiac]“ v mesačnom náhľade (len TPP). */
export async function ConfirmMonthButton({
  y,
  m,
  last,
  today,
  empId,
}: {
  y: number;
  m: number;
  last: string;
  today: string;
  empId: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("month_confirmations")
    .select("confirmed_at")
    .eq("employee_id", empId)
    .eq("year", y)
    .eq("month", m)
    .maybeSingle();

  if (data)
    return (
      <span className="pill open confpill" title={`Dochádzku za ${MN[m - 1]} si odsúhlasil(a) ${fd(data.confirmed_at.slice(0, 10))}`}>
        ✓ Odsúhlasené
      </span>
    );
  if (today <= last)
    return (
      <button className="btn confbtn" disabled title="Mesiac ešte prebieha – odsúhlasiť môžeš po jeho skončení">
        Odsúhlasiť {MN[m - 1]}
      </button>
    );
  return (
    <form action={confirmMonth}>
      <input type="hidden" name="emp" value={empId} />
      <input type="hidden" name="y" value={y} />
      <input type="hidden" name="m" value={m} />
      <button
        className="btn confbtn"
        title={`Potvrdíš, že tvoje záznamy za ${MN[m - 1]} sú úplné. Potom sa uzamknú.`}
      >
        Odsúhlasiť {MN[m - 1]}
      </button>
    </form>
  );
}
