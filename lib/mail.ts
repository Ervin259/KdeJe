import nodemailer from "nodemailer";

/**
 * Odoslanie e-mailu cez SMTP (Brevo – rovnaké údaje ako v Supabase → SMTP Settings).
 * Premenné vo Verceli: SMTP_USER (Login z Brevo), SMTP_PASS (SMTP kľúč),
 * voliteľne SMTP_HOST (smtp-relay.brevo.com), SMTP_PORT (587), MAIL_FROM (noreply@kdeje.app).
 * Bez nich sa e-mail neodošle (aplikácia funguje ďalej) a do logu sa zapíše upozornenie.
 */
export async function sendMail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!to) return false;
  if (!user || !pass) {
    console.warn(`[mail] chýba SMTP_USER / SMTP_PASS – e-mail „${subject}“ pre ${to} sa neodoslal`);
    return false;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  try {
    const tx = nodemailer.createTransport({
      host: process.env.SMTP_HOST?.trim() || "smtp-relay.brevo.com",
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await tx.sendMail({
      from: { name: process.env.MAIL_FROM_NAME ?? "KdeJe", address: process.env.MAIL_FROM ?? "noreply@kdeje.app" },
      to,
      subject,
      html,
    });
    return true;
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
