"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
} from "firebase/auth";

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

let cachedApp: FirebaseApp | null = null;
let runtimeConfig: FirebaseClientConfig | null = null;

function staticFirebaseConfig(): FirebaseClientConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !authDomain || !projectId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
  };
}

export function setFirebaseClientConfig(config: FirebaseClientConfig | null): void {
  runtimeConfig = config;
  cachedApp = null;
}

export async function loadFirebaseClientConfig(): Promise<FirebaseClientConfig | null> {
  try {
    const res = await fetch("/api/auth/config", { cache: "no-store" });
    if (!res.ok) return runtimeConfig ?? staticFirebaseConfig();
    const data = (await res.json()) as {
      configured?: boolean;
      config?: FirebaseClientConfig | null;
    };
    if (data.configured && data.config) {
      setFirebaseClientConfig(data.config);
      return data.config;
    }
  } catch {
    // Fall back to build-time NEXT_PUBLIC_* configuration below.
  }

  return runtimeConfig ?? staticFirebaseConfig();
}

export function firebaseClientConfigured(): boolean {
  return Boolean(runtimeConfig ?? staticFirebaseConfig());
}

export function getFirebaseApp(): FirebaseApp | null {
  const config = runtimeConfig ?? staticFirebaseConfig();
  if (!config) return null;
  if (cachedApp) return cachedApp;

  const existing = getApps().find((a) => a.name === "smart-upload");
  if (existing) {
    cachedApp = existing;
    return existing;
  }

  cachedApp = initializeApp(
    {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    },
    "smart-upload"
  );
  return cachedApp;
}

export async function signInWithGoogle(): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
}> {
  const app = getFirebaseApp();
  if (!app) return { ok: false, error: "Sign-in is not configured." };
  const auth = getAuth(app);
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    const idToken = await cred.user.getIdToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; email?: string };
    if (!res.ok) {
      await fbSignOut(auth).catch(() => {});
      return { ok: false, error: data.message ?? "Sign-in failed." };
    }
    return { ok: true, email: data.email };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sign-in failed." };
  }
}

export async function signOutSession(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  const app = getFirebaseApp();
  if (app) await fbSignOut(getAuth(app)).catch(() => {});
}
