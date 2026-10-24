"use client";
import { useLayoutEffect, useRef } from "react";

/**
 * Lišta pod hlavičkou (layoutBar v prototype): záložky vľavo, ovládanie v strede, tlačidlá vpravo.
 * Keď sa niečo nezmestí, ovládanie sa presunie na samostatný riadok pod záložky (trieda tstack).
 */
export function TopBar({ stack, children }: { stack?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const ov = (e: Element | null) => !!e && e.scrollWidth > e.clientWidth + 1;
    const layout = () => {
      if (stack) return bar.classList.add("tstack");
      bar.classList.remove("tstack");
      const [t, l, r] = [bar.querySelector("nav.tabs"), bar.querySelector(".bl"), bar.querySelector(".br")];
      if (ov(t) || ov(l) || ov(r) || ov(bar)) bar.classList.add("tstack");
    };
    // výška fixnej hlavičky → --headH, aby sa hlavička tabuľky kalendára prilepila hneď pod ňu
    const head = document.getElementById("stickyhead");
    const setH = () => head && document.documentElement.style.setProperty("--headH", `${head.offsetHeight}px`);
    const update = () => {
      layout();
      setH();
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    if (head) ro.observe(head);
    return () => ro.disconnect();
  }, [stack]);
  return (
    <div ref={ref} className={`topbar${stack ? " tstack" : ""}`} id="bar">
      {children}
    </div>
  );
}
