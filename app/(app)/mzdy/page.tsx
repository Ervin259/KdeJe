import { requireAdmin } from "@/lib/data";
import { Header } from "@/components/Header";

export default async function MzdyPage() {
  const me = await requireAdmin();
  return (
    <>
      <Header me={me} />
      <main id="view">
        <div className="box">
          <h3>Podklad pre mzdy</h3>
          <p className="muted">Táto záložka sa prenáša z prototypu a bude doplnená v ďalšom kroku.</p>
        </div>
      </main>
    </>
  );
}
