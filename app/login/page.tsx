"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

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
        <div className="logo logo-lg">
          Kde<span>Je</span>
        </div>
        <p className="muted">Euro Data Distribution s.r.o.</p>

        {state === "sent" ? (
          <p className="ok">
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
            <button className="btn btn-primary" disabled={state === "sending"}>
              {state === "sending" ? "Posielam…" : "Poslať prihlasovací odkaz"}
            </button>
            {state === "error" && <p className="err">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
