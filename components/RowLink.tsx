"use client";
import { useRouter } from "next/navigation";

/** Riadok tabuľky, ktorý sa celý správa ako odkaz (klik na riadok = detail). */
export function RowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr className={className} onClick={() => router.push(href)} style={{ cursor: "pointer" }}>
      {children}
    </tr>
  );
}
