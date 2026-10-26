import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/data";
import { Header } from "@/components/Header";
import { EmpOverview } from "@/components/EmpOverview";

/** Prehľad prihláseného: dovolenka, lekár, OČR a rok po mesiacoch (tlačidlo Prehľad za menom). */
export default async function MyOverviewPage() {
  const me = await requireMe();
  if (!me.isEmployee) redirect("/kalendar");
  const right = (
    <Link className="btn primary" href="/zapisat?spat=%2Fmoj-prehlad">
      + Zapísať
    </Link>
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
