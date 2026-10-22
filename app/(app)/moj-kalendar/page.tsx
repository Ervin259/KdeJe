import { Calendar } from "@/components/Calendar";
import { requireMe } from "@/lib/data";
import { calParams } from "@/lib/params";

export default async function MyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; d?: string; m?: string }>;
}) {
  const me = await requireMe();
  const { view, anchor } = calParams(await searchParams, "month");
  return <Calendar me={me} view={view} anchor={anchor} basePath="/moj-kalendar" onlyMe />;
}
