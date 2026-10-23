import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Serverový klient s kľúčom service_role – len na pozývanie používateľov.
 * Kľúč je v premennej SUPABASE_SERVICE_ROLE_KEY (bez NEXT_PUBLIC_), takže sa nikdy nedostane do prehliadača.
 * Tento súbor sa smie importovať len zo serverového kódu.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Obyčajný klient bez cookies (implicitný tok) – na opätovné poslanie prihlasovacieho odkazu. */
export function publicClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
}

export type AuthInfo = { invited_at: string | null; last_sign_in_at: string | null };

/** Stav účtov podľa e-mailu (malými písmenami). Bez service_role kľúča vráti null. */
export async function authUsersByEmail(): Promise<Map<string, AuthInfo> | null> {
  const admin = adminClient();
  if (!admin) return null;
  const out = new Map<string, AuthInfo>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    for (const u of data.users) {
      if (u.email)
        out.set(u.email.toLowerCase(), {
          invited_at: u.invited_at ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
    }
    if (data.users.length < 1000) break;
  }
  return out;
}
