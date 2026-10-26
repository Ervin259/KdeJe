/**
 * Odoslanie e-mailu cez Brevo (transakčné API). Kľúč je v premennej BREVO_API_KEY vo Verceli.
 * Bez kľúča sa e-mail neodošle (aplikácia funguje ďalej) a do logu sa zapíše upozornenie.
 */
export async function sendMail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  const key = process.env.BREVO_API_KEY?.trim();
  if (!to) return false;
  if (!key) {
    console.warn(`[mail] chýba BREVO_API_KEY – e-mail „${subject}“ pre ${to} sa neodoslal`);
    return false;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.MAIL_FROM_NAME ?? "KdeJe", email: process.env.MAIL_FROM ?? "noreply@kdeje.app" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) console.warn(`[mail] Brevo odmietol e-mail „${subject}“: ${res.status} ${await res.text()}`);
    return res.ok;
  } catch (e) {
    console.warn(`[mail] e-mail „${subject}“ sa nepodarilo odoslať:`, e);
    return false;
  }
}

const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Jednoduchý e-mail: nadpis, riadky „Popis: hodnota“ a tlačidlo. */
export function mailHtml(title: string, rows: [string, string | number | null | undefined][], button?: { href: string; label: string }) {
  const tr = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#596379">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`)
    .join("");
  const btn = button
    ? `<p style="margin-top:18px"><a href="${esc(button.href)}" style="display:inline-block;background:#2944C2;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(button.label)}</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#161D2B"><h2 style="margin:0 0 12px">${esc(title)}</h2><table>${tr}</table>${btn}<p style="color:#596379;font-size:12px;margin-top:24px">KdeJe · kdeje.app</p></div>`;
}
