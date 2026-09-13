import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let cachedApp: App | null = null;

export interface SessionUser {
  uid: string;
  email: string | null;
}

function readServiceAccountValue(): { ok: true; value: string } | { ok: false } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return { ok: false };
  const value = raw.trim();
  if (!value) return { ok: false };
  if (value.startsWith("{")) return { ok: true, value };
  try {
    const filePath = resolve(value);
    return { ok: true, value: readFileSync(filePath, "utf8") };
  } catch {
    return { ok: false };
  }
}

function parseServiceAccount(): ServiceAccount | null {
  const result = readServiceAccountValue();
  if (result.ok) {
    try {
      return JSON.parse(result.value) as ServiceAccount;
    } catch {
      return null;
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey)
    return { projectId, clientEmail, privateKey };
  return null;
}

export function firebaseAdminConfigured(): boolean {
  return parseServiceAccount() !== null;
}

const ADMIN_APP_NAME = "smart-upload-admin";

function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }
  const sa = parseServiceAccount();
  if (!sa) return null;
  cachedApp = initializeApp({ credential: cert(sa) }, ADMIN_APP_NAME);
  return cachedApp;
}

export async function verifySessionCookie(cookie: string): Promise<SessionUser | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    const decoded = await getAuth(app).verifySessionCookie(cookie, true);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

export async function verifyIdToken(idToken: string): Promise<SessionUser | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

export async function createSessionCookie(
  idToken: string,
  expiresInMs: number
): Promise<string | null> {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return await getAuth(app).createSessionCookie(idToken, { expiresIn: expiresInMs });
  } catch {
    return null;
  }
}

export async function revokeRefreshTokens(uid: string): Promise<boolean> {
  const app = getAdminApp();
  if (!app) return false;
  try {
    await getAuth(app).revokeRefreshTokens(uid);
    return true;
  } catch {
    return false;
  }
}