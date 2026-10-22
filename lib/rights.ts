/** Skupiny prístupových práv – zdieľané medzi serverom a prehliadačom. */
export type RG = {
  id: string;
  name: string;
  is_default: boolean;
  requires_approval: boolean;
  lock_days: number;
  can_edit_until_lock: boolean;
  edit_days_after_lock: number;
};
export const dniTxt = (n: number) => `${n} ${n === 1 ? "deň" : n > 1 && n < 5 ? "dni" : "dní"}`;
export const rgTxt = (r: RG) =>
  [
    r.requires_approval ? "vyžaduje schválenie" : "bez schvaľovania",
    `uzávierka ${r.lock_days ? dniTxt(r.lock_days) + " po skončení mesiaca" : "hneď po skončení mesiaca"}`,
    r.can_edit_until_lock ? "upravuje do uzávierky" : "zmeny len cez žiadosť",
    r.edit_days_after_lock ? `+${dniTxt(r.edit_days_after_lock)} po uzávierke` : "",
  ]
    .filter(Boolean)
    .join(" · ");
