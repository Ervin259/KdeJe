import { Placeholder } from "@/components/Placeholder";
import { requireAdmin } from "@/lib/data";

export default async function MzdyPage() {
  await requireAdmin();
  return <Placeholder title="Podklad pre mzdy" />;
}
