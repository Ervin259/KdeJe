/**
 * Adresa a kľúč Supabase z premenných prostredia.
 * URL sa očistí na samotnú doménu – ak sa omylom vloží napr.
 * „https://xxx.supabase.co/rest/v1/“, Supabase by vrátil „Invalid path specified in request URL“.
 */
function cleanUrl(raw: string | undefined) {
  const v = (raw ?? "").trim();
  try {
    return new URL(v).origin;
  } catch {
    return v.replace(/\/+$/, "");
  }
}

export const SUPABASE_URL = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
