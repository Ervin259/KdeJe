import { getMe } from "@/lib/data";
import { Header } from "@/components/Header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();

  if (!me) {
    return (
      <main className="login">
        <div className="login-card">
          <div className="logo logo-lg">
            Kde<span>Je</span>
          </div>
          <p>
            Ste prihlásený, ale váš účet zatiaľ nie je prepojený so zamestnancom. Požiadajte administrátora, aby
            vám v KdeJe doplnil tento e-mail.
          </p>
          <form action="/auth/signout" method="post">
            <button className="btn">Odhlásiť</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <>
      <Header me={me} />
      <main className="page">{children}</main>
    </>
  );
}
