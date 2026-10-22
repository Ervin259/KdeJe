"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Supabase klient v prehliadači (prihlasovací formulár). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
