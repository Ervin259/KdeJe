"use client";
import { useTransition } from "react";
import { setOrgFilter } from "./companyActions";

type Key = "kj_site" | "kj_dept";

/** Výber prevádzky a oddelenia v hlavičke. */
export function OrgFilter({
  sites,
  depts,
  site,
  dept,
}: {
  sites: string[];
  depts: string[];
  site: string;
  dept: string;
}) {
  const [pending, start] = useTransition();
  const set = (k: Key) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    start(() => setOrgFilter(k, v));
  };
  return (
    <span className="orgfilter">
      {sites.length > 0 && (
        <select className={`firmswitch fsel${site ? " on" : ""}`} value={site} disabled={pending} onChange={set("kj_site")} aria-label="Prevádzka" title="Prevádzka">
          <option value="">Všetky prevádzky</option>
          {sites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {depts.length > 0 && (
        <select className={`firmswitch fsel${dept ? " on" : ""}`} value={dept} disabled={pending} onChange={set("kj_dept")} aria-label="Oddelenie" title="Oddelenie">
          <option value="">Všetky oddelenia</option>
          {depts.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
