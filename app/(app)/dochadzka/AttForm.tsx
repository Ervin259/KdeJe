"use client";
import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { resetAttendance, saveAttendance, type AttState } from "./actions";
import { hmm, toMin } from "@/lib/attendance";

export type AttInit = {
  employee_id: string;
  day: string;
  arrive: string;
  leave: string;
  break_start: string;
  break_min: number;
  note: string;
  /** existuje úprava (inak sú to predvolené časy) */
  edited: boolean;
};

export function AttForm({
  init,
  defaults,
  can,
  breakOpts,
  fond,
  daily,
  rules,
  people,
  back,
  locked,
}: {
  init: AttInit;
  defaults: { arrive: string; leave: string; break_start: string; break_min: number };
  /** čo smie meniť */
  can: { times: boolean; breakStart: boolean; breakLen: boolean };
  breakOpts: number[];
  /** fond dňa v hodinách */
  fond: number;
  /** fond sa musí odpracovať v ten istý deň (inak sa vyrovnáva v pružnom období) */
  daily: boolean;
  rules: string[];
  people: { id: string; name: string; href: string }[] | null;
  back: string;
  locked: boolean;
}) {
  const [state, save, saving] = useActionState<AttState, FormData>(saveAttendance, {});
  const [rstate, reset, resetting] = useActionState<AttState, FormData>(resetAttendance, {});
  const [v, setV] = useState({ a: init.arrive, l: init.leave, bs: init.break_start, bm: init.break_min });
  const worked = v.a && v.l ? Math.max(0, (toMin(v.l) - toMin(v.a) - v.bm) / 60) : 0;
  const diff = worked - fond;
  const needReason = locked || state.needReason || rstate.needReason;
  const errors = [...(state.error ?? []), ...(rstate.error ?? [])];
  const reasonMsg = state.reasonMsg || rstate.reasonMsg;
  const [act, setAct] = useState<"save" | "reset">(rstate.needReason ? "reset" : "save");

  return (
    <form
      className="fform"
      onSubmit={(e) => {
        e.preventDefault();
        const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(e.currentTarget, sub);
        startTransition(() => (sub?.dataset.act === "reset" ? reset(fd) : save(fd)));
      }}
    >
      <input type="hidden" name="spat" value={back} />
      <input type="hidden" name="day" value={init.day} />
      <input type="hidden" name="employee_id" value={init.employee_id} />

      {locked && <div className="fmsg info">Deň je v uzamknutom období alebo zmeny schvaľuje administrátor. Úprava sa odošle ako žiadosť.</div>}

      {people && (
        <label className="fl">
          Zamestnanec
          <select
            value={init.employee_id}
            onChange={(e) => {
              const p = people.find((x) => x.id === e.target.value);
              if (p) window.location.href = p.href;
            }}
          >
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="row2">
        <label className="fl">
          Príchod
          <input type="time" name="arrive" step={300} value={v.a} onChange={(e) => setV({ ...v, a: e.target.value })} readOnly={!can.times} required />
        </label>
        <label className="fl">
          Odchod
          <input type="time" name="leave" step={300} value={v.l} onChange={(e) => setV({ ...v, l: e.target.value })} readOnly={!can.times} required />
        </label>
      </div>

      <div className="row2">
        <label className="fl">
          Prestávka od
          <input
            type="time"
            name="break_start"
            step={300}
            value={v.bs}
            onChange={(e) => setV({ ...v, bs: e.target.value })}
            readOnly={!can.breakStart}
            disabled={v.bm === 0}
          />
        </label>
        <label className="fl">
          Dĺžka prestávky
          {can.breakLen ? (
            <select name="break_min" value={v.bm} onChange={(e) => setV({ ...v, bm: Number(e.target.value) })}>
              {breakOpts.map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="text" value={`${v.bm} min`} readOnly />
              <input type="hidden" name="break_min" value={v.bm} />
            </>
          )}
        </label>
      </div>

      <div className={`attsum${daily && Math.abs(diff) > 1 / 120 ? " warn" : ""}`}>
        <span>
          Odpracované <b>{hmm(worked)} h</b>
        </span>
        <span>
          fond <b>{hmm(fond)} h</b>
        </span>
        <span>
          rozdiel <b className={diff > 1 / 120 ? "plus" : diff < -1 / 120 ? "minus" : ""}>{diff > 1 / 120 ? "+" : ""}{hmm(diff)} h</b>
        </span>
        {(v.a !== defaults.arrive || v.l !== defaults.leave || v.bs !== defaults.break_start || v.bm !== defaults.break_min) && (
          <button
            type="button"
            className="linkbtn"
            onClick={() => setV({ a: defaults.arrive, l: defaults.leave, bs: defaults.break_start, bm: defaults.break_min })}
          >
            nastaviť predvolené {defaults.arrive}–{defaults.leave}
          </button>
        )}
      </div>

      <label className="fl">
        Poznámka
        <input type="text" name="note" defaultValue={init.note} maxLength={300} placeholder="Napr. lekár ráno, služobné stretnutie…" />
      </label>

      <ul className="attrules muted">
        {rules.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      {needReason && init.edited && (
        <div className="fl" style={{ display: "grid", gap: 5, fontWeight: 600, fontSize: 13 }}>
          Žiadosť o
          <div className="seg" role="group" aria-label="Druh žiadosti" style={{ justifySelf: "start" }}>
            <button type="button" aria-pressed={act === "save"} onClick={() => setAct("save")}>
              Zmenu dochádzky
            </button>
            <button type="button" aria-pressed={act === "reset"} onClick={() => setAct("reset")}>
              Vrátenie na predvolené
            </button>
          </div>
        </div>
      )}
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
        {needReason ? (
          <>
            <span />
            <div className="row">
              <Link href={back} className="btn">
                Zrušiť
              </Link>
              {act === "reset" && init.edited ? (
                <button className="btn reqbtn req-del" data-act="reset" disabled={resetting}>
                  {resetting ? "Odosielam…" : "Odoslať žiadosť o vrátenie"}
                </button>
              ) : (
                <button className={`btn reqbtn ${init.edited ? "req-edit" : "req-new"}`} disabled={saving}>
                  {saving ? "Odosielam…" : init.edited ? "Odoslať žiadosť o zmenu" : "Odoslať žiadosť o úpravu"}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {init.edited ? (
              <button
                className="btn danger"
                data-act="reset"
                formNoValidate
                disabled={resetting}
                title="Zmaže úpravu – deň sa bude počítať s predvolenými časmi"
                onClick={(e) => {
                  if (!confirm("Vrátiť tento deň na predvolené časy?")) e.preventDefault();
                }}
              >
                Vrátiť na predvolené
              </button>
            ) : (
              <span />
            )}
            <div className="row">
              <Link href={back} className="btn">
                Zrušiť
              </Link>
              <button className="btn primary" disabled={saving}>
                {saving ? "Ukladám…" : "Uložiť"}
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
