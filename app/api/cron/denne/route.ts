import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { runAndRecord } from "@/lib/yearly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Denná úloha (Vercel Cron, vercel.json). Vercel posiela hlavičku Authorization: Bearer <CRON_SECRET>.
 * Potrebné premenné vo Verceli: CRON_SECRET a SUPABASE_SERVICE_ROLE_KEY.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = adminClient();
  if (!sb) return NextResponse.json({ error: "Chýba SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  // dátum podľa Bratislavy
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(new Date());
  const origin = process.env.APP_URL?.trim() || "https://kdeje.app";
  const r = await runAndRecord(sb, today, origin, "cron");
  console.log("[cron denne]", today, r);
  return NextResponse.json({ today, ...r }, { status: r.ok ? 200 : 500 });
}
