"use client";
import { useRouter } from "next/navigation";

/**
 * Klik do kalendára ako v prototype: na záznam = úprava, do prázdnej bunky = nový zápis.
 * Bunky nesú data-id (záznam) alebo data-emp + data-d (zamestnanec a deň).
 */
export function CalClick({ back, children }: { back: string; children: React.ReactNode }) {
  const router = useRouter();
  function onClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    const rec = t.closest<HTMLElement>("[data-id]");
    const cell = t.closest<HTMLElement>("[data-emp]");
    const row = t.closest<HTMLElement>("[data-edit]");
    const spat = "&spat=" + encodeURIComponent(back);
    if (row?.dataset.edit) return router.push(`/zapisat?id=${row.dataset.edit}${spat}`);
    if (!cell || !cell.classList.contains("click")) return;
    if (rec?.dataset.id) return router.push(`/zapisat?id=${rec.dataset.id}${spat}`);
    router.push(`/zapisat?emp=${cell.dataset.emp}&d=${cell.dataset.d}${spat}`);
  }
  return <div onClick={onClick}>{children}</div>;
}
