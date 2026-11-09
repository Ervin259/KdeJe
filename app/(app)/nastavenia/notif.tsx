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
export type NotifPreview = { name: string; email: string | null; over: string };
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 120 }} className="nprev">
            {preview.map((p) => (
              <span key={p.name} className={`pill${p.email ? "" : " warn"}`} title={p.email ? p.email : "Bez e-mailu – upozornenie sa nepošle"}>
                {p.name} · {p.over}
              </span>
            ))}
          </div>
        )}
        <form action={send} className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <input type="hidden" name="id" value={r.id} />
          {sendState.ok && <span className="muted" style={{ fontSize: 12.5 }}>{sendState.ok}</span>}
          {sendState.error && <span style={{ fontSize: 12.5, color: "var(--bad)" }}>{sendState.error.join(" ")}</span>}
          <button
            className="btn sm"
            disabled={sending || !withMail}
            onClick={(e) => !confirm(`Poslať upozornenie teraz ${withMail} ${withMail === 1 ? "zamestnancovi" : "zamestnancom"}?`) && e.preventDefault()}
          >
            {sending ? "Odosielam…" : "Odoslať teraz"}
          </button>
        </form>
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
