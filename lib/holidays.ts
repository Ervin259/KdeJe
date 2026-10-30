/**
 * Dni pracovného pokoja na Slovensku (zákon č. 241/1993 Z. z. v znení neskorších zmien).
 * Návrh na ďalší rok sa z nich vygeneruje automaticky – superadmin ho pred zápisom do firiem potvrdí,
 * lebo zákon sa mení (2025: zrušené 1. 9. a 17. 11., 2026: výnimočne bez voľna 8. 5. a 15. 9.).
 * Pri ďalšej zmene zákona stačí upraviť pravidlá nižšie.
 */
export type Holiday = { date: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Veľkonočná nedeľa (gregoriánsky kalendár, anonymný algoritmus). */
export function easterSunday(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const shift = (d: Date, n: number) => {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

type Rule = { md?: [number, number]; easter?: number; name: string; from?: number; to?: number; skip?: number[] };
const RULES: Rule[] = [
  { md: [1, 1], name: "Deň vzniku Slovenskej republiky" },
  { md: [1, 6], name: "Zjavenie Pána (Traja králi)" },
  { easter: -2, name: "Veľký piatok" },
  { easter: 1, name: "Veľkonočný pondelok" },
  { md: [5, 1], name: "Sviatok práce" },
  { md: [5, 8], name: "Deň víťazstva nad fašizmom", skip: [2026] },
  { md: [7, 5], name: "Sviatok svätého Cyrila a svätého Metoda" },
  { md: [8, 29], name: "Výročie Slovenského národného povstania" },
  { md: [9, 1], name: "Deň Ústavy Slovenskej republiky", to: 2024 },
  { md: [9, 15], name: "Sedembolestná Panna Mária", skip: [2026] },
  { md: [11, 1], name: "Sviatok všetkých svätých" },
  { md: [11, 17], name: "Deň boja za slobodu a demokraciu", to: 2024 },
  { md: [12, 24], name: "Štedrý deň" },
  { md: [12, 25], name: "Prvý sviatok vianočný" },
  { md: [12, 26], name: "Druhý sviatok vianočný" },
];

export function skHolidays(y: number): Holiday[] {
  const easter = easterSunday(y);
  return RULES.filter((r) => (r.from ?? 0) <= y && y <= (r.to ?? 9999) && !(r.skip ?? []).includes(y))
    .map((r) => ({ date: r.md ? iso(y, r.md[0], r.md[1]) : shift(easter, r.easter!), name: r.name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
