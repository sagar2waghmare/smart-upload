"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

function GoogleGIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.56-5.17 3.56-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.3v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.55V6.64H1.3a12 12 0 0 0 0 10.73l3.97-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.58 1.79l3.43-3.43A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.3 6.64l3.97 3.08C6.22 6.88 8.87 4.76 12 4.76z"
      />
    </svg>
  );
}

export function LoginScreen() {
  const { configured, loading, user, signIn } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.refresh();
  }, [user, router]);

  if (user) return null;

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    const res = await signIn();
    if (!res.ok) {
      setError(res.error ?? "Sign-in failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <main className="login-screen">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark login-brand-mark" aria-hidden="true">
            S
          </span>
          <span className="login-app-name">Smart Upload</span>
        </div>
        <h1 className="login-title">Welcome to Smart Upload</h1>
        <p className="login-sub">
          Your private media library is locked. Continue with your Google account to open it.
        </p>
        {loading ? (
          <div className="login-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Checking session…</span>
          </div>
        ) : configured ? (
          <>
            <button className="login-google" onClick={handleSignIn} disabled={busy}>
              <GoogleGIcon />
              {busy ? "Connecting to Google…" : "Continue with Google"}
            </button>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <p className="login-note">Sign-in is not configured.</p>
        )}
        <p className="login-foot">Private media library · your content, your space</p>
      </div>
    </main>
  );
}