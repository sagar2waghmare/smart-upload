import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  firebaseAdminConfigured,
  verifySessionCookie,
} from "./firebase-admin";
import type { SessionUser } from "./firebase-admin";

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const isProd = process.env.NODE_ENV === "production";

export const SESSION_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  const list = allowedEmails();
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}

export function authEnforced(): boolean {
  return firebaseAdminConfigured();
}

function authIntendedFromClient(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function localDemoUser(): SessionUser {
  return { uid: "local-demo", email: null };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!authEnforced()) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionCookie(token);
}

export async function requireSession(): Promise<SessionUser | null> {
  if (authEnforced()) return getSessionUser();
  if (isProd || authIntendedFromClient()) {
    // Auth is required (production, or client Firebase config indicates it is
    // intended) but the server-side Firebase Admin credential is missing,
    // malformed, or otherwise unavailable. Fail closed: never synthesize a
    // demo user. Safe message only — no credentials/JSON/tokens logged.
    console.error(
      "[auth] Authentication is required but Firebase Admin is not configured " +
        "(FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/" +
        "FIREBASE_PRIVATE_KEY is missing or invalid) — failing closed with 401. " +
        (isProd ? "Demo-user fallback is disabled in production." : "")
    );
    return null;
  }
  return localDemoUser();
}

export function unauthorized(message = "Sign in to continue."): NextResponse {
  return NextResponse.json({ error: "unauthorized", message }, { status: 401 });
}