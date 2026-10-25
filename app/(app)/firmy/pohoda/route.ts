import { NextResponse } from "next/server";
import iconv from "iconv-lite";
import { createClient } from "@/lib/supabase/server";
import { loadPlatformSettings, pohodaXml, type BillingCompany, type Invoice } from "@/lib/billing";

/**
 * XML s vydanými faktúrami pre Pohodu (Windows-1250).
 * ?id=… jedna faktúra; bez parametra všetky otvorené a zaplatené, ktoré ešte neboli exportované.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: platform } = await supabase.rpc("is_platform_admin");
  if (platform !== true) return new NextResponse("Len pre superadmina", { status: 403 });

  const id = new URL(request.url).searchParams.get("id");
  let q = supabase.from("invoices").select("*").neq("status", "cancelled").order("vs");
  q = id ? q.eq("id", id) : q.is("exported_at", null);
  const [{ data: inv }, { data: co }, s] = await Promise.all([q, supabase.rpc("platform_companies"), loadPlatformSettings()]);
  const invoices = (inv ?? []) as Invoice[];
  if (!invoices.length) return new NextResponse("Žiadne nové faktúry na export.", { status: 404 });

  const xml = pohodaXml(invoices, (co ?? []) as BillingCompany[], s);
  await supabase
    .from("invoices")
    .update({ exported_at: new Date().toISOString() })
    .in("id", invoices.map((i) => i.id));

  const name = invoices.length === 1 ? `kdeje-faktura-${invoices[0].vs}.xml` : `kdeje-faktury-${new Date().toISOString().slice(0, 10)}.xml`;
  return new NextResponse(new Uint8Array(iconv.encode(xml, "win1250")), {
    headers: {
      "Content-Type": "application/xml; charset=windows-1250",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
