"use client";
import { useActionState, useState } from "react";
import { saveNotifRule, sendNotifNow, type SetState } from "./actions";

export type NotifRuleView = {
  id: string;
  kind: string;
  title: string;
  desc: string;
  enabled: boolean;
  dates: string[]; // MM-DD
  notify_admin: boolean;
};
export type NotifPreview = { id: string; name: string; email: string | null; over: string };
export type NotifLog = { day: string; n: number; ok: number; info: string };

const mmdd = (s: string) => `${Number(s.slice(3, 5))}. ${Number(s.slice(0, 2))}.`;
const fday = (s: string) => `${Number(s.slice(8, 10))}. ${Number(s.slice(5, 7))}. ${s.slice(0, 4)}`;

/** Nastavenia → Všeobecné → Notifikácie: pravidlá e-mailových upozornení firmy. */
export function NotifRules({ rules, preview, logs }: { rules: NotifRuleView[]; preview: NotifPreview[]; logs: Record<string, NotifLog[]> }) {
  return (
    <div className="grplist">
      {rules.map((r) => (
        <NotifRuleCard key={r.id} r={r} preview={preview} logs={logs[r.id] ?? []} />
      ))}
    </div>
  );
}

function NotifRuleCard({ r, preview, logs }: { r: NotifRuleView; preview: NotifPreview[]; logs: NotifLog[] }) {
  const [state, action, pending] = useActionState<SetState, FormData>(saveNotifRule, {});
  const [sendState, send, sending] = useActionState<SetState, FormData>(sendNotifNow, {});
  const [on, setOn] = useState(r.enabled);
  const withMail = preview.filter((p) => p.email).length;
  const [test, setTest] = useState(false);
  // vybraní: predvolene nikto – aby sa omylom neposlalo všetkým
  const [sel, setSel] = useState<Set<string>>(new Set());
  const can = preview.filter((p) => test || p.email);
  const chosen = can.filter((p) => sel.has(p.id));
  const allOn = can.length > 0 && chosen.length === can.length;
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <div className="grpcard">
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input type="hidden" name="id" value={r.id} />
        <div className="crow">
          <b style={{ fontSize: 14 }}>{r.title}</b>
          <span style={{ flex: 1 }} />
          <label className="ctog">
            <input type="checkbox" name="enabled" checked={on} onChange={(e) => setOn(e.target.checked)} />
            <span>{on ? "zapnuté" : "vypnuté"}</span>
          </label>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          {r.desc}
        </p>
        <div className="crow">
          <label className="cl" htmlFor={`nd-${r.id}`}>
            Kedy poslať
          </label>
          <input
            id={`nd-${r.id}`}
            className="ci"
            style={{ width: 260 }}
            name="dates"
            defaultValue={r.dates.map(mmdd).join(", ")}
            placeholder="napr. 1. 10., 1. 11., 1. 12."
          />
          <span className="ct">každý rok, ráno</span>
        </div>
        <div className="crow">
          <span className="cl">Admin</span>
          <label className="ctog">
            <input type="checkbox" name="notify_admin" defaultChecked={r.notify_admin} />
            <span>poslať aj súhrn adminom firmy</span>
          </label>
        </div>
        {state.error && (
          <div className="msgs">
            {state.error.map((e, i) => (
              <div key={i} className="e">
                {e}
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          {state.ok && !pending && <span className="muted" style={{ fontSize: 12.5 }}>Uložené</span>}
          <button className="btn sm primary" disabled={pending}>
            Uložiť
          </button>
        </div>
      </form>

      <div style={{ borderTop: "1px solid var(--grid)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="crow">
          <span className="cl">Dnes by dostali</span>
          {preview.length ? (
            <span className="ct">
              {withMail} {withMail === 1 ? "zamestnanec" : withMail > 1 && withMail < 5 ? "zamestnanci" : "zamestnancov"}
              {preview.length > withMail ? ` · ${preview.length - withMail} bez e-mailu` : ""}
            </span>
          ) : (
            <span className="ct">nikto – nikto nemá čo dočerpať</span>
          )}
        </div>
        {preview.length > 0 && (
          <form action={send} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="hidden" name="id" value={r.id} />
            <div className="nsel">
              <label className="ctog nall">
                <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(can.map((p) => p.id)))} />
                <span>všetci</span>
              </label>
              {preview.map((p) => {
                const dis = !test && !p.email;
                return (
                  <label key={p.id} className={`ctog npick${dis ? " dis" : ""}`} title={p.email ?? "Bez e-mailu – upozornenie sa nepošle"}>
                    <input type="checkbox" name="emp" value={p.id} disabled={dis} checked={!dis && sel.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>
                      {p.name} · <b>{p.over}</b>
                      {!p.email && <span className="muted"> · bez e-mailu</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="row" style={{ gap: 10, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
              <label className="ctog" title="E-maily vybraných ľudí prídu len na váš e-mail; nikomu inému sa nepošlú a nezapíšu sa medzi odoslané">
                <input type="checkbox" name="test" checked={test} onChange={(e) => setTest(e.target.checked)} />
                <span>skúška – poslať len mne</span>
              </label>
              {sendState.ok && <span className="muted" style={{ fontSize: 12.5 }}>{sendState.ok}</span>}
              {sendState.error && <span style={{ fontSize: 12.5, color: "var(--bad)" }}>{sendState.error.join(" ")}</span>}
              <button
                className={`btn sm${test ? "" : " primary"}`}
                disabled={sending || !chosen.length}
                onClick={(e) =>
                  !test && !confirm(`Poslať upozornenie teraz ${chosen.length} ${chosen.length === 1 ? "zamestnancovi" : "zamestnancom"}?`) && e.preventDefault()
                }
              >
                {sending ? "Odosielam…" : test ? `Poslať mne (${chosen.length})` : `Odoslať vybraným (${chosen.length})`}
              </button>
            </div>
          </form>
        )}
        {logs.length > 0 && (
          <div className="crow" style={{ alignItems: "flex-start" }}>
            <span className="cl">Odoslané</span>
            <span className="ct" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {logs.map((l) => (
                <span key={l.day}>
                  {fday(l.day)} – {l.info}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
