import { redirect } from "next/navigation";
import { Calendar } from "@/components/Calendar";
import { requireMe } from "@/lib/data";
import { calParams } from "@/lib/params";

export default async function TeamCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; d?: string; m?: string }>;
}) {
  const me = await requireMe();
  if (!me.sees_calendar && me.role !== "admin") redirect("/moj-kalendar");
  const { view, anchor } = calParams(await searchParams);
  return <Calendar me={me} view={view} anchor={anchor} basePath="/kalendar" />;
}
