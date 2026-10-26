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
  // zvýraznenie stĺpca dňa v hlavičke pri prejdení myšou nad bunkou (riadok zvýrazní CSS)
  function onOver(e: React.MouseEvent) {
    const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-d]");
    const table = (e.currentTarget as HTMLElement).querySelector("table.cal");
    if (!table) return;
    table.querySelectorAll("th.hcol").forEach((th) => th.classList.remove("hcol"));
    if (!td) return;
    const idx = (td as HTMLTableCellElement).cellIndex;
    table.querySelector<HTMLTableRowElement>("thead tr")?.cells[idx]?.classList.add("hcol");
  }
  function onLeave(e: React.MouseEvent) {
    (e.currentTarget as HTMLElement).querySelectorAll("th.hcol").forEach((th) => th.classList.remove("hcol"));
  }
  return (
    <div onClick={onClick} onMouseOver={onOver} onMouseLeave={onLeave}>
      {children}
    </div>
  );
}
