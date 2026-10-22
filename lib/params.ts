import { todayIso } from "@/lib/data";
import type { View } from "@/components/Calendar";

/** ?v=week&d=2026-10-19 → pohľad a dátum (predvolene týždeň a dnešok). */
export function calParams(sp: { v?: string; d?: string; m?: string }, defView: View = "week") {
  const view: View = sp.v === "day" || sp.v === "week" || sp.v === "month" ? sp.v : defView;
  let d = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : todayIso();
  // starý tvar odkazu ?m=2026-10
  if (!sp.d && sp.m && /^\d{4}-\d{2}$/.test(sp.m)) d = sp.m + "-01";
  return { view, anchor: d };
}

/** Bezpečný návratový odkaz (len v rámci aplikácie). */
export const safeBack = (s: string | undefined, def = "/kalendar") =>
  s && s.startsWith("/") && !s.startsWith("//") ? s : def;
