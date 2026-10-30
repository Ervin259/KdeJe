"use client";
import { useActionState } from "react";
import { approveSignup, saveCompanyAdmin, cancelInvoice, issueInvoices, markPaid, rejectSignup, resendInvite, saveSupplier, saveHolidayDraft, runDailyNow, setExempt, type FirmState } from "./actions";
import type { PlatformSettings } from "@/lib/billing";
import { switchCompany } from "@/components/companyActions";

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

const Msg = ({ st }: { st: FirmState }) =>
  st.error ? <span className="fmsg err">{st.error}</span> : st.ok ? <span className="fmsg ok">{st.ok}</span> : null;

export function IssueInvoices({ count }: { count: number }) {
  const [st, act, p] = useActionState<FirmState, FormData>(issueInvoices, {});
  return (
    <form action={act} className="row" style={{ gap: 10 }}>
      <button className="btn primary" disabled={p || !count}>
        {p ? "Vystavujem…" : `Vystaviť faktúry (${count})`}
      </button>
      <Msg st={st} />
    </form>
  );
}

export function InvoiceActions({ id, today }: { id: string; today: string }) {
  const [a, pay, pp] = useActionState<FirmState, FormData>(markPaid, {});
  const [c, cancel, pc] = useActionState<FirmState, FormData>(cancelInvoice, {});
  return (
    <form action={pay} className="row invact">
      <input type="hidden" name="id" value={id} />
      <input type="date" name="paid_on" defaultValue={today} aria-label="Dátum úhrady" />
      <button className="btn" disabled={pp || pc}>
        Uhradená
      </button>
      <button className="linkbtn" formAction={cancel} disabled={pp || pc}>
        Stornovať
      </button>
      <Msg st={a.error || a.ok ? a : c} />
    </form>
  );
}

export function ExemptToggle({ id, exempt }: { id: string; exempt: boolean }) {
  const [st, act, p] = useActionState<FirmState, FormData>(setExempt, {});
  return (
    <form action={act} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="exempt" value={exempt ? "0" : "1"} />
      <button className="linkbtn" disabled={p} title={exempt ? "Firma sa nefakturuje – zapnúť fakturáciu" : "Vypnúť fakturáciu pre túto firmu"}>
        {exempt ? "nefakturuje sa" : "fakturuje sa"}
      </button>
      {st.error && <span className="fmsg err">{st.error}</span>}
    </form>
  );
}

export function SupplierForm({ s }: { s: PlatformSettings }) {
  const [st, act, p] = useActionState<FirmState, FormData>(saveSupplier, {});
  const f = (name: keyof PlatformSettings, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      <span>{label}</span>
      <input name={name} defaultValue={String(s[name] ?? "")} {...extra} />
    </label>
  );
  return (
    <form action={act} className="supform">
      <div className="supgrid">
        {f("supplier_name", "Obchodné meno")}
        {f("supplier_address", "Sídlo / miesto podnikania")}
        {f("supplier_ico", "IČO")}
        {f("supplier_dic", "DIČ")}
        {f("supplier_register", "Zápis v registri", { placeholder: "napr. Živnostenský register OÚ Košice, č. …" })}
        {f("supplier_email", "E-mail pre zákazníkov", { type: "email" })}
        {f("supplier_phone", "Telefón")}
        {f("iban", "IBAN na úhrady")}
        {f("notify_email", "Upozornenia (nové žiadosti) posielať na", { type: "email" })}
      </div>
      <div className="supgrid small">
        {f("price_month", "Cena € / zamestnanec / mesiac", { inputMode: "decimal" })}
        {f("min_employees", "Minimum zamestnancov", { type: "number", min: 0 })}
        {f("trial_months", "Mesiacov zdarma", { type: "number", min: 0 })}
        {f("due_days", "Splatnosť (dní)", { type: "number", min: 1 })}
        {f("grace_days", "Lehota po splatnosti (dní)", { type: "number", min: 0 })}
        {f("delete_after_days", "Vymazanie po obmedzení (dní)", { type: "number", min: 30 })}
      </div>
      <div className="row">
        <button className="btn primary" disabled={p}>
          Uložiť
        </button>
        <Msg st={st} />
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        Tieto údaje sa zobrazujú v obchodných podmienkach na kdeje.app/podmienky a firmám pri platobných údajoch.
      </p>
    </form>
  );
}

/** Vstup superadmina do firmy (podpora, kontrola údajov). */
export function EnterCompany({ id }: { id: string }) {
  return (
    <form action={() => switchCompany(id)} style={{ display: "inline" }}>
      <button className="btn" style={{ height: 28, padding: "0 10px" }}>
        Otvoriť
      </button>
    </form>
  );
}

type CompanyRow = {
  id: string;
  name: string;
  ico: string | null;
  address: string | null;
  billing_name: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_zip: string | null;
  billing_dic: string | null;
  billing_icdph: string | null;
  billing_email: string | null;
  billing_phone: string | null;
};

/** Formulár superadmina na úpravu firmy. */
export function CompanyEdit({ c }: { c: CompanyRow }) {
  const [st, act, p] = useActionState<FirmState, FormData>(saveCompanyAdmin, {});
  const f = (name: keyof CompanyRow, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      <span>{label}</span>
      <input name={name} defaultValue={String(c[name] ?? "")} {...extra} />
    </label>
  );
  return (
    <form action={act} className="supform">
      <input type="hidden" name="id" value={c.id} />
      <h3>Firma</h3>
      <div className="supgrid">
        {f("name", "Názov firmy", { required: true })}
        {f("ico", "IČO", { inputMode: "numeric" })}
        {f("address", "Adresa sídla")}
      </div>
      <h3>Fakturačné údaje</h3>
      <div className="supgrid">
        {f("billing_name", "Odberateľ na faktúre", { placeholder: c.name })}
        {f("billing_street", "Ulica a číslo")}
        {f("billing_zip", "PSČ")}
        {f("billing_city", "Mesto")}
        {f("billing_dic", "DIČ")}
        {f("billing_icdph", "IČ DPH", { placeholder: "SK…" })}
        {f("billing_email", "E-mail na faktúry", { type: "email" })}
        {f("billing_phone", "Telefón", { type: "tel" })}
      </div>
      <div className="row">
        <button className="btn primary" disabled={p}>
          Uložiť
        </button>
        <Msg st={st} />
      </div>
    </form>
  );
}

/** Návrh štátnych sviatkov – úprava a potvrdenie superadminom. */
export function HolidayDraft({ year, rows }: { year: number; rows: { date: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FirmState, FormData>(saveHolidayDraft, {});
  const list = [...rows, { date: "", name: "" }, { date: "", name: "" }];
  return (
    <form action={action} className="holdraft">
      <input type="hidden" name="year" value={year} />
      <table className="t">
        <thead>
          <tr>
            <th style={{ width: 170 }}>Dátum</th>
            <th>Názov</th>
            <th className="c" style={{ width: 90 }}>Vynechať</th>
          </tr>
        </thead>
        <tbody>
          {list.map((h, i) => (
            <tr key={`${h.date}-${i}`}>
              <td>
                <input type="date" name="date" defaultValue={h.date} min={`${year}-01-01`} max={`${year}-12-31`} />
              </td>
              <td>
                <input type="text" name="name" defaultValue={h.name} placeholder={h.date ? "" : "Doplniť sviatok…"} style={{ width: "100%" }} />
              </td>
              <td className="c">{h.date && <input type="checkbox" name="del" value={i} aria-label={`Vynechať ${h.name}`} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.error && <div className="fmsg err">{state.error}</div>}
      {state.ok && <div className="fmsg ok">{state.ok}</div>}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn" name="confirm" value="0" disabled={pending}>
          Uložiť úpravy
        </button>
        <button className="btn primary" name="confirm" value="1" disabled={pending}>
          Potvrdiť a zapísať do všetkých firiem
        </button>
      </div>
    </form>
  );
}

export function RunDaily() {
  const [s, action, pending] = useActionState<FirmState, FormData>(runDailyNow, {});
  return (
    <form action={action} className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <button className="btn" disabled={pending} title="Úloha beží sama každú noc. Tu ju môžete spustiť hneď.">
        {pending ? "Beží…" : "Spustiť dennú úlohu teraz"}
      </button>
      {s.ok && <span className="muted" style={{ fontSize: 13 }}>{s.ok}</span>}
      {s.error && <span style={{ color: "var(--bad)", fontSize: 13 }}>{s.error}</span>}
    </form>
  );
}
