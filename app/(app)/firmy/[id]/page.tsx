import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/data";
import { Header } from "@/components/Header";
import { CompanyEdit } from "../ui";

/** Superadmin: úprava názvu a fakturačných údajov firmy. */
export default async function CompanyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePlatform();
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("companies")
    .select("id, name, ico, address, billing_name, billing_street, billing_city, billing_zip, billing_dic, billing_icdph, billing_email, billing_phone")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  return (
    <>
      <Header
        me={me}
        center={
          <div className="mnav">
            <h2>{c.name}</h2>
          </div>
        }
        right={
          <Link className="btn" href="/firmy">
            Späť na Firmy
          </Link>
        }
      />
      <main id="view">
        <div className="panel">
          <div className="box">
            <CompanyEdit c={c} />
          </div>
        </div>
      </main>
    </>
  );
}
