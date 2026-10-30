import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import "../site.css";

export const metadata = { title: "Návod – KdeJe" };

export default function GuidePage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-sec">
        <article className="site-in doc">
          <h1>Návod na KdeJe</h1>
          <p className="lead">Ako začať a ako aplikáciu používa admin, vedúci a zamestnanec.</p>

          <nav className="doc-toc" aria-label="Obsah">
            <a href="#prihlasenie">Prihlásenie</a>
            <a href="#zamestnanec">Zamestnanec</a>
            <a href="#veduci">Vedúci</a>
            <a href="#admin">Admin – prvé kroky</a>
            <a href="#mesiac">Koniec mesiaca</a>
            <a href="#predplatne">Predplatné</a>
            <a href="#otazky">Časté otázky</a>
          </nav>

          <h2 id="prihlasenie">Prihlásenie</h2>
          <ol>
            <li>
              Na <Link href="/login">kdeje.app/login</Link> zadajte pracovný e-mail a kliknite na „Poslať prihlasovací odkaz“.
            </li>
            <li>Otvorte e-mail od KdeJe a kliknite na odkaz – v tom istom prehliadači, v ktorom chcete aplikáciu používať.</li>
            <li>Heslo nepotrebujete. Prihlásenie vydrží, kým sa neodhlásite alebo nevymažete údaje prehliadača.</li>
          </ol>

          <h2 id="zamestnanec">Zamestnanec</h2>
          <ul>
            <li>
              <b>Kalendár</b> ukazuje, kto je mimo práce. Kliknutím do svojho riadku zapíšete neprítomnosť – dovolenku, lekára, OČR, PN, služobnú
              cestu alebo home office. Vyberiete celý deň, pol dňa alebo hodiny.
            </li>
            <li>
              <b>Oprava:</b> kliknite na svoj záznam. Do uzávierky mesiaca ho môžete zmeniť alebo vymazať sami. Po uzávierke napíšete dôvod a zmena
              počká na schválenie.
            </li>
            <li>
              <b>Môj prehľad</b> ukazuje nárok na dovolenku, čerpanie, zostatok a koľko treba dočerpať do konca roka, aj návštevy lekára a OČR.
            </li>
            <li>
              <b>Odsúhlasenie mesiaca</b> (všetci okrem dohodárov): v posledných dňoch mesiaca (od 3 dní pred jeho koncom) kliknite v kalendári na „Odsúhlasiť“. Potvrdíte tým, že
              záznamy sedia.
            </li>
          </ul>

          <h2 id="veduci">Vedúci</h2>
          <ul>
            <li>Vedúci má okrem svojho kalendára aj záložky Prehľad a Schvaľovanie – vidí v nich len ľudí, ktorých mu admin priradil.</li>
            <li>Za svojich ľudí zapisuje a opravuje neprítomnosti do uzávierky mesiaca, aj keď sa sami do aplikácie neprihlasujú.</li>
            <li>Schvaľuje ich žiadosti pred uzávierkou. Zmeny po uzávierke schvaľuje admin.</li>
          </ul>

          <h2 id="admin">Admin – prvé kroky</h2>
          <ol>
            <li>
              <b>Nastavenia → Firma → Údaje o firme:</b> skontrolujte názov, IČO a doplňte fakturačné údaje.
            </li>
            <li>
              <b>Nastavenia → Pravidlá:</b> pracovná doba (časy, obed, stravné lístky), typy neprítomností, ktoré používate, a kedy sa mesiac
              uzamkne.
            </li>
            <li>
              <b>Nastavenia → Kalendár → Sviatky:</b> načítajte štátne sviatky na rok a pridajte prípadné firemné voľno.
            </li>
            <li>
              <b>Nastavenia → Užívatelia → Zamestnanci:</b> pridajte zamestnancov (meno, e-mail, pracovný pomer, nárok na dovolenku a prenos z minulého
              roka). Kto nemá e-mail, môže byť v aplikácii aj tak – zapisuje zaňho vedúci alebo admin.
            </li>
            <li>
              <b>Pozvánky:</b> v zozname zamestnancov zaškrtnite ľudí v stĺpci Prístup a pošlite im pozvánku.
            </li>
            <li>
              <b>Vedúci:</b> na karte zamestnanca zapnite „Vedúci“ a zaškrtnite ľudí, ktorých spravuje. Prehľad je v Nastavenia → Užívatelia → Roly
              a prístupy.
            </li>
          </ol>

          <h2 id="mesiac">Koniec mesiaca</h2>
          <ol>
            <li>Zamestnanci na TPP si odsúhlasia mesiac; v Podklade pre mzdy vidíte, kto ešte nie, a môžete odsúhlasiť za nich.</li>
            <li>Po uzávierke (podľa nastavenia, napr. 3 dni po skončení mesiaca) sa mesiac zamkne. Neskoršie zmeny prídu ako žiadosti do Schvaľovania.</li>
            <li>
              <b>Podklad pre mzdy</b> skopírujte tlačidlom Export a vložte do Excelu, alebo ho pošlite mzdovej účtovníčke. Pred odoslaním ho
              skontrolujte.
            </li>
            <li>
              Kedykoľvek si môžete stiahnuť všetky dáta do CSV: Nastavenia → Firma → Údaje o firme → Export dát.
            </li>
          </ol>

          <h2 id="predplatne">Skúšobná doba a predplatné</h2>
          <ul>
            <li>Prvé mesiace sú zdarma. Posledných 14 dní skúšobnej doby uvidí admin v hlavičke upozornenie.</li>
            <li>
              Ak chcete pokračovať, admin klikne na <b>„Pokračovať v používaní“</b> v Nastavenia → Firma → Predplatné. Potom príde faktúra na 12
              mesiacov.
            </li>
            <li>Bez potvrdenia je aplikácia po skúšobnej dobe len na čítanie – nič neplatíte a údaje si môžete exportovať.</li>
            <li>
              Faktúry, platobné údaje a ročné vyrovnanie počtu užívateľov nájdete v Predplatnom. Podrobnosti sú v{" "}
              <Link href="/podmienky">obchodných podmienkach</Link>.
            </li>
          </ul>

          <h2 id="otazky">Časté otázky</h2>
          <dl className="doc-faq">
            <dt>Prihlasovací odkaz nefunguje alebo je „neplatný“.</dt>
            <dd>
              Odkaz platí obmedzený čas a dá sa použiť raz. Pošlite si nový. Ak používate Outlook, niekedy odkaz vopred „otvorí“ ochrana pred
              škodlivými odkazmi – vtedy si pošlite odkaz znova a otvorte ho hneď.
            </dd>
            <dt>Zamestnanec nemá e-mail.</dt>
            <dd>Pridajte ho bez e-mailu. Neprihlási sa, ale vedúci alebo admin zaňho zapisuje a v Prehľade aj Podklade pre mzdy je normálne.</dd>
            <dt>Kolegovia nemajú vidieť, že je niekto na PN.</dt>
            <dd>V Nastavenia → Firma → Súkromie (GDPR) zapnite zobrazovanie zdravotných neprítomností len ako „mimo“.</dd>
            <dt>Koľko to stojí?</dt>
            <dd>
              Pozrite <Link href="/#cena">cenu</Link> a <Link href="/podmienky">obchodné podmienky</Link>. Stav predplatného a faktúry vidí admin v
              Nastavenia → Firma → Predplatné.
            </dd>
          </dl>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
