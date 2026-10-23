import Link from "next/link";
import { requireMe } from "@/lib/data";
import { Header } from "@/components/Header";
import { EmpOverview } from "@/components/EmpOverview";

/** Prehľad prihláseného: dovolenka, lekár, OČR a rok po mesiacoch (tlačidlo Prehľad za menom). */
export default async function MyOverviewPage() {
  const me = await requireMe();
  const center = (
    <div className="mnav">
      <Link className="btn" href="/kalendar" style={{ marginRight: 6 }}>
        ‹ Späť do kalendára
      </Link>
      <h2>Môj prehľad</h2>
    </div>
  );
  const right = (
    <Link className="btn primary" href="/zapisat?spat=%2Fmoj-prehlad">
      + Zapísať
    </Link>
  );
  return (
    <>
      <Header me={me} center={center} right={right} />
      <main id="view">
        <div className="panel">
          <EmpOverview empId={me.id} admin={false} />
        </div>
      </main>
    </>
  );
}
