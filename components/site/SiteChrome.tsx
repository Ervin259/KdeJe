import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** Horná lišta a päta verejných stránok (úvod, registrácia). */
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <header className="site-head">
      <div className="site-in">
        <Link href="/" className="site-logo" aria-label="KdeJe – úvod">
          Kde<b>Je</b>
        </Link>
        <nav className="site-nav">
          <a href="/#funkcie">Funkcie</a>
          <a href="/#cena">Cena</a>
          {user ? (
            <Link className="btn" href="/kalendar">
              Otvoriť aplikáciu
            </Link>
          ) : (
            <Link className="btn" href="/login">
              Prihlásiť sa
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-in">
        <span>
          Kde<b>Je</b> · evidencia dochádzky a neprítomností
        </span>
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}
