import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { SignupForm } from "./SignupForm";
import "../site.css";

export const metadata = { title: "Zriadenie služby – KdeJe" };

export default function SignupPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="site-sec">
        <div className="site-in signup-in">
          <div className="signup-copy">
            <h1>Požiadajte o zriadenie KdeJe</h1>
            <p className="lead">Prvých 12 mesiacov je zdarma. Po skontrolovaní žiadosti pošleme adminovi vašej firmy pozvánku e-mailom.</p>
            <ul className="signup-points">
              <li>Admin potom pridá zamestnancov a pošle im pozvánky.</li>
              <li>Zamestnanci sa prihlasujú odkazom do e-mailu, bez hesla.</li>
              <li>Zamestnancov bez e-mailu môže viesť vedúci alebo admin.</li>
            </ul>
          </div>
          <SignupForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
