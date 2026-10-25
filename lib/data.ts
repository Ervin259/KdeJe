import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ContractType = "TPP" | "DOH" | "ZIV" | "SRO";

export type Me = {
  id: string;
  name: string;
  /** rola, s ktorou sa aplikácia práve zobrazuje (admin si môže prepnúť pohľad zamestnanca) */
  role: "admin" | "employee";
  /** skutočná rola v databáze */
  realRole: "admin" | "employee";
  contract_type: ContractType;
  sees_calendar: boolean;
  company_id: string;
  company_name: string;
  /** vedúci – spravuje vybraných zamestnancov */
  isManager: boolean;
  /** id zamestnancov, ktorých spravuje (vedúci) */
  managed: string[];
  /** superadmin celej aplikácie (vývojár) */
  isPlatform: boolean;
  /** firma je obmedzená (neuhradená faktúra po splatnosti alebo pozastavenie) – len čítanie */
  readOnly: boolean;
};

export type CalEntry = {
  id: string;
  employee_id: string;
  employee_name: string;
  contract_type: ContractType;
  type: string;
  date_from: string;
  date_to: string;
  part: "full" | "am" | "pm" | "hrs";
  time_from: string | null;
  time_to: string | null;
  substitute_id: string | null;
  note: string | null;
};

export const CONTRACT_LABEL: Record<ContractType, string> = {
  TPP: "TPP",
  DOH: "Dohoda",
  ZIV: "Živnosť",
  SRO: "s.r.o.",
};

/** Cookie s pohľadom admina: „emp“ = vidí aplikáciu ako zamestnanec. */
export const VIEW_COOKIE = "kdeje-view";

/** Prihlásený zamestnanec (raz za request). Bez prihlásenia → /login. */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("employees")
    .select("id, name, role, is_manager, contract_type, sees_calendar, company_id, companies(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!data) return null;
  const company = data.companies as unknown as { name: string } | null;
  const empView = data.role === "admin" && (await cookies()).get(VIEW_COOKIE)?.value === "emp";
  const [{ data: platform }, { data: writable }] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    supabase.rpc("company_writable", { p_company: data.company_id }),
  ]);
  let managed: string[] = [];
  if (data.is_manager && !empView) {
    const { data: rows } = await supabase.from("manager_assignments").select("employee_id").eq("manager_id", data.id);
    managed = (rows ?? []).map((r) => r.employee_id as string);
  }
  return {
    id: data.id,
    name: data.name,
    role: empView ? "employee" : data.role,
    realRole: data.role,
    contract_type: data.contract_type,
    sees_calendar: data.sees_calendar,
    company_id: data.company_id,
    company_name: company?.name ?? "",
    isManager: !!data.is_manager && !empView,
    managed,
    isPlatform: platform === true,
    readOnly: writable === false,
  };
});

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/kalendar");
  return me;
}

export async function requireAdmin(): Promise<Me> {
  const me = await requireMe();
  if (me.role !== "admin") redirect("/kalendar");
  return me;
}

/** Superadmin celej aplikácie (stránka Firmy). */
export async function requirePlatform(): Promise<Me> {
  const me = await requireMe();
  if (!me.isPlatform) redirect("/kalendar");
  return me;
}

/** Admin alebo vedúci (Prehľad, Schvaľovanie). */
export async function requireLead(): Promise<Me> {
  const me = await requireMe();
  if (me.role !== "admin" && !me.isManager) redirect("/kalendar");
  return me;
}

/** Smie prihlásený zapisovať a spravovať tohto zamestnanca? (admin všetkých, vedúci svojich, každý seba) */
export const canManage = (me: Me, empId: string) => me.role === "admin" || empId === me.id || me.managed.includes(empId);

// ---------- dátumy (bez časových pásiem, len YYYY-MM-DD) ----------
export const MONTHS = [
  "Január", "Február", "Marec", "Apríl", "Máj", "Jún",
  "Júl", "August", "September", "Október", "November", "December",
];
export const DOW = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

export function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function todayIso() {
  // dnešok podľa slovenského času
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
}

/** Z parametra ?m=2026-10 vráti rok a mesiac (1–12); inak aktuálny mesiac. */
export function parseMonth(m?: string) {
  const match = m?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const y = Number(match[1]);
    const mo = Number(match[2]);
    if (mo >= 1 && mo <= 12) return { y, m: mo };
  }
  const t = todayIso();
  return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) };
}

export function shiftMonth(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayOfWeek(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function fmtDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}
