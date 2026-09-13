"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
} from "firebase/auth";

let cachedApp: FirebaseApp | null = null;

export function firebaseClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseClientConfigured()) return null;
  if (cachedApp) return cachedApp;
  const existing = getApps().find((a) => a.name === "smart-upload");
  if (existing) return existing;
  cachedApp = initializeApp(
    {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
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