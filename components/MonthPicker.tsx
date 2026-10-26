"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MNC } from "@/lib/calc";

const pad = (n: number) => String(n).padStart(2, "0");
const DOW = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

/**
 * Nadpis obdobia v kalendári ako rozbaľovací výber.
 * Mesiac: rok šípkami a 12 mesiacov. Deň a týždeň: mesiac šípkami a dni v mriežke (týždeň od pondelka).
 */
export function MonthPicker({
  y,
  m,
  anchor,
  today,
  basePath,
  view,
  children,
}: {
  y: number;
  m: number;
  anchor: string;
  today: string;
  basePath: string;
  view: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(y);
  const [mon, setMon] = useState(m);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    setYear(y);
    setMon(m);
  }, [y, m, open]);
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
    router.push(`${basePath}?v=${view}&d=${year}-${pad(mm)}-01`);
  };
  const goDay = (d: string) => {
    setOpen(false);
    router.push(`${basePath}?v=${view}&d=${d}`);
  };
  const shift = (delta: number) => {
    const i = year * 12 + (mon - 1) + delta;
    setYear(Math.floor(i / 12));
    setMon((i % 12) + 1);
  };

  // dni mesiaca v týždňoch od pondelka
  const days: (string | null)[] = [];
  if (view !== "month") {
    const first = new Date(Date.UTC(year, mon - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    for (let i = 0; i < lead; i++) days.push(null);
    for (let d = 1; d <= count; d++) days.push(`${year}-${pad(mon)}-${pad(d)}`);
  }
  // pondelok týždňa, ktorý je zobrazený (pre zvýraznenie v pohľade Týždeň)
  const monday = (() => {
    const t = new Date(anchor + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  })();
  const inWeek = (d: string) => d >= monday && d <= new Date(Date.parse(monday) + 6 * 864e5).toISOString().slice(0, 10);
  return (
    <div className="ypdd mpick" ref={ref}>
      <button className="mpick-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} title={view === "month" ? "Vybrať mesiac" : view === "week" ? "Vybrať týždeň" : "Vybrať deň"}>
        <h2>{children}</h2>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && view === "month" && (
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
      {open && view !== "month" && (
        <div className="yppanel mpick-panel dpick" role="dialog" aria-label={view === "week" ? "Vybrať týždeň" : "Vybrať deň"}>
          <div className="mpick-year">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Predchádzajúci mesiac">
              ‹
            </button>
            <b>
              {MNC[mon - 1]} {year}
            </b>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Nasledujúci mesiac">
              ›
            </button>
          </div>
          <div className="dpick-grid">
            {DOW.map((d, i) => (
              <span key={d} className={`dpick-dow${i > 4 ? " wk" : ""}`}>
                {d}
              </span>
            ))}
            {days.map((d, i) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  className={[
                    i % 7 > 4 ? "wk" : "",
                    d === today ? "now" : "",
                    view === "day" && d === anchor ? "on" : "",
                    view === "week" && inWeek(d) ? "wsel" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => goDay(d)}
                >
                  {Number(d.slice(8))}
                </button>
              ) : (
                <span key={`e${i}`} />
              )
            )}
          </div>
          <button type="button" className="linkbtn dpick-today" onClick={() => goDay(today)}>
            Dnes
          </button>
        </div>
      )}
    </div>
  );
}
