"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MNC } from "@/lib/calc";

/** Nadpis obdobia v kalendári ako rozbaľovací výber mesiaca (rok šípkami, mesiace v mriežke). */
export function MonthPicker({
  y,
  m,
  today,
  basePath,
  view,
  children,
}: {
  y: number;
  m: number;
  today: string;
  basePath: string;
  view: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(y);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => setYear(y), [y, open]);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", c);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", c);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const go = (mm: number) => {
    setOpen(false);
    router.push(`${basePath}?v=${view}&d=${year}-${String(mm).padStart(2, "0")}-01`);
  };
  return (
    <div className="ypdd mpick" ref={ref}>
      <button className="mpick-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} title="Vybrať mesiac">
        <h2>{children}</h2>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="yppanel mpick-panel" role="dialog" aria-label="Vybrať mesiac">
          <div className="mpick-year">
            <button type="button" className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Predchádzajúci rok">
              ‹
            </button>
            <b>{year}</b>
            <button type="button" className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Nasledujúci rok">
              ›
            </button>
          </div>
          <div className="mpick-grid">
            {MNC.map((name, i) => {
              const mm = i + 1;
              const cur = year === y && mm === m;
              const now = year === ty && mm === tm;
              return (
                <button key={name} type="button" className={`${cur ? "on" : ""}${now ? " now" : ""}`} onClick={() => go(mm)}>
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
