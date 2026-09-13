"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { firebaseClientConfigured, signInWithGoogle, signOutSession } from "../lib/firebase-client";

interface AuthState {
  configured: boolean;
  loading: boolean;
  user: { email: string | null } | null;
  signIn: () => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  configured: false,
  loading: true,
  user: null,
  signIn: async () => ({ ok: false }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [configured] = useState(() => firebaseClientConfigured());
  const [loading, setLoading] = useState(() => !firebaseClientConfigured());
  const [user, setUser] = useState<{ email: string | null } | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json().catch(() => ({})))
      .then((d: { authenticated?: boolean; email?: string | null }) => {
        if (!cancelled && d.authenticated) setUser({ email: d.email ?? null });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const signIn = useCallback(async () => {
    const res = await signInWithGoogle();
    if (res.ok) setUser({ email: res.email ?? null });
    return res;
  }, []);

  const signOut = useCallback(async () => {
    await signOutSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ configured, loading, user, signIn, signOut }),
    [configured, loading, user, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}