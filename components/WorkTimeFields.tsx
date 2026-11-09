"use client";
import { useState } from "react";
import { FLEX_PERIOD, dailyHours, hm, type WorkTime } from "@/lib/worktime";

const nf = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Polia pracovného času – rovnaké v šablóne (Nastavenia → Pracovná doba) aj v karte zamestnanca.
 * `prefix` odlíši názvy polí v karte („wt_“), `disabled` zobrazí hodnoty šablóny len na čítanie.
 */
export function WorkTimeFields({ g, prefix = "", disabled = false }: { g: WorkTime; prefix?: string; disabled?: boolean }) {
  const n = (k: string) => prefix + k;
  const [flex, setFlex] = useState(g.flexible);
  const [sl, setSl] = useState(g.meal_voucher);
  const [bMode, setBMode] = useState(g.break_mode ?? "fixed");
  const [t, setT] = useState({
    s: hm(g.day_start) || "08:30",
    e: hm(g.day_end) || "17:00",
    b: Number(g.break_min ?? 30),
    h: g.daily_hours != null ? String(g.daily_hours).replace(".", ",") : "",
  });
  const H = dailyHours({
    ...g,
    flexible: flex,
    day_start: t.s,
    day_end: t.e,
    break_min: t.b,
    daily_hours: t.h ? Number(t.h.replace(",", ".")) : null,
  });
  const time = (k: keyof WorkTime, def: string, label?: string) => (
    <input className="ci t" type="time" step={900} name={n(k)} defaultValue={hm(g[k] as string | null) || def} disabled={disabled} aria-label={label} />
  );

  return (
    <fieldset className="wtf" disabled={disabled}>
      <div className="crow">
        <span className="cl">Pracovný čas</span>
        <select className="ci" name={n("flexible")} value={flex ? "1" : "0"} onChange={(e) => setFlex(e.target.value === "1")}>
          <option value="0">pevný</option>
          <option value="1">pružný</option>
        </select>
        {!flex ? (
          <>
            <span className="ct">od</span>
            <input className="ci t" type="time" step={900} name={n("day_start")} value={t.s} onChange={(e) => setT({ ...t, s: e.target.value })} aria-label="Začiatok" />
            <span className="ct">do</span>
            <input className="ci t" type="time" step={900} name={n("day_end")} value={t.e} onChange={(e) => setT({ ...t, e: e.target.value })} aria-label="Koniec" />
            <span className="cm">= {nf(H)} h denne</span>
            <input type="hidden" name={n("daily_hours")} value="" />
          </>
        ) : (
          <>
            <span className="ct">fond</span>
            <input
              className="ci n"
              type="text"
              inputMode="decimal"
              name={n("daily_hours")}
              value={t.h || "8"}
              onChange={(e) => setT({ ...t, h: e.target.value })}
              aria-label="Denný fond hodín"
            />
            <span className="ct">h denne</span>
            <span className="wtsep" />
            <span className="ct">pružné obdobie</span>
            <select className="ci" name={n("flex_period")} defaultValue={g.flex_period ?? "day"} title="Obdobie, za ktoré musí odpracovať fond (deň, týždeň alebo 4 týždne)">
              {(Object.keys(FLEX_PERIOD) as (keyof typeof FLEX_PERIOD)[]).map((k) => (
                <option key={k} value={k}>
                  {FLEX_PERIOD[k]}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {flex && (
        <div className="wtsub">
          <div className="crow wtl">
            <span className="wtk">Príchod</span>
            <span className="ct">od</span>
            {time("arrive_from", "07:00", "Príchod najskôr")}
            <span className="ct">do</span>
            {time("arrive_to", "10:00", "Príchod najneskôr")}
            <span className="wtsep" />
            <span className="ct" title="S týmto príchodom aplikácia počíta, kým zamestnanec nezapíše iný">predvolene o</span>
            <input className="ci t" type="time" step={900} name={n("day_start")} defaultValue={hm(g.day_start) || hm(g.arrive_from) || "08:00"} aria-label="Predvolený príchod" />
          </div>
          <div className="crow wtl">
            <span className="wtk">Odchod</span>
            <span className="ct">od</span>
            {time("leave_from", "15:00", "Odchod najskôr")}
            <span className="ct">do</span>
            {time("leave_to", "19:00", "Odchod najneskôr")}
          </div>
          <div className="crow wtl">
            <span className="wtk" title="Čas, keď musí byť na pracovisku">Základný čas</span>
            <span className="ct">od</span>
            <input className="ci t" type="time" step={900} name={n("core_start")} defaultValue={hm(g.core_start)} aria-label="Základný čas od" />
            <span className="ct">do</span>
            <input className="ci t" type="time" step={900} name={n("core_end")} defaultValue={hm(g.core_end)} aria-label="Základný čas do" />
            <span className="cm">nepovinné – kedy musí byť na pracovisku</span>
          </div>
        </div>
      )}
      {!flex && <input type="hidden" name={n("flex_period")} value={g.flex_period ?? "day"} />}

      <div className="crow">
        <span className="cl">Prestávka</span>
        <select className="ci" name={n("break_min")} value={t.b} onChange={(e) => setT({ ...t, b: Number(e.target.value) })} aria-label="Dĺžka prestávky">
          {[0, 15, 30, 45, 60].map((x) => (
            <option key={x} value={x}>
              {x} min
            </option>
          ))}
        </select>
        <select className="ci" name={n("break_len")} defaultValue={g.break_len ?? "fixed"} aria-label="Dĺžka prestávky – pevná alebo pohyblivá" title="Pohyblivá: môže byť dlhšia, ale musí si ju nadrobiť">
          <option value="fixed">presne</option>
          <option value="min">aspoň (dlhšiu nadrobí)</option>
        </select>
      </div>
      <div className="wtsub">
        <div className="crow wtl">
          <span className="wtk">Kedy</span>
          <select className="ci" name={n("break_mode")} value={bMode} onChange={(e) => setBMode(e.target.value as "fixed" | "window")} aria-label="Čas prestávky – fixný alebo pohyblivý">
            <option value="fixed">vo fixnom čase</option>
            <option value="window">kedykoľvek v čase</option>
          </select>
          {bMode === "fixed" ? (
            <>
              <span className="ct">od</span>
              {time("break_start", "12:00", "Prestávka od")}
            </>
          ) : (
            <>
              <span className="ct">od</span>
              {time("break_from", "11:00", "Prestávka najskôr od")}
              <span className="ct">do</span>
              {time("break_to", "14:00", "Prestávka najneskôr do")}
              <span className="wtsep" />
              <span className="ct" title="S týmto časom aplikácia počíta, kým zamestnanec nezapíše inú prestávku">predvolene o</span>
              {time("break_start", "12:00", "Predvolený začiatok prestávky")}
            </>
          )}
        </div>
      </div>

      <div className="crow">
        <span className="cl">Nadčasy</span>
        <select className="ci" name={n("overtime")} defaultValue={g.overtime ?? "none"}>
          <option value="none">nepovolené – denne presne fond</option>
          <option value="pay">povolené – predvolene preplatiť</option>
          <option value="nv">povolené – predvolene náhradné voľno</option>
        </select>
      </div>

      <div className="crow">
        <span className="cl">Stravné lístky</span>
        <label className="ctog">
          <input type="checkbox" name={n("meal_voucher")} checked={sl} onChange={(e) => setSl(e.target.checked)} />
          <span>{sl ? "áno" : "nie"}</span>
        </label>
        {sl ? (
          <>
            <span className="ct">za deň s odpracovanými</span>
            <select className="ci" name={n("sl_rule")} defaultValue={g.sl_rule ?? "gte"}>
              <option value="gte">aspoň</option>
              <option value="gt">viac ako</option>
            </select>
            <input className="ci n" type="number" min={0} max={12} step={0.5} name={n("sl_min_hours")} defaultValue={g.sl_min_hours ?? 4} />
            <span className="ct">h · služobná cesta od</span>
            <input className="ci n" type="number" min={0} max={24} step={0.5} name={n("trip_no_sl_hours")} defaultValue={g.trip_no_sl_hours ?? 5} />
            <span className="ct">h bez SL</span>
          </>
        ) : (
          <>
            <input type="hidden" name={n("sl_rule")} value={g.sl_rule ?? "gte"} />
            <input type="hidden" name={n("sl_min_hours")} value={g.sl_min_hours ?? 4} />
            <input type="hidden" name={n("trip_no_sl_hours")} value={g.trip_no_sl_hours ?? 5} />
          </>
        )}
      </div>
    </fieldset>
  );
}
