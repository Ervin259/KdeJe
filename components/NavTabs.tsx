"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { href: string; label: string };

export function NavTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "tab active" : "tab"}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
