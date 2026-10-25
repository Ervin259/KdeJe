import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { SupplierBlock } from "@/components/site/Supplier";
import { loadPlatformSettings } from "@/lib/billing";
import "../site.css";

export const metadata = { title: "Ochrana údajov – KdeJe" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const s = await loadPlatformSettings();
  const mail = s.supplier_email ? <a href={`mailto:${s.supplier_email}`}>{s.supplier_email}</a> : "e-mail dodávateľa";
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-sec">
        <article className="site-in doc">
          <p className="doc-ver">Verzia 1 · platné od 25. 10. 2026</p>
          <h1>Ochrana osobných údajov</h1>
          <p className="lead">
            KdeJe spracúva dva druhy údajov: kontaktné a fakturačné údaje firmy, ktorá službu používa, a údaje o dochádzke jej zamestnancov. Pri tých
            druhých rozhoduje firma – dodávateľ ich spracúva len preto, aby aplikácia fungovala.
          </p>

          <h2>Kto sme</h2>
          <SupplierBlock s={s} />

          <h2>A. Údaje zákazníka (dodávateľ ako prevádzkovateľ)</h2>
          <ul>
            <li>
              <b>Aké údaje:</b> názov firmy, IČO, adresa, fakturačné údaje, meno, e-mail a telefón osoby, ktorá požiadala o zriadenie, a údaje o
              faktúrach a platbách.
            </li>
            <li>
              <b>Prečo:</b> zriadenie služby a plnenie zmluvy, fakturácia a komunikácia so zákazníkom. Právnym základom je zmluva a pri účtovných
              dokladoch zákonná povinnosť.
            </li>
            <li>
              <b>Ako dlho:</b> počas trvania zmluvy; účtovné doklady 10 rokov podľa zákona o účtovníctve.
            </li>
            <li>Údaje nepredávame a nepoužívame na reklamu.</li>
          </ul>

          <h2>B. Údaje zamestnancov zákazníka (dodávateľ ako sprostredkovateľ)</h2>
          <p>
            Táto časť je zmluvou o spracúvaní osobných údajov podľa čl. 28 nariadenia GDPR. Je súčasťou{" "}
            <Link href="/podmienky">obchodných podmienok</Link> a vzniká spolu so zmluvou o službe.
          </p>
          <ul>
            <li>
              <b>Prevádzkovateľ</b> je zákazník (firma). Rozhoduje, koho do aplikácie zapíše a aké údaje o ňom vedie.
            </li>
            <li>
              <b>Kategórie dotknutých osôb:</b> zamestnanci, spolupracovníci na dohodu, živnostníci a ďalšie osoby, ktorých dochádzku zákazník
              eviduje.
            </li>
            <li>
              <b>Údaje:</b> meno, pracovný e-mail, pracovný pomer, pracovný čas, záznamy neprítomnosti (dovolenka, lekár, OČR, PN, služobná cesta,
              home office), poznámky, nárok a čerpanie dovolenky, hodiny pri dohodách a údaje o prihlásení. Záznam o PN alebo návšteve lekára
              môže byť údajom o zdraví – aplikácia preto umožňuje kolegom zobraziť ho len ako „mimo“ (Nastavenia → Súkromie).
            </li>
            <li>
              <b>Účel:</b> evidencia dochádzky a neprítomností a príprava podkladov pre mzdy – výlučne podľa pokynov zákazníka, ktorými sú
              nastavenia a zápisy v aplikácii.
            </li>
            <li>
              <b>Doba:</b> počas trvania zmluvy. Po jej skončení má zákazník 30 dní na export, potom sa údaje vymažú z aplikácie a pri najbližšej
              obmene aj zo záloh (najneskôr do 30 dní).
            </li>
          </ul>

          <h3>Povinnosti dodávateľa</h3>
          <ul>
            <li>Spracúva údaje len na poskytovanie služby, nepoužíva ich na iné účely a neposkytuje ich tretím stranám okrem subdodávateľov nižšie.</li>
            <li>Osoby s prístupom k údajom sú viazané mlčanlivosťou. K údajom zákazníka pristupuje dodávateľ len pri podpore alebo riešení chyby.</li>
            <li>
              Zabezpečenie: šifrované spojenie (HTTPS), prihlásenie odkazom do e-mailu bez hesiel, oddelenie údajov firiem a práva podľa rolí priamo v
              databáze, denné zálohy.
            </li>
            <li>
              Pomáha zákazníkovi pri právach zamestnancov (prístup, oprava, výmaz, prenosnosť). Väčšinu vybaví admin priamo v aplikácii – úprava
              karty zamestnanca, export do CSV, skrytie alebo vymazanie.
            </li>
            <li>Porušenie ochrany údajov oznámi zákazníkovi bez zbytočného odkladu, najneskôr do 48 hodín od zistenia.</li>
            <li>Na požiadanie poskytne informácie potrebné na preukázanie súladu s GDPR.</li>
          </ul>

          <h3>Subdodávatelia</h3>
          <p>Zákazník súhlasí s týmito subdodávateľmi. O zmene ho dodávateľ vopred informuje e-mailom a zákazník môže namietať.</p>
          <ul>
            <li>
              <b>Supabase, Inc.</b> – databáza, prihlasovanie a odosielanie prihlasovacích e-mailov.
            </li>
            <li>
              <b>Vercel, Inc.</b> – prevádzka webovej aplikácie (hosting).
            </li>
          </ul>
          <p>
            Ak sa údaje prenášajú mimo EÚ, deje sa to na základe štandardných zmluvných doložiek Európskej komisie, ktoré sú súčasťou zmlúv so
            subdodávateľmi.
          </p>

          <h2>Kontakt</h2>
          <p>
            Otázky k ochrane údajov posielajte na {mail}. Zamestnanci zákazníka sa so žiadosťami o svoje údaje obracajú najprv na svojho
            zamestnávateľa. Ak máte pocit, že s údajmi nezaobchádzame správne, môžete sa obrátiť aj na Úrad na ochranu osobných údajov SR.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
