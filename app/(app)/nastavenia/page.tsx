import { Placeholder } from "@/components/Placeholder";
import { requireAdmin } from "@/lib/data";

export default async function NastaveniaPage() {
  await requireAdmin();
  return <Placeholder title="Nastavenia" />;
}
