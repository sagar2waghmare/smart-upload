"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

export function AccountButton() {
  const { configured, loading, user, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    const res = await signIn();
    if (!res.ok && res.error) setError(res.error);
    setBusy(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
  };

  return (
    <div className="profile-wrap source-netflix-profile-wrap" ref={menuRef}>
      <button
        className="profile source-netflix-profile"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        disabled={!configured || loading}
      >
        <span className="source-netflix-avatar">🦊</span>
      </button>

      {open && (
        <div id={id} role="menu" className="account-menu" aria-label="Account menu">
          {loading ? (
            <p className="account-note">Checking session…</p>
          ) : user ? (
            <>
              <p className="account-email" role="menuitem" aria-disabled="true">
                {user.email ?? "Signed in"}
              </p>
              <button className="account-action" onClick={handleSignOut} disabled={busy}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="account-note">
                {configured ? "Sign in to access your private library." : "Sign-in is not configured."}
              </p>
              {error && <p className="account-error">{error}</p>}
              {configured && (
                <button className="account-action" onClick={handleSignIn} disabled={busy}>
                  {busy ? "Signing in…" : "Sign in with Google"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
