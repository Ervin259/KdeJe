import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { SupplierBlock } from "@/components/site/Supplier";
import { eur, loadPlatformSettings, months } from "@/lib/billing";
import "../site.css";

export const metadata = { title: "Obchodné podmienky – KdeJe" };
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const s = await loadPlatformSettings();
  const price = eur(s.price_month);
  const minYear = eur(s.min_employees * 12 * s.price_month);
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-sec">
        <article className="site-in doc">
          <p className="doc-ver">Verzia 2 · platné od 26. 10. 2026</p>
          <h1>Obchodné podmienky služby KdeJe</h1>
          <p className="lead">
            Stručne: prvé {months(s.trial_months)} zdarma, potom {price} za aktívneho užívateľa mesačne, fakturované raz ročne vopred. Dáta patria
            vám a môžete si ich kedykoľvek stiahnuť.
          </p>

          <nav className="doc-toc" aria-label="Obsah">
            {[
              ["dodavatel", "Dodávateľ a služba"],
              ["zriadenie", "Zriadenie služby"],
              ["skuska", "Skúšobné obdobie"],
              ["cena", "Cena"],
              ["fakturacia", "Fakturácia a platby"],
              ["omeskanie", "Neuhradená faktúra"],
              ["ukoncenie", "Ukončenie"],
              ["data", "Údaje a zálohy"],
              ["zodpovednost", "Dostupnosť a zodpovednosť"],
              ["zmeny", "Zmeny podmienok"],
            ].map(([id, t], i) => (
              <a key={id} href={`#${id}`}>
                {i + 1}. {t}
              </a>
            ))}
          </nav>

          <h2 id="dodavatel">1. Dodávateľ a služba</h2>
          <SupplierBlock s={s} />
          <p>
            KdeJe je webová aplikácia na evidenciu dochádzky a neprítomností zamestnancov (ďalej „služba“), dostupná na adrese kdeje.app. Služba je
            určená firmám a podnikateľom (ďalej „zákazník“). Zmluva medzi dodávateľom a zákazníkom sa riadi Obchodným zákonníkom; ustanovenia o
            ochrane spotrebiteľa sa neuplatňujú.
          </p>

          <h2 id="zriadenie">2. Zriadenie služby</h2>
          <ul>
            <li>
              Zákazník požiada o zriadenie cez <Link href="/registracia">formulár na stránke</Link> a uvedie údaje firmy a e-mail osoby, ktorá
              bude službu spravovať (admin).
            </li>
            <li>Po schválení žiadosti príde adminovi pozvánka e-mailom. Schválením žiadosti vzniká zmluva podľa týchto podmienok.</li>
            <li>Dodávateľ môže žiadosť odmietnuť, napríklad pri neúplných alebo nepravdivých údajoch.</li>
            <li>Zákazník zodpovedá za to, kto má v jeho firme prístup a s akou rolou (admin, vedúci, zamestnanec).</li>
          </ul>

          <h2 id="skuska">3. Skúšobné obdobie</h2>
          <ul>
            <li>
              Skúšobné obdobie trvá <b>{months(s.trial_months)}</b> odo dňa zriadenia. Počas neho je služba bezplatná a v plnom rozsahu, bez
              obmedzenia počtu užívateľov.
            </li>
            <li>
              Počas skúšobného obdobia nič neplatíte a nedostanete žiadnu faktúru. Posledných 14 dní vás aplikácia upozorní, kedy skúšobné obdobie
              končí.
            </li>
            <li>
              Ak chcete pokračovať, admin to <b>potvrdí v aplikácii</b> (Nastavenia → Firma → Predplatné → „Pokračovať v používaní“). Až potom
              vystavíme prvú faktúru na nasledujúcich 12 mesiacov.
            </li>
            <li>
              Ak pokračovanie nepotvrdíte, po skončení skúšobného obdobia prejde aplikácia do režimu len na čítanie – bez faktúry a bez akýchkoľvek
              poplatkov. Údaje si môžete exportovať. Ak ani do {s.delete_after_days} dní nepotvrdíte pokračovanie, údaje môžeme vymazať; najmenej 14
              dní predtým vás upozorníme e-mailom.
            </li>
          </ul>

          <h2 id="cena">4. Cena</h2>
          <ul>
            <li>
              <b>{price} za aktívneho užívateľa mesačne</b>, teda {eur(12 * s.price_month)} za užívateľa ročne. Iné zľavy ani balíky
              neponúkame.
            </li>
            <li>
              Aktívny užívateľ je každý zamestnanec alebo iná osoba, ktorú zákazník vedie v aplikácii ako aktívnu – aj keď sa do aplikácie sama
              neprihlasuje a jej dochádzku zapisuje vedúci alebo admin. Skrytí (odregistrovaní) užívatelia a správcovia, ktorí nie sú zamestnancami
              firmy, sa nerátajú.
            </li>
            <li>
              Účtuje sa najmenej <b>{s.min_employees} užívateľov</b>, teda najmenej {minYear} ročne.
            </li>
            <li>
              Ceny sú konečné. Dodávateľ nie je platiteľ DPH. Ak by sa ním stal, cena sa zvýši o DPH v zákonnej výške; zákazníkovi to oznámi
              najmenej 30 dní vopred.
            </li>
            <li>Inú zmenu ceny dodávateľ oznámi najmenej 60 dní vopred a platí až od nasledujúceho ročného obdobia.</li>
          </ul>

          <h2 id="fakturacia">5. Fakturácia a platby</h2>
          <ul>
            <li>
              Služba sa fakturuje <b>raz ročne vopred</b>, vždy na 12 mesiacov, podľa počtu aktívnych užívateľov v deň vystavenia faktúry (najmenej{" "}
              {s.min_employees}). Prvú faktúru vystavíme po potvrdení pokračovania, ďalšie vždy najneskôr 30 dní pred koncom zaplateného obdobia.
            </li>
            <li>
              <b>Ročné vyrovnanie.</b> Pri ďalšej ročnej faktúre porovnáme, za koľko užívateľov ste zaplatili a koľko ste ich v jednotlivých
              mesiacoch naozaj mali. Za každý mesiac obdobia sa ráta skutočný počet aktívnych užívateľov, najmenej {s.min_employees}. Užívateľ sa
              ráta v mesiaci, v ktorom bol aktívny aspoň jeden deň – ak ho odregistrujete (skryjete), platí sa za neho len do konca mesiaca, v
              ktorom bol ešte aktívny.
            </li>
            <li>
              Ak ste mali viac užívateľov, než ste zaplatili, rozdiel sa <b>pripočíta</b> k ďalšej faktúre. Ak menej, rozdiel sa{" "}
              <b>odpočíta</b> z ďalšej faktúry. Peniaze sa nevracajú a dobropisy sa nevystavujú – preplatok sa vždy vyrovná na ďalšej faktúre.
            </li>
            <li>
              Faktúra nikdy neklesne pod nulu. Ak je odpočet vyšší ako nová faktúra, zvyšok sa prenesie na nasledujúcu faktúru.
            </li>
            <li>
              Faktúra sa posiela e-mailom a zákazník ju vidí aj v aplikácii (Nastavenia → Firma → Predplatné) spolu s platobnými údajmi.
            </li>
            <li>
              Splatnosť faktúry je <b>{s.due_days} dní</b>. Platí sa bankovým prevodom s variabilným symbolom uvedeným na faktúre.
            </li>
          </ul>

          <h2 id="omeskanie">6. Neuhradená faktúra</h2>
          <ul>
            <li>Po splatnosti dodávateľ zákazníka upozorní a v aplikácii sa adminovi zobrazí oznam.</li>
            <li>
              Ak faktúra nie je uhradená ani <b>{s.grace_days} dní po splatnosti</b>, služba prejde do režimu <b>len na čítanie</b>: údaje sa dajú
              prezerať aj exportovať, ale nové zápisy a zmeny nie sú možné.
            </li>
            <li>Po pripísaní platby sa plný prístup obnoví, zvyčajne v najbližší pracovný deň.</li>
            <li>
              Ak ani {s.delete_after_days} dní od obmedzenia nie je faktúra uhradená, zmluva zaniká a údaje zákazníka môžu byť vymazané. Najmenej 14
              dní pred vymazaním dodávateľ upozorní admina e-mailom.
            </li>
          </ul>

          <h2 id="ukoncenie">7. Ukončenie</h2>
          <ul>
            <li>
              Zákazník môže službu kedykoľvek ukončiť e-mailom. Služba potom beží do konca zaplateného obdobia. Zaplatená cena ani nevyčerpaný
              odpočet z ročného vyrovnania sa nevracajú, pretože už nie je ďalšia faktúra, z ktorej by sa odpočítali.
            </li>
            <li>
              Dodávateľ môže zmluvu vypovedať s výpovednou lehotou 3 mesiace. V takom prípade vráti pomernú časť ceny za celé nevyčerpané mesiace.
            </li>
            <li>
              Po skončení zmluvy má zákazník 30 dní na export údajov. Potom sa údaje vymažú z aplikácie a pri najbližšej obmene záloh aj zo záloh.
            </li>
          </ul>

          <h2 id="data">8. Údaje a zálohy</h2>
          <ul>
            <li>
              Údaje, ktoré zákazník do aplikácie zadá, patria zákazníkovi. Pri osobných údajoch zamestnancov je zákazník prevádzkovateľom a
              dodávateľ sprostredkovateľom. Podrobnosti sú v <Link href="/ochrana-udajov">podmienkach ochrany údajov</Link>, ktoré sú súčasťou
              zmluvy.
            </li>
            <li>Zákazník zodpovedá za správnosť zadaných údajov a za to, že ich smie spracúvať.</li>
            <li>
              Admin si môže kedykoľvek stiahnuť užívateľov, záznamy dochádzky a dovolenky vo formáte CSV (Nastavenia → Firma → Export dát),
              napríklad do vlastnej zálohy.
            </li>
            <li>Dodávateľ zálohuje databázu najmenej raz denne a zálohy uchováva 30 dní.</li>
          </ul>

          <h2 id="zodpovednost">9. Dostupnosť a zodpovednosť</h2>
          <ul>
            <li>
              Dodávateľ sa snaží, aby služba bola dostupná nepretržite. Plánované odstávky robí podľa možností mimo pracovného času. Nepretržitú
              dostupnosť negarantuje.
            </li>
            <li>
              Aplikácia uľahčuje evidenciu, ale za výsledné podklady (napríklad pre mzdy) zodpovedá zákazník – pred odovzdaním mzdovej účtovníčke ich
              skontroluje.
            </li>
            <li>
              Zodpovednosť dodávateľa za škodu je obmedzená na výšku ceny, ktorú zákazník zaplatil za posledných 12 mesiacov. Neplatí to pre škodu
              spôsobenú úmyselne alebo hrubou nedbanlivosťou.
            </li>
          </ul>

          <h2 id="zmeny">10. Zmeny podmienok</h2>
          <ul>
            <li>Zmenu podmienok dodávateľ oznámi adminovi e-mailom najmenej 30 dní pred jej účinnosťou.</li>
            <li>Ak zákazník so zmenou nesúhlasí, môže zmluvu ukončiť ku dňu účinnosti zmeny a dostane späť pomernú časť ceny za nevyčerpané mesiace.</li>
            <li>Otázky a výpovede posielajte na e-mail dodávateľa uvedený vyššie.</li>
          </ul>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
