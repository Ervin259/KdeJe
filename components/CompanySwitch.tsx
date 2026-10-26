"use client";
import { useTransition } from "react";
import { switchCompany } from "./companyActions";

/** Prepínač firiem v hlavičke – pre účty vo viacerých firmách a pre superadmina. */
export function CompanySwitch({
  current,
  options,
  platform,
}: {
  current: string;
  options: { id: string; name: string }[];
  platform: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className="firmswitch"
      value={current}
      disabled={pending}
      aria-label="Firma"
      title="Prepnúť firmu"
      onChange={(e) => {
        const v = e.target.value;
        start(() => switchCompany(v));
      }}
    >
      {platform && <option value="">— Správa aplikácie (mimo firmy) —</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
