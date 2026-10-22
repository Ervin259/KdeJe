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
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [stack]);
  return (
    <div ref={ref} className={`topbar${stack ? " tstack" : ""}`} id="bar">
      {children}
    </div>
  );
}
