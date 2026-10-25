import type { PlatformSettings } from "@/lib/billing";

/** Identifikácia dodávateľa z nastavení superadmina (bez vymyslených údajov – chýbajúce sa nezobrazia). */
export function SupplierBlock({ s }: { s: PlatformSettings }) {
  const rows: [string, string | null][] = [
    ["Obchodné meno", s.supplier_name],
    ["Sídlo", s.supplier_address],
    ["IČO", s.supplier_ico],
    ["DIČ", s.supplier_dic],
    ["Zápis", s.supplier_register],
    ["E-mail", s.supplier_email],
    ["Telefón", s.supplier_phone],
  ];
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return <p className="muted">Údaje dodávateľa budú doplnené.</p>;
  return (
    <dl className="doc-dl">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
