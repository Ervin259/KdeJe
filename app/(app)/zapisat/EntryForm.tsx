"use client";
import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { deleteEntry, saveEntry, type FormState } from "./actions";

type AbsenceType = { code: string; name: string; parts: string[] };
type Person = { id: string; name: string };
export type Init = {
  id: string | null;
  employee_id: string;
  type: string;
  part: "full" | "am" | "pm" | "hrs";
  date_from: string;
  date_to: string;
  time_from: string;
  time_to: string;
  substitute_id: string;
  note: string;
};

const PARTS = [
  { v: "full", label: "Celý deň", need: "full" },
  { v: "am", label: "Dopoludnie", need: "half" },
  { v: "pm", label: "Popoludnie", need: "half" },
  { v: "hrs", label: "Hodiny", need: "hrs" },
] as const;

function addMin(t: string, min: number) {
  const [h, m] = t.split(":").map(Number);
  const x = h * 60 + m + min;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

export function EntryForm({
  types,
  people,
  subs,
  init,
  back,
  locked,
}: {
  types: AbsenceType[];
  people: Person[] | null;
  subs: Person[];
  init: Init;
  back: string;
  locked: boolean;
}) {
  const [state, save, saving] = useActionState<FormState, FormData>(saveEntry, {});
  const [dstate, del, deleting] = useActionState<FormState, FormData>(deleteEntry, {});
  const [type, setType] = useState(init.type);
  const [part, setPart] = useState<string>(init.part);
  const [emp, setEmp] = useState(init.employee_id);
  const allowed = types.find((t) => t.code === type)?.parts ?? ["full"];
  const options = PARTS.filter((o) => allowed.includes(o.need));
  const p = options.some((o) => o.v === part) ? part : "full";
  const needReason = locked || state.needReason || dstate.needReason;
  const errors = [...(state.error ?? []), ...(dstate.error ?? [])];
  const reasonMsg = state.reasonMsg || dstate.reasonMsg;

  return (
    <form
      className="fform"
      onSubmit={(e) => {
        // odoslanie bez automatického vynulovania formulára (inak by sa po výzve na dôvod vrátil typ a dátumy na pôvodné)
        e.preventDefault();
        const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, sub);
        startTransition(() => (sub?.dataset.act === "del" ? del(fd) : save(fd)));
      }}
    >
      <input type="hidden" name="spat" value={back} />
      {init.id && <input type="hidden" name="id" value={init.id} />}

      {locked && (
        <div className="fmsg info">
          Záznam je v uzamknutom období alebo zmeny schvaľuje administrátor. Úprava aj vymazanie sa odošlú ako žiadosť.
        </div>
      )}

      {people && (
        <label className="fl">
          Zamestnanec
          <select name="employee_id" value={emp} onChange={(e) => setEmp(e.target.value)}>
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="fl">
        Neprítomnosť
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.code} – {t.name}
            </option>
          ))}
        </select>
      </label>

      <div className="fl" style={{ display: "grid", gap: 5, fontWeight: 600, fontSize: 13 }}>
        Rozsah
        <div className="seg" role="group" aria-label="Rozsah" style={{ justifySelf: "start" }}>
          {options.map((o) => (
            <button key={o.v} type="button" aria-pressed={p === o.v} onClick={() => setPart(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="part" value={p} />
      </div>

      <div className="row2">
        <label className="fl">
          {p === "full" ? "Od" : "Dátum"}
          <input type="date" name="date_from" defaultValue={init.date_from} required />
        </label>
        {p === "full" && (
          <label className="fl">
            Do
            <input type="date" name="date_to" defaultValue={init.date_to} />
          </label>
        )}
      </div>

      {p === "hrs" && (
        <div className="row2">
          <label className="fl">
            Čas od
            <input type="time" name="time_from" defaultValue={init.time_from} step={900} required />
          </label>
          <label className="fl">
            Čas do
            <input type="time" name="time_to" defaultValue={init.time_to || addMin(init.time_from, 120)} step={900} required />
          </label>
        </div>
      )}

      <div className="row2">
        <label className="fl">
          Zástup
          <select name="substitute_id" defaultValue={init.substitute_id}>
            <option value="">—</option>
            {subs
              .filter((x) => x.id !== emp)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        <label className="fl">
          Poznámka
          <input type="text" name="note" defaultValue={init.note} maxLength={300} />
        </label>
      </div>

      {needReason && (
        <label className="fl">
          Dôvod žiadosti
          {reasonMsg && <span className="muted" style={{ fontWeight: 400 }}>{reasonMsg}</span>}
          <textarea name="reason" required rows={3} />
        </label>
      )}

      {errors.length > 0 && (
        <div className="fmsg err">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <div className="acts">
        {init.id && (
          <button
            className="btn danger"
            data-act="del"
            formNoValidate
            disabled={deleting}
            onClick={(e) => {
              if (!confirm(needReason ? "Odoslať žiadosť o vymazanie záznamu?" : "Naozaj vymazať tento záznam?")) e.preventDefault();
            }}
          >
            {needReason ? "Žiadosť o vymazanie" : "Vymazať"}
          </button>
        )}
        <div className="row">
          <Link href={back} className="btn">
            Zrušiť
          </Link>
          <button className="btn primary" disabled={saving}>
            {saving ? "Ukladám…" : needReason ? "Odoslať žiadosť" : "Uložiť"}
          </button>
        </div>
      </div>
    </form>
  );
}
