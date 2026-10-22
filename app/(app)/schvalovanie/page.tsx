import { Placeholder } from "@/components/Placeholder";
import { requireAdmin } from "@/lib/data";

export default async function SchvalovaniePage() {
  await requireAdmin();
  return <Placeholder title="Schvaľovanie" />;
}
