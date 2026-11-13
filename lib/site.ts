import { headers } from "next/headers";

/**
 * Doména, na ktorej aplikácia práve beží (kdeje.app, outtime.io…) – bez „www.“.
 * Do konca roka 2026 bežia obe domény súčasne, preto sa v textoch nepíše natvrdo.
 */
export async function siteHost(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-host") ?? h.get("host") ?? hostOf(process.env.APP_URL) ?? "kdeje.app").split(",")[0].trim().replace(/^www\./, "");
}

/** „https://outtime.io/login“ → „outtime.io“ */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
