"use client";
import { useEffect } from "react";

/**
 * Riadok s dňami v kalendári ostáva pri posúvaní stránky viditeľný aj tam, kde tabuľka
 * musí mať posúvanie do strán (mobil, tablet). CSS sticky v takom obale nefunguje,
 * preto hlavičku tabuľky posúvame nadol o toľko, o koľko jej vrch odišiel z obrazovky.
 * Na širokých obrazovkách (obal bez posúvania do strán) to rieši CSS a tu sa nič nedeje.
 */
export function StickyDays() {
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const head = document.getElementById("stickyhead");
      // prilepená hlavička aplikácie zakrýva vrch obrazovky
      const top = head && getComputedStyle(head).position === "sticky" ? Math.max(0, head.getBoundingClientRect().bottom) : 0;
      document.querySelectorAll<HTMLElement>(".calwrap").forEach((wrap) => {
        const thead = wrap.querySelector<HTMLElement>("table.cal > thead");
        if (!thead) return;
        const ths = thead.querySelectorAll<HTMLElement>("th");
        if (getComputedStyle(wrap).overflowX === "visible") {
          ths.forEach((th) => (th.style.transform = ""));
          return;
        }
        const tbl = thead.parentElement!.getBoundingClientRect();
        const h = thead.getBoundingClientRect().height;
        // posun = koľko je vrch tabuľky nad okrajom obrazovky, najviac po posledný riadok
        const shift = Math.max(0, Math.min(top - tbl.top, tbl.height - h * 2));
        const t = shift > 0 ? `translateY(${shift}px)` : "";
        ths.forEach((th) => {
          th.style.transform = t;
          th.classList.toggle("floating", shift > 0);
        });
      });
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", req);
    const ro = new ResizeObserver(req);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", req);
      window.removeEventListener("resize", req);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
