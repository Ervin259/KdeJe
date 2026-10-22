"use client";
import { useActionState } from "react";
import { approveRequest, rejectRequest, type ActState } from "./actions";

export function DecideForm({ id }: { id: string }) {
  const [a, approve, pa] = useActionState<ActState, FormData>(approveRequest, {});
  const [r, reject, pr] = useActionState<ActState, FormData>(rejectRequest, {});
  const pending = pa || pr;
  const error = a.error || r.error;
  return (
    <form className="req-act" action={approve}>
      <input type="hidden" name="id" value={id} />
      <input name="note" type="text" placeholder="Dôvod zamietnutia (nepovinné)" />
      <div className="row">
        <button className="btn danger" formAction={reject} disabled={pending}>
          Zamietnuť
        </button>
        <button className="btn primary" disabled={pending}>
          Schváliť
        </button>
      </div>
      {error && <div className="fmsg err">{error}</div>}
    </form>
  );
}
