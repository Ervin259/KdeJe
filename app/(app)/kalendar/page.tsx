import { redirect } from "next/navigation";
import { MonthCalendar } from "@/components/MonthCalendar";
import { parseMonth, requireMe } from "@/lib/data";

export default async function TeamCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const me = await requireMe();
  if (!me.sees_calendar && me.role !== "admin") redirect("/moj-kalendar");
  const { y, m } = parseMonth((await searchParams).m);
  return <MonthCalendar me={me} y={y} m={m} basePath="/kalendar" />;
}
