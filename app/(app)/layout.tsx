import { getMe } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();

  if (!me) {
    return (
      <main className="login">
        <div className="login-card">
          <div className="brand">
            <h1>
              Kde<b>Je</b>
            </h1>
          </div>
          <p>
            Ste prihlásený, ale váš účet zatiaľ nie je prepojený so zamestnancom. Požiadajte administrátora, aby vám v
            KdeJe doplnil tento e-mail.
          </p>
          <form action="/auth/signout" method="post">
            <button className="btn">Odhlásiť</button>
          </form>
        </div>
      </main>
    );
  }

  return <div className="wrap">{children}</div>;
}
