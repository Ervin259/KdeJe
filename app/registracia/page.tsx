import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { SignupForm } from "./SignupForm";
import { loadPlatformSettings, months } from "@/lib/billing";
import "../site.css";

export const metadata = { title: "Zriadenie služby – KdeJe" };

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const s = await loadPlatformSettings();
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-sec">
        <div className="site-in signup-in">
          <div className="signup-copy">
            <h1>Požiadajte o zriadenie KdeJe</h1>
            <p className="lead">
              Prvé {months(s.trial_months)} od zriadenia sú zdarma. Po skontrolovaní žiadosti pošleme adminovi vašej firmy pozvánku e-mailom.
            </p>
            <ul className="signup-points">
              <li>Admin potom pridá užívateľov a pošle im pozvánky.</li>
              <li>Zamestnanci sa prihlasujú odkazom do e-mailu, bez hesla.</li>
              <li>Užívateľov bez e-mailu môže viesť vedúci alebo admin.</li>
            </ul>
          </div>
          <SignupForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
