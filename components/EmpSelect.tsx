"use client";
import { useRouter } from "next/navigation";

export function EmpSelect({ value, options, base }: { value: string; options: { id: string; name: string }[]; base: string }) {
  const router = useRouter();
  return (
    <select className="empsel" aria-label="Zamestnanec" value={value} onChange={(e) => router.push(base + e.target.value)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
