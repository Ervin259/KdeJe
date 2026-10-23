"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** onlyActive = záložka sa zobrazí len vtedy, keď je stránka práve otvorená (napr. Môj prehľad) */
export type Tab = { href: string; label: string; badge?: number; onlyActive?: boolean };

export function NavTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav className="tabs" role="tablist">
      {tabs.filter((t) => !t.onlyActive || path.startsWith(t.href)).map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={path.startsWith(t.href)}>
          {t.label}
          {t.badge ? <span className="tbadge">{t.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
