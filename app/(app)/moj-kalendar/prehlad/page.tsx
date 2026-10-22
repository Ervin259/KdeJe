import Link from "next/link";
import { requireMe } from "@/lib/data";
import { Header } from "@/components/Header";
import { EmpOverview } from "@/components/EmpOverview";

export default async function MyOverviewPage() {
  const me = await requireMe();
  const right = (
    <div className="row">
      <Link className="btn ovbtn" href="/moj-kalendar" aria-pressed="true" title="Späť do kalendára">
        Prehľad
      </Link>
      <Link className="btn primary" href="/zapisat?spat=%2Fmoj-kalendar%2Fprehlad">
        + Zapísať
      </Link>
    </div>
  );
  return (
    <>
      <Header me={me} right={right} />
      <main id="view">
        <div className="panel">
          <EmpOverview empId={me.id} admin={false} />
        </div>
      </main>
    </>
  );
}
