"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

/** Supabase klient v prehliadači (prihlasovací formulár). */
export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}
