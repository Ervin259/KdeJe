"use client";
import { useActionState } from "react";
import { submitSignup, type SignupState } from "./actions";

export function SignupForm() {
  const [st, act, pending] = useActionState<SignupState, FormData>(submitSignup, {});
  if (st.ok)
    return (
      <div className="signup-card done">
        <h2>Ďakujeme, žiadosť sme prijali</h2>
        <p>
          Po schválení príde {st.email ? <b>{st.email}</b> : "adminovi"} pozvánka do KdeJe. Odkaz v nej otvorte v prehliadači, v ktorom chcete
          aplikáciu používať.
        </p>
      </div>
    );
  return (
    <form action={act} className="signup-card">
      <label>
        <span>Názov firmy *</span>
        <input name="company" required maxLength={200} autoComplete="organization" />
      </label>
      <div className="signup-two">
        <label>
          <span>IČO</span>
          <input name="ico" inputMode="numeric" maxLength={12} />
        </label>
        <label>
          <span>Počet užívateľov</span>
          <input name="employees" type="number" min={1} max={10000} />
        </label>
      </div>
      <label>
        <span>Meno a priezvisko admina *</span>
        <input name="name" required maxLength={200} autoComplete="name" />
      </label>
      <div className="signup-two">
        <label>
          <span>Pracovný e-mail admina *</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" placeholder="meno@firma.sk" />
        </label>
        <label>
          <span>Telefón</span>
          <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </label>
      </div>
      <label>
        <span>Poznámka</span>
        <textarea name="note" rows={3} maxLength={2000} placeholder="Napr. ako dnes evidujete dovolenky alebo čo by ste potrebovali" />
      </label>
      <input name="web" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      <label className="signup-consent">
        <input type="checkbox" name="consent" required />
        <span>
          Súhlasím s <a href="/podmienky" target="_blank">obchodnými podmienkami</a> a beriem na vedomie{" "}
          <a href="/ochrana-udajov" target="_blank">spracúvanie osobných údajov</a>.
        </span>
      </label>
      {st.error && <div className="fmsg err">{st.error}</div>}
      <button className="btn primary big-btn" disabled={pending}>
        {pending ? "Odosielam…" : "Odoslať žiadosť"}
      </button>
    </form>
  );
}
