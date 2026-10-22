import { Placeholder } from "@/components/Placeholder";
import { requireAdmin } from "@/lib/data";

export default async function PrehladPage() {
  await requireAdmin();
  return <Placeholder title="Prehľad" />;
}
