"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  // Pozvánka s predvolenou šablónou Supabase vracia prihlásenie v časti URL za „#“
  // (#access_token=…&refresh_token=…). Server ju nevidí, preto ju prevezmeme tu.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const hashError = hash.get("error_description");
    if (hashError) {
      setState("error");
      setError("Odkaz je neplatný alebo mu vypršala platnosť. Pošlite si nový.");
      history.replaceState(null, "", window.location.pathname);
      return;
    }
    if (!access_token || !refresh_token) return;
    setState("sending");
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        history.replaceState(null, "", window.location.pathname);
        if (error) {
          setState("error");
          setError("Prihlásenie z odkazu sa nepodarilo: " + error.message);
        } else {
          window.location.replace("/kalendar");
        }
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Účty zakladá admin pozvánkou – cez prihlásenie sa nový účet nevytvorí
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setState("error");
      setError(
        error.message.toLowerCase().includes("signups not allowed") ||
          error.message.toLowerCase().includes("not found")
          ? "Tento e-mail nemá v KdeJe účet. Obráťte sa na administrátora."
          : error.message
      );
    } else {
      setState("sent");
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">
          <h1>
            Kde<b>Je</b>
          </h1>
        </div>
        <p className="muted">Euro Data Distribution s.r.o.</p>

        {state === "sent" ? (
          <p className="okmsg">
            Na adresu <b>{email}</b> sme poslali odkaz na prihlásenie. Otvorte ho v tomto prehliadači.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <label htmlFor="email">Pracovný e-mail</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="meno@firma.sk"
            />
            <button className="btn primary" disabled={state === "sending"}>
              {state === "sending" ? "Posielam…" : "Poslať prihlasovací odkaz"}
            </button>
            {state === "error" && <p className="err">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
