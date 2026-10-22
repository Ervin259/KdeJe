import { requireAdmin } from "@/lib/data";
import { Header } from "@/components/Header";

export default async function PrehladPage() {
  const me = await requireAdmin();
  return (
    <>
      <Header me={me} />
      <main id="view">
        <div className="box">
          <h3>Prehľad</h3>
          <p className="muted">Táto záložka sa prenáša z prototypu a bude doplnená v ďalšom kroku.</p>
        </div>
      </main>
    </>
  );
}
