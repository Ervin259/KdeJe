"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { href: string; label: string; badge?: number };

export function NavTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={path.startsWith(t.href)}>
          {t.label}
          {t.badge ? <span className="tbadge">{t.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
