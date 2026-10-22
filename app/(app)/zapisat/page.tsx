import { createClient } from "@/lib/supabase/server";
import { requireMe, todayIso } from "@/lib/data";
import { EntryForm } from "./EntryForm";

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ spat?: string }>;
}) {
  const me = await requireMe();
  const supabase = await createClient();
  const sp = await searchParams;
  // len interné cesty, žiadne presmerovanie mimo aplikácie
  const back = sp.spat?.startsWith("/") && !sp.spat.startsWith("//") ? sp.spat : "/kalendar";

  const [{ data: types }, people] = await Promise.all([
    supabase.from("absence_types").select("code, name, parts").eq("enabled", true).order("sort"),
    me.role === "admin"
      ? supabase.from("employees").select("id, name").eq("active", true).order("name").then((r) => r.data ?? [])
      : Promise.resolve(null),
  ]);

  return (
    <section className="narrow">
      <h1>Zapísať neprítomnosť</h1>
      <EntryForm types={types ?? []} people={people} meId={me.id} back={back} today={todayIso()} />
    </section>
  );
}
