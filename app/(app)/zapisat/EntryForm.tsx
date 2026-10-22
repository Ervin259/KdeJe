"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveEntry, type FormState } from "./actions";

type AbsenceType = { code: string; name: string; parts: string[] };
type Person = { id: string; name: string };

export function EntryForm({
  types,
  people,
  meId,
  back,
  today,
}: {
  types: AbsenceType[];
  people: Person[] | null; // null = nie je admin
  meId: string;
  back: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEntry, {});
  const [type, setType] = useState(types[0]?.code ?? "DOV");
  const [part, setPart] = useState("full");
  const allowed = types.find((t) => t.code === type)?.parts ?? ["full"];

  const partOptions = [
    { v: "full", label: "Celý deň", need: "full" },
    { v: "am", label: "Dopoludnie", need: "half" },
    { v: "pm", label: "Popoludnie", need: "half" },
    { v: "hrs", label: "Hodiny", need: "hrs" },
  ].filter((o) => allowed.includes(o.need));
  const effectivePart = partOptions.some((o) => o.v === part) ? part : "full";

  return (
    <form action={action} className="card form">
      <input type="hidden" name="spat" value={back} />

      {people && (
        <label>
          Zamestnanec
          <select name="employee_id" defaultValue={meId}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        Neprítomnosť
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.code} – {t.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="seg">
        <legend>Rozsah</legend>
        {partOptions.map((o) => (
          <label key={o.v} className={effectivePart === o.v ? "seg-on" : undefined}>
            <input
              type="radio"
              name="part"
              value={o.v}
              checked={effectivePart === o.v}
              onChange={() => setPart(o.v)}
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      <div className="row2">
        <label>
          {effectivePart === "full" ? "Od" : "Dátum"}
          <input type="date" name="date_from" defaultValue={today} required />
        </label>
        {effectivePart === "full" && (
          <label>
            Do
            <input type="date" name="date_to" defaultValue={today} />
          </label>
        )}
      </div>

      {effectivePart === "hrs" && (
        <div className="row2">
          <label>
            Čas od
            <input type="time" name="time_from" defaultValue="08:30" step={900} required />
          </label>
          <label>
            Čas do
            <input type="time" name="time_to" defaultValue="10:30" step={900} required />
          </label>
        </div>
      )}

      <label>
        Poznámka
        <input type="text" name="note" maxLength={300} />
      </label>

      {state.needReason && (
        <label>
          Dôvod žiadosti
          <textarea name="reason" required rows={3} />
        </label>
      )}

      {state.error && <p className="err">{state.error}</p>}

      <div className="actions">
        <Link href={back} className="btn">
          Zrušiť
        </Link>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Ukladám…" : state.needReason ? "Odoslať žiadosť" : "Uložiť"}
        </button>
      </div>
    </form>
  );
}
