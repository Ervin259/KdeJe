"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { addOrgOption, deleteOrgOption, renameOrgOption, type OrgKind, type OrgRes } from "@/app/(app)/nastavenia/actions";

/**
 * Výber zo zoznamu firmy (Typ vzťahu, Prevádzka, Oddelenie) s tlačidlom na úpravu zoznamu:
 * pridanie, premenovanie (zmení sa aj u zamestnancov) a zmazanie nepoužitej hodnoty.
 * Je vnútri formulára zamestnanca, preto úpravy volajú serverové akcie priamo (nie cez vnorený <form>).
 */
export function ListSelect({
  kind,
  name,
  id,
  label,
  value,
  onChange,
  options,
  locked = [],
  emptyLabel,
  className,
}: {
  kind: OrgKind;
  name: string;
  id?: string;
  /** názov zoznamu (aria-label, nadpis panela) */
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** hodnoty, ktoré sa nedajú premenovať ani zmazať */
  locked?: string[];
  /** text prázdnej voľby (bez nej sa hodnota musí vybrať) */
  emptyLabel?: string;
  className?: string;
}) {
  const [list, setList] = useState(options);
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState("");
  const [edit, setEdit] = useState<{ old: string; v: string } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // aktuálna hodnota zamestnanca, ktorá v zozname (zatiaľ) nie je
  const shown = value && !list.includes(value) ? [...list, value] : list;

  function run(p: Promise<OrgRes>, after?: (list: string[]) => void) {
    setErr("");
    start(async () => {
      const r = await p;
      if (r.error) setErr(r.error);
      else if (r.list) {
        setList(r.list);
        after?.(r.list);
      }
    });
  }

  function doAdd() {
    const v = add.replace(/\s+/g, " ").trim();
    if (!v) return;
    run(addOrgOption(kind, v), () => {
      setAdd("");
      onChange(v);
    });
  }

  function doRename() {
    if (!edit) return;
    const v = edit.v.replace(/\s+/g, " ").trim();
    if (!v || v === edit.old) return setEdit(null);
    run(renameOrgOption(kind, edit.old, v), () => {
      if (value === edit.old) onChange(v);
      setEdit(null);
    });
  }

  function doDelete(v: string) {
    run(deleteOrgOption(kind, v), () => {
      if (value === v) onChange("");
    });
  }

  // Enter v poli nesmie odoslať celý formulár zamestnanca
  const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div className={`lsel ${className ?? ""}`} ref={ref}>
      <select id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {shown.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="lsel-edit"
        aria-expanded={open}
        aria-label={`Upraviť zoznam: ${label}`}
        title={`Upraviť zoznam: ${label}`}
        onClick={() => {
          setOpen(!open);
          setErr("");
          setEdit(null);
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M11.2 2.3l2.5 2.5-7.9 7.9-3.1.6.6-3.1 7.9-7.9z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="lsel-panel" role="dialog" aria-label={`Zoznam: ${label}`}>
          <div className="lsel-head">{label}</div>
          {err && <div className="lsel-err">{err}</div>}
          <ul>
            {list.length === 0 && <li className="muted lsel-empty">Zoznam je prázdny.</li>}
            {list.map((x) =>
              edit?.old === x ? (
                <li key={x} className="on">
                  <input
                    autoFocus
                    type="text"
                    maxLength={60}
                    value={edit.v}
                    onChange={(e) => setEdit({ old: x, v: e.target.value })}
                    onKeyDown={onEnter(doRename)}
                    aria-label={`Nový názov pre ${x}`}
                  />
                  <button type="button" className="btn sm primary" disabled={pending} onClick={doRename}>
                    Uložiť
                  </button>
                  <button type="button" className="btn sm" onClick={() => setEdit(null)}>
                    Zrušiť
                  </button>
                </li>
              ) : (
                <li key={x}>
                  <span className="v">{x}</span>
                  {locked.includes(x) ? (
                    <span className="muted lsel-lock" title="Riadi správanie aplikácie, nedá sa meniť">pevné</span>
                  ) : (
                    <>
                      <button type="button" className="lsel-act" disabled={pending} onClick={() => setEdit({ old: x, v: x })} title="Premenovať (zmení sa aj u zamestnancov)">
                        Premenovať
                      </button>
                      <button type="button" className="lsel-act del" disabled={pending} onClick={() => doDelete(x)} title="Zmazať" aria-label={`Zmazať ${x}`}>
                        ×
                      </button>
                    </>
                  )}
                </li>
              )
            )}
          </ul>
          <div className="lsel-add">
            <input
              type="text"
              maxLength={60}
              placeholder="Nová hodnota"
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              onKeyDown={onEnter(doAdd)}
              aria-label={`Pridať do zoznamu ${label}`}
            />
            <button type="button" className="btn sm primary" disabled={pending || !add.trim()} onClick={doAdd}>
              Pridať
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
