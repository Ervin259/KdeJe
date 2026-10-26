import { createClient } from "@/lib/supabase/server";

/** Údaje dodávateľa a pravidlá fakturácie (tabuľka platform_settings, jeden riadok). */
export type PlatformSettings = {
  supplier_name: string | null;
  supplier_address: string | null;
  supplier_ico: string | null;
  supplier_dic: string | null;
  supplier_register: string | null;
  supplier_email: string | null;
  supplier_phone: string | null;
  iban: string | null;
  price_month: number;
  min_employees: number;
  trial_months: number;
  due_days: number;
  grace_days: number;
  delete_after_days: number;
  vat_payer: boolean;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  supplier_name: null,
  supplier_address: null,
  supplier_ico: null,
  supplier_dic: null,
  supplier_register: null,
  supplier_email: null,
  supplier_phone: null,
  iban: null,
  price_month: 1,
  min_employees: 5,
  trial_months: 3,
  due_days: 14,
  grace_days: 14,
  delete_after_days: 90,
  vat_payer: false,
};

export async function loadPlatformSettings(): Promise<PlatformSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...data, price_month: Number(data.price_month) };
}

export type Invoice = {
  id: string;
  company_id: string;
  vs: string;
  issued_on: string;
  due_on: string;
  period_from: string;
  period_to: string;
  employees: number;
  billed_qty: number;
  months: number;
  unit_price: number;
  amount: number;
  status: "issued" | "paid" | "cancelled";
  paid_on: string | null;
  exported_at: string | null;
  note: string | null;
  /** doúčtovanie: užívateľo-mesiace nad zaplatený počet v predchádzajúcom období */
  extra_units: number;
  extra_amount: number;
  extra_from: string | null;
  extra_to: string | null;
};

export type BillingCompany = {
  id: string;
  name: string;
  ico: string | null;
  status: string;
  trial_until: string | null;
  paid_until: string | null;
  billing_exempt: boolean;
  created_at: string;
  employees: number;
  admins: string | null;
  billing_name: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_zip: string | null;
  billing_dic: string | null;
  billing_email: string | null;
  writable: boolean;
};

// ---------- dátumy (YYYY-MM-DD) ----------
export const addDays = (d: string, n: number) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
export const addMonths = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
};
export const fdate = (d: string | null) => (d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : "");
export const eur = (n: number) =>
  new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);

/** Účtovaný počet zamestnancov a ročná suma. */
export function yearlyPrice(employees: number, s: PlatformSettings) {
  const qty = Math.max(employees, s.min_employees);
  return { qty, amount: Math.round(qty * 12 * s.price_month * 100) / 100 };
}

/** Návrh ďalšej faktúry pre firmu (alebo null, ak ešte netreba fakturovať). Fakturuje sa 30 dní pred koncom obdobia. */
export function nextInvoice(c: BillingCompany, invoices: Invoice[], s: PlatformSettings, today: string) {
  if (c.billing_exempt || c.status === "suspended") return null;
  const end = c.paid_until ?? c.trial_until;
  if (!end || end > addDays(today, 30)) return null;
  const covered = invoices.some((i) => i.company_id === c.id && i.status !== "cancelled" && i.period_to > end);
  if (covered) return null;
  const from = addDays(end, 1) > today ? addDays(end, 1) : today;
  const to = addDays(addMonths(from, 12), -1);
  const { qty, amount } = yearlyPrice(Number(c.employees), s);
  // predchádzajúce zaplatené obdobie – z neho sa doúčtujú pridaní užívatelia
  const prev = invoices.find((i) => i.company_id === c.id && i.status !== "cancelled" && i.period_to === end) ?? null;
  return { from, to, qty, amount, employees: Number(c.employees), prev };
}

/** Plurál: 1 mesiac, 2–4 mesiace, 5+ mesiacov. */
export const months = (n: number) => `${n} ${n === 1 ? "mesiac" : n >= 2 && n <= 4 ? "mesiace" : "mesiacov"}`;

// ---------- export do Pohody (XML, schéma version_2) ----------
const x = (v: string | number | null | undefined) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Vydané faktúry ako dátový balík Pohody (import cez Súbor → Datová komunikácia → XML import/export). */
export function pohodaXml(invoices: Invoice[], companies: BillingCompany[], s: PlatformSettings) {
  const items = invoices
    .map((i) => {
      const c = companies.find((k) => k.id === i.company_id);
      const name = c?.billing_name || c?.name || "";
      const period = `${fdate(i.period_from)} – ${fdate(i.period_to)}`;
      return `  <dat:dataPackItem id="KdeJe-${x(i.vs)}" version="2.0">
    <inv:invoice version="2.0">
      <inv:invoiceHeader>
        <inv:invoiceType>issuedInvoice</inv:invoiceType>
        <inv:symVar>${x(i.vs)}</inv:symVar>
        <inv:date>${i.issued_on}</inv:date>
        <inv:dateAccounting>${i.issued_on}</inv:dateAccounting>
        <inv:dateDue>${i.due_on}</inv:dateDue>
        <inv:text>${x(`Predplatné KdeJe ${period}`)}</inv:text>
        <inv:partnerIdentity>
          <typ:address>
            <typ:company>${x(name)}</typ:company>
            <typ:city>${x(c?.billing_city)}</typ:city>
            <typ:street>${x(c?.billing_street)}</typ:street>
            <typ:zip>${x(c?.billing_zip)}</typ:zip>
            <typ:ico>${x(c?.ico)}</typ:ico>
            <typ:dic>${x(c?.billing_dic)}</typ:dic>
            <typ:email>${x(c?.billing_email)}</typ:email>
          </typ:address>
        </inv:partnerIdentity>
        <inv:paymentType>
          <typ:paymentType>draft</typ:paymentType>
        </inv:paymentType>
        <inv:note>${x(`KdeJe · ${i.employees} aktívnych užívateľov, účtovaných ${i.billed_qty}`)}</inv:note>
      </inv:invoiceHeader>
      <inv:invoiceDetail>
        <inv:invoiceItem>
          <inv:text>${x(`Predplatné aplikácie KdeJe, ${period}`)}</inv:text>
          <inv:quantity>${i.billed_qty * i.months}</inv:quantity>
          <inv:unit>${x("už./mes.")}</inv:unit>
          <inv:rateVAT>none</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>${Number(i.unit_price).toFixed(2)}</typ:unitPrice>
          </inv:homeCurrency>
        </inv:invoiceItem>${
          i.extra_units > 0
            ? `
        <inv:invoiceItem>
          <inv:text>${x(`Doúčtovanie užívateľov pridaných v období ${fdate(i.extra_from)} – ${fdate(i.extra_to)}`)}</inv:text>
          <inv:quantity>${i.extra_units}</inv:quantity>
          <inv:unit>${x("už./mes.")}</inv:unit>
          <inv:rateVAT>none</inv:rateVAT>
          <inv:homeCurrency>
            <typ:unitPrice>${Number(i.unit_price).toFixed(2)}</typ:unitPrice>
          </inv:homeCurrency>
        </inv:invoiceItem>`
            : ""
        }
      </inv:invoiceDetail>
    </inv:invoice>
  </dat:dataPackItem>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack id="KdeJe" ico="${x((s.supplier_ico ?? "").replace(/\s/g, ""))}" application="KdeJe" version="2.0" note="Faktury KdeJe"
  xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
  xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
  xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
${items}
</dat:dataPack>
`;
}
