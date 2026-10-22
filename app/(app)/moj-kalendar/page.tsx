import { MonthCalendar } from "@/components/MonthCalendar";
import { parseMonth, requireMe } from "@/lib/data";

export default async function MyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const me = await requireMe();
  const { y, m } = parseMonth((await searchParams).m);
  return <MonthCalendar me={me} y={y} m={m} basePath="/moj-kalendar" onlyMe />;
}
