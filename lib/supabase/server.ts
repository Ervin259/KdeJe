import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase klient pre Server Components, Server Actions a Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Volané zo Server Component – cookies obnoví middleware.
          }
        },
      },
    }
  );
}
