"use client";
import { useActionState } from "react";
import { approveSignup, rejectSignup, resendInvite, type FirmState } from "./actions";

export function DecideSignup({ id }: { id: string }) {
  const [a, approve, pa] = useActionState<FirmState, FormData>(approveSignup, {});
  const [r, reject, pr] = useActionState<FirmState, FormData>(rejectSignup, {});
  const st = a.ok || a.error ? a : r;
  return (
    <form className="req-act" action={approve}>
      <input type="hidden" name="id" value={id} />
      <input name="reason" type="text" placeholder="Dôvod zamietnutia (nepovinné)" />
      <div className="row">
        <button className="btn danger" formAction={reject} disabled={pa || pr}>
          Zamietnuť
        </button>
        <button className="btn primary" disabled={pa || pr}>
          {pa ? "Zakladám…" : "Schváliť a poslať pozvánku"}
        </button>
      </div>
      {st.error && <div className="fmsg err">{st.error}</div>}
      {st.ok && <div className="fmsg ok">{st.ok}</div>}
    </form>
  );
}

export function ResendInvite({ email }: { email: string }) {
  const [st, act, p] = useActionState<FirmState, FormData>(resendInvite, {});
  return (
    <form action={act} className="row" style={{ gap: 8 }}>
      <input type="hidden" name="email" value={email} />
      <button className="linkbtn" disabled={p} title={`Poslať pozvánku znova na ${email}`}>
        {p ? "Posielam…" : st.ok ? "Odoslané ✓" : "Poslať pozvánku znova"}
      </button>
      {st.error && <span className="fmsg err">{st.error}</span>}
    </form>
  );
}
