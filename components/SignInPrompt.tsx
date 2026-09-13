"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function SignInPrompt({ prompt }: { prompt: boolean }) {
  const { configured, loading, user, signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!prompt || !configured || loading || user) return null;

  return (
    <section className="section" aria-label="Sign in required">
      <p className="empty-note" style={{ display: "flex", flexWrap: "wrap", gap: ".6rem 1rem", alignItems: "center" }}>
        <span style={{ flex: "1 1 auto" }}>Sign in with your allowed Google account to open your private library.</span>
        <button
          className="upload-chip"
          disabled={busy}
          onClick={async () => { setBusy(true); await signIn(); setBusy(false); }}
        >
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>
      </p>
    </section>
  );
}