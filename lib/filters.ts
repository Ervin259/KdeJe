import { cookies } from "next/headers";
import { byLastName } from "@/lib/calc";

/** Výber zamestnancov v hlavičke: prevádzka a oddelenie (pamätá sa v cookies). Zoradenie je pevné. */
export const F_SITE = "kj_site";
export const F_DEPT = "kj_dept";

export type GroupBy = "site" | "department" | "contract_type" | "none";
export const GROUP_LABEL: Record<GroupBy, string> = {
  site: "Prevádzka",
  department: "Oddelenie",
  contract_type: "Prac. pomer",
  none: "Bez zoskupenia",
};
export const PP_NAME: Record<string, string> = { TPP: "TPP", DOH: "Dohoda", ZIV: "Živnosť", SRO: "S.r.o." };
const PP_SORT: Record<string, number> = { TPP: 0, DOH: 1, ZIV: 2, SRO: 3 };

export type EmpOrg = { name: string; site?: string | null; department?: string | null; contract_type?: string };
export type Filter = { site: string; dept: string; group: GroupBy };

export async function getFilter(): Promise<Filter> {
  const c = await cookies();
  return {
    site: c.get(F_SITE)?.value ?? "",
    dept: c.get(F_DEPT)?.value ?? "",
    group: "site",
  };
}

/** Ponechá len zamestnancov vybranej prevádzky a oddelenia. */
export function applyFilter<T extends EmpOrg>(list: T[], f: Filter) {
  return list.filter((e) => (!f.site || (e.site ?? "") === f.site) && (!f.dept || (e.department ?? "") === f.dept));
}

/** Hodnota skupiny zamestnanca (prázdna = bez prevádzky/oddelenia). */
export function groupOf(e: EmpOrg, g: GroupBy) {
  if (g === "none") return "";
  if (g === "contract_type") return PP_NAME[e.contract_type ?? ""] ?? e.contract_type ?? "";
  return (g === "site" ? e.site : e.department) ?? "";
}

const cmp = (a: string, b: string) => (!a && b ? 1 : a && !b ? -1 : a.localeCompare(b, "sk"));

/** Zoradenie: najprv podľa zvoleného zoskupenia, potom prevádzka, oddelenie, pracovný pomer a priezvisko. */
export function sortGrouped<T extends EmpOrg>(list: T[], g: GroupBy) {
  const keys: GroupBy[] = g === "none" ? [] : [g, ...(["site", "department", "contract_type"] as GroupBy[]).filter((k) => k !== g)];
  return list.slice().sort((a, b) => {
    for (const k of keys) {
      const r =
        k === "contract_type"
          ? (PP_SORT[a.contract_type ?? ""] ?? 9) - (PP_SORT[b.contract_type ?? ""] ?? 9)
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
