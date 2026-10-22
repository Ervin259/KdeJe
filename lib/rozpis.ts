/**
 * Rozpis hodín dohodárov do dní (rzSpread v prototype).
 * Najprv pracovné dni bez neprítomnosti, potom navýšenie až po denný strop,
 * až nakoniec dni s neprítomnosťou (s upozornením).
 */
export type RzDay = { d: string; work: boolean; abs: number /* hodiny neprítomnosti */ };

export type RzParams = {
  days: RzDay[]; // všetky dni mesiaca
  total: number; // hodín na výplatu
  max: number; // max. hodín za deň
  week: number | null; // max. hodín za týždeň
  step: number; // 1 alebo 0,5
  how: "even" | "seq";
};

const mondayOf = (s: string) => {
  const d = new Date(s + "T00:00:00Z");
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 864e5).toISOString().slice(0, 10);
};

export function spread(p: RzParams): { days: Record<string, number>; err: string; warn: string } {
  const step = p.step || 1;
  const out: Record<string, number> = {};
  const wk: Record<string, number> = {};
  let err = "";
  let warn = "";
  let left = Math.round((p.total || 0) / step);
  if (!left) return { days: {}, err, warn };
  const usable = p.days.filter((x) => x.work);
  const free = usable.filter((x) => x.abs <= 0).map((x) => x.d);
  const absd = usable.filter((x) => x.abs > 0).map((x) => x.d);
  const can = (d: string) => {
    const w = mondayOf(d);
    return (out[d] || 0) + step <= p.max + 1e-9 && (!p.week || (wk[w] || 0) + step <= p.week + 1e-9);
  };
  const put = (d: string) => {
    const w = mondayOf(d);
    out[d] = (out[d] || 0) + step;
    wk[w] = (wk[w] || 0) + step;
    left--;
  };
  const fill = (order: string[]) => {
    if (p.how === "seq") {
      for (const d of order) while (left > 0 && can(d)) put(d);
    } else {
      let prog = true;
      while (left > 0 && prog) {
        prog = false;
        for (const d of order) {
          if (!left) break;
          if (can(d)) {
            put(d);
            prog = true;
          }
        }
      }
    }
  };
  fill(free);
  const before = left;
  if (left > 0 && absd.length) {
    fill(absd);
    if (before > left) warn = `${fmt((before - left) * step)} h bolo treba rozpísať aj do dní, keď má v kalendári neprítomnosť.`;
  }
  if (left > 0) err = `Nezmestí sa ${fmt(left * step)} h – zvýšte max. hodín za deň${p.week ? " alebo za týždeň" : ""}.`;
  return { days: out, err, warn };
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
