import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import "./site.css";

export const metadata = {
  title: "KdeJe – kto je dnes mimo práce",
  description: "Dovolenky, PN, lekár a home office celého tímu na jednom mieste. Podklad pre mzdy jedným klikom.",
};

const FEATURES = [
  ["Kalendár tímu", "Na prvý pohľad vidíte, kto je dnes na dovolenke, u lekára, na služobnej ceste alebo pracuje z domu."],
  ["Dovolenky a zostatky", "Nárok, prenos z minulého roka, čerpanie aj plán. Zamestnanec vidí, koľko mu zostáva a čo má dočerpať."],
  ["Podklad pre mzdy", "Mesačný súhrn neprítomností a stravných lístkov pre mzdárku, vrátane výkazu hodín pre dohody."],
  ["Schvaľovanie a uzávierka", "Mesiac sa po uzávierke zamkne. Neskoršie zmeny idú ako žiadosť so zdôvodnením a všetko ostáva v histórii."],
  ["Vedúci oddelení", "Vedúci zapisuje dochádzku za svojich ľudí aj vtedy, keď sa sami do aplikácie neprihlasujú."],
  ["Súkromie (GDPR)", "PN, lekára či OČR môžu kolegovia vidieť len ako „mimo“. Detaily vidí iba admin a vedúci."],
] as const;

const STEPS = [
  ["Vyplníte žiadosť", "Názov firmy, IČO a e-mail toho, kto bude aplikáciu spravovať."],
  ["Potvrdíme prístup", "Žiadosť skontrolujeme a adminovi príde pozvánka e-mailom."],
  ["Pridáte zamestnancov", "Admin pridá ľudí, nastaví pracovný čas a pošle im pozvánky. Hotovo."],
] as const;

/** Kúsok kalendára v úvode – len ilustrácia, nie skutočné dáta. */
const DEMO: { n: string; c: (string | null)[] }[] = [
  { n: "Jana K.", c: [null, "dov", "dov", "dov", null] },
  { n: "Peter M.", c: [null, null, "ho", null, "ho"] },
  { n: "Lucia B.", c: ["par", null, null, null, null] },
  { n: "Marek S.", c: [null, null, null, "sc", "sc"] },
];
const LBL: Record<string, string> = { dov: "DOV", ho: "HO", par: "LEK", sc: "SC" };

export default function Home() {
  return (
    <div className="site">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="site-in hero-in">
            <div className="hero-copy">
              <h1>
                Kto je dnes mimo práce?
                <br />
                <span>KdeJe to vie.</span>
              </h1>
              <p className="lead">
                Dovolenky, PN, lekár, služobné cesty a home office celého tímu na jednom mieste. Na konci mesiaca máte podklad pre mzdy
                bez prepisovania z Outlooku a Excelu.
              </p>
              <div className="hero-cta">
                <Link className="btn primary big-btn" href="/registracia">
                  Vyskúšať 12 mesiacov zdarma
                </Link>
                <span className="muted">Potom 1 € za zamestnanca mesačne</span>
              </div>
            </div>
            <div className="hero-demo" aria-hidden="true">
              <div className="demo-head">
                <span />
                {["Po", "Ut", "St", "Št", "Pi"].map((d) => (
                  <b key={d}>{d}</b>
                ))}
              </div>
              {DEMO.map((r) => (
                <div className="demo-row" key={r.n}>
                  <span className="demo-n">{r.n}</span>
                  {r.c.map((c, i) => (
                    <span key={i} className={`demo-c${c ? " " + c : ""}`}>
                      {c ? LBL[c] : ""}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="site-sec" id="funkcie">
          <div className="site-in">
            <h2>Všetko, čo potrebuje malá a stredná firma</h2>
            <div className="feat-grid">
              {FEATURES.map(([t, d]) => (
                <div className="feat" key={t}>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="site-sec alt" id="cena">
          <div className="site-in price-in">
            <div>
              <h2>Jednoduchá cena</h2>
              <p className="lead">Platíte len za aktívnych zamestnancov. Nič sa neinštaluje, aplikácia beží v prehliadači.</p>
              <ol className="steps">
                {STEPS.map(([t, d]) => (
                  <li key={t}>
                    <b>{t}</b>
                    <span>{d}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="price-card">
              <span className="price-tag">Prvých 12 mesiacov zdarma</span>
              <div className="price">
                <b>1 €</b>
                <span>za zamestnanca mesačne</span>
              </div>
              <ul>
                <li>Všetky funkcie vrátane podkladu pre mzdy</li>
                <li>Neobmedzený počet adminov a vedúcich</li>
                <li>Rátajú sa aj ľudia, ktorí sa neprihlasujú</li>
                <li>Prihlásenie odkazom do e-mailu, bez hesiel</li>
              </ul>
              <Link className="btn primary big-btn" href="/registracia">
                Požiadať o zriadenie
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
