"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { setOrgFilter } from "./companyActions";

type Key = "kj_site" | "kj_dept";
/** oddeľovač hodnôt v cookie (názvy môžu obsahovať čiarku) */
const SEP = "|";

/** Výber viacerých hodnôt s checkboxmi – vzhľad ako prepínač firmy v hlavičke. */
function MultiSelect({ k, options, selected, allLabel, title }: { k: Key; options: string[]; selected: string[]; allLabel: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(selected);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setSel(selected), [selected.join(SEP)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function set(next: string[]) {
    // nič alebo všetko = bez filtra
    const v = next.length === 0 || next.length === options.length ? [] : options.filter((o) => next.includes(o));
    setSel(v);
    start(() => setOrgFilter(k, v.join(SEP)));
  }
  const label = !sel.length ? allLabel : sel.length === 1 ? sel[0] : `${sel[0]} +${sel.length - 1}`;

  return (
    <div className="ypdd orgdd" ref={ref}>
      <button
        type="button"
        className={`firmswitch fsel${sel.length ? " on" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        title={sel.length ? `${title}: ${sel.join(", ")}` : title}
        onClick={() => setOpen(!open)}
        style={pending ? { opacity: 0.7 } : undefined}
      >
        {label}
      </button>
      {open && (
        <div className="yppanel" role="group" aria-label={title}>
          <label className="ypall">
            <input type="checkbox" checked={!sel.length} onChange={() => set([])} />
            <b>{allLabel}</b>
          </label>
          {options.map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                checked={sel.includes(o)}
                onChange={(e) => set(e.target.checked ? [...sel, o] : sel.filter((x) => x !== o))}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Výber prevádzok a oddelení v hlavičke (viac naraz). */
export function OrgFilter({ sites, depts, site, dept }: { sites: string[]; depts: string[]; site: string[]; dept: string[] }) {
  return (
    <span className="orgfilter">
      {sites.length > 0 && <MultiSelect k="kj_site" options={sites} selected={site} allLabel="Všetky prevádzky" title="Prevádzka" />}
      {depts.length > 0 && <MultiSelect k="kj_dept" options={depts} selected={dept} allLabel="Všetky oddelenia" title="Oddelenie" />}
    </span>
  );
}
