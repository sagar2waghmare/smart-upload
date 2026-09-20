"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  firebaseClientConfigured,
  loadFirebaseClientConfig,
  signInWithGoogle,
  signOutSession,
} from "../lib/firebase-client";

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
  const router = useRouter();
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ email: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const config = await loadFirebaseClientConfig();
      if (cancelled) return;

      const ready = Boolean(config) || firebaseClientConfigured();
      setConfigured(ready);

      if (!ready) {
        setLoading(false);
        return;
      }

      fetch("/api/auth/session")
        .then((r) => r.json().catch(() => ({})))
        .then((d: { authenticated?: boolean; email?: string | null }) => {
          if (!cancelled && d.authenticated) setUser({ email: d.email ?? null });
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    const res = await signInWithGoogle();
    if (res.ok) {
      setUser({ email: res.email ?? null });
      router.refresh();
    }
    return res;
  }, [router]);

  const signOut = useCallback(async () => {
    await signOutSession();
    setUser(null);
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ configured, loading, user, signIn, signOut }),
    [configured, loading, user, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
