/**
 * Text e-mailov notifikácií (bez serverových závislostí – používa ho aj náhľad v Nastaveniach).
 * Firma si v pravidle môže upraviť predmet a text; prázdne = predvolený text.
 * Značky v {zátvorkách} sa nahradia hodnotami zamestnanca, **text** = tučné, prázdny riadok = nový odsek.
 */

export const VAC_VARS: [string, string][] = [
  ["meno", "meno a priezvisko"],
  ["firma", "názov firmy"],
  ["rok", "rok"],
  ["zostatok", "zostatok dovolenky"],
  ["prenos", "koľko sa prenáša do nového roka"],
  ["dočerpať", "koľko treba dočerpať do 31. 12."],
];

export const VAC_DEFAULT = {
  subject: "Dočerpanie dovolenky do 31. 12. {rok}",
  body: [
    "Dobrý deň, {meno},",
    "",
    "podľa evidencie v KdeJe máte do 31. 12. {rok} dočerpať **{dočerpať}** dovolenky.",
    "",
    "Zostatok dovolenky: {zostatok}",
    "Do nového roka sa prenáša najviac: {prenos}",
    "",
    "Naplánujte si ju, prosím, v kalendári KdeJe.",
  ].join("\n"),
};

const norm = (k: string) => k.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const KNOWN = new Set(VAC_VARS.map(([k]) => norm(k)));

/** Neznáme značky v texte (napr. preklep {zostatk}). */
export function unknownVars(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\{([^{}]*)\}/g)) if (!KNOWN.has(norm(m[1]))) out.add(`{${m[1]}}`);
  return [...out];
}

/** Nahradí značky hodnotami (bez ohľadu na diakritiku a veľkosť písmen: {docerpat} = {dočerpať}). */
export function fill(t: string, vars: Record<string, string>): string {
  const v = Object.fromEntries(Object.entries(vars).map(([k, x]) => [norm(k), x]));
  return t.replace(/\{([^{}]*)\}/g, (all, k: string) => v[norm(k)] ?? all);
}

/** „3 dni“, „1 deň“, „12,5 dňa“ */
export function days(n: number): string {
  const s = String(Math.round(n * 100) / 100).replace(".", ",");
  if (!Number.isInteger(n)) return `${s} dňa`;
  return `${s} ${n === 1 ? "deň" : n > 1 && n < 5 ? "dni" : "dní"}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Text e-mailu → HTML (odseky, zalomenia, **tučné**), s tlačidlom a pätičkou KdeJe. */
export function textMailHtml(text: string, button?: { href: string; label: string }): string {
  const paras = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`)
    .join("");
  const btn = button
    ? `<p style="margin-top:18px"><a href="${esc(button.href)}" style="display:inline-block;background:#2944C2;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(button.label)}</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#161D2B">${paras}${btn}<p style="color:#596379;font-size:12px;margin-top:24px">KdeJe · kdeje.app</p></div>`;
}

export type VacMail = { name: string; firm: string; year: string; left: number; carry: number; over: number };

/** Hotový e-mail pre zamestnanca podľa textu pravidla (prázdne = predvolený). */
export function vacMail(rule: { subject?: string | null; body?: string | null }, m: VacMail, origin: string) {
  const vars = { meno: m.name, firma: m.firm, rok: m.year, zostatok: days(m.left), prenos: days(m.carry), "dočerpať": days(m.over) };
  return {
    subject: fill(rule.subject?.trim() || VAC_DEFAULT.subject, vars),
    html: textMailHtml(fill(rule.body?.trim() || VAC_DEFAULT.body, vars), { href: `${origin}/moj-prehlad`, label: "Otvoriť môj prehľad" }),
  };
}
