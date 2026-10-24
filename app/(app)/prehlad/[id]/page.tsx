import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLead } from "@/lib/data";
import { loadCompany } from "@/lib/loaders";
import { byLastName } from "@/lib/calc";
import { Header } from "@/components/Header";
import { EmpOverview } from "@/components/EmpOverview";
import { EmpSelect } from "@/components/EmpSelect";

export default async function EmpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireLead();
  const { id } = await params;
  const { emps: allEmps } = await loadCompany();
  // vedúci vidí len svojich ľudí
  const emps = me.role === "admin" ? allEmps : allEmps.filter((e) => me.managed.includes(e.id));
  const list = emps.filter((e) => e.active).sort(byLastName);
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) notFound();
  const prev = list[(i - 1 + list.length) % list.length];
  const next = list[(i + 1) % list.length];

  const center = (
    <div className="mnav">
      <Link className="btn" href="/prehlad" style={{ marginRight: 6 }}>
        ‹ Celý tím
      </Link>
      <Link className="icon-btn" href={`/prehlad/${prev.id}`} aria-label="Predchádzajúci zamestnanec">
        ‹
      </Link>
      <EmpSelect value={id} options={list.map((e) => ({ id: e.id, name: e.name }))} base="/prehlad/" />
      <Link className="icon-btn" href={`/prehlad/${next.id}`} aria-label="Ďalší zamestnanec">
        ›
      </Link>
      <span className="muted num" style={{ fontSize: 13, marginLeft: 4 }}>
        {i + 1} / {list.length}
      </span>
    </div>
  );

  return (
    <>
      <Header me={me} center={center} />
      <main id="view">
        <div className="panel">
          <EmpOverview empId={id} admin />
        </div>
      </main>
    </>
  );
}
