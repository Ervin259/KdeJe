import { cookies } from "next/headers";
import { byLastName } from "@/lib/calc";

/** Výber zamestnancov v hlavičke: prevádzka, oddelenie a typ vzťahu (pamätá sa v cookies). Zoradenie je pevné. */
export const F_SITE = "kj_site";
export const F_DEPT = "kj_dept";
export const F_PP = "kj_pp";

export type GroupBy = "site" | "department" | "contract_type" | "none";
export const GROUP_LABEL: Record<GroupBy, string> = {
  site: "Prevádzka",
  department: "Oddelenie",
  contract_type: "Typ vzťahu",
  none: "Bez zoskupenia",
};
const ppName = (g: string) => (g === "DOH" ? "Dohoda" : g);
const ppRank = (g: string) => (g === "TPP" ? 0 : g === "DOH" ? 1 : 2);

export type EmpOrg = { name: string; site?: string | null; department?: string | null; contract_type?: string };
/** vybrané prevádzky, oddelenia a typy vzťahu (prázdne = všetky) */
export type Filter = { site: string[]; dept: string[]; pp: string[]; group: GroupBy };

export async function getFilter(): Promise<Filter> {
  const c = await cookies();
  return {
    site: (c.get(F_SITE)?.value ?? "").split("|").filter(Boolean),
    dept: (c.get(F_DEPT)?.value ?? "").split("|").filter(Boolean),
    pp: (c.get(F_PP)?.value ?? "").split("|").filter(Boolean),
    group: "site",
  };
}

/** Ponechá len zamestnancov vybraných prevádzok, oddelení a typov vzťahu. */
export function applyFilter<T extends EmpOrg>(list: T[], f: Filter) {
  return list.filter(
    (e) =>
      (!f.site.length || f.site.includes(e.site ?? "")) &&
      (!f.dept.length || f.dept.includes(e.department ?? "")) &&
      (!f.pp.length || f.pp.includes(e.contract_type ?? ""))
  );
}

/** Hodnota skupiny zamestnanca (prázdna = bez prevádzky/oddelenia). */
export function groupOf(e: EmpOrg, g: GroupBy) {
  if (g === "none") return "";
  if (g === "contract_type") return ppName(e.contract_type ?? "");
  return (g === "site" ? e.site : e.department) ?? "";
}

const cmp = (a: string, b: string) => (!a && b ? 1 : a && !b ? -1 : a.localeCompare(b, "sk"));

/** Zoradenie: najprv podľa zvoleného zoskupenia, potom prevádzka, oddelenie, typ vzťahu a priezvisko. */
export function sortGrouped<T extends EmpOrg>(list: T[], g: GroupBy) {
  const keys: GroupBy[] = g === "none" ? [] : [g, ...(["site", "department", "contract_type"] as GroupBy[]).filter((k) => k !== g)];
  return list.slice().sort((a, b) => {
    for (const k of keys) {
      const r =
        k === "contract_type"
          ? ppRank(a.contract_type ?? "") - ppRank(b.contract_type ?? "") || cmp(a.contract_type ?? "", b.contract_type ?? "")
          : cmp(groupOf(a, k), groupOf(b, k));
      if (r) return r;
    }
    return byLastName(a, b);
  });
}

/** Zoznam použitých hodnôt (pre výber v hlavičke). */
export function distinctOf(list: EmpOrg[], k: "site" | "department") {
  return [...new Set(list.map((e) => (e[k] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sk"));
}
