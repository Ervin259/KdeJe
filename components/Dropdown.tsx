"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Rozbaľovací výber s checkboxmi (ypdd v prototype). Výber sa ukladá do URL parametra
 * (napr. ?m=1,2,3), takže filter prežije obnovenie stránky aj sa dá poslať odkazom.
 */
export function CheckDropdown({
  param,
  options,
  selected,
  allLabel,
  label,
}: {
  param: string;
  options: { value: string; label: string; hint?: string; count?: number }[];
  selected: string[];
  allLabel: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const all = selected.length === options.length;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function set(next: string[]) {
    if (!next.length) return; // aspoň jedna položka
    const q = new URLSearchParams(sp.toString());
    if (next.length === options.length) q.delete(param);
    else q.set(param, options.filter((o) => next.includes(o.value)).map((o) => o.value).join(","));
    router.replace(`${path}${q.size ? "?" + q.toString() : ""}`, { scroll: false });
  }

  return (
    <div className="ypdd" ref={ref}>
      <button className="ypbtn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        <span>{all ? allLabel : label}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="yppanel" role="group">
          <label className="ypall">
            <input type="checkbox" checked={all} onChange={() => set(all ? [options[0].value] : options.map((o) => o.value))} />
            <b>{allLabel}</b>
          </label>
          {options.map((o) => (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  set(e.target.checked ? [...selected, o.value] : selected.filter((x) => x !== o.value))
                }
              />
              <span>{o.label}</span>
              {o.hint && <span className="muted">{o.hint}</span>}
              {o.count !== undefined && <span className="muted">{o.count}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
