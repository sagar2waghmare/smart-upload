import { getApps, initializeApp, type App, type Credential, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { importPKCS8, SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let cachedApp: App | null = null;
const sessionVerificationCache = new Map<string, { user: SessionUser; expiresAt: number }>();
const SESSION_CACHE_TTL_MS = 15_000;
const SESSION_CACHE_MAX = 256;

export interface SessionUser {
  uid: string;
  email: string | null;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ADMIN_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/firebase.messaging",
  "https://www.googleapis.com/auth/identitytoolkit",
  "https://www.googleapis.com/auth/userinfo.email",
];

type RawServiceAccount = ServiceAccount & {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let cachedAccessToken: { access_token: string; expires_in: number; expires_at: number } | null = null;
let accessTokenPromise: Promise<{ access_token: string; expires_in: number }> | null = null;

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

function parseServiceAccount(): RawServiceAccount | null {
  const result = readServiceAccountValue();
  if (result.ok) {
    try {
      return JSON.parse(result.value) as RawServiceAccount;
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

function saSigningFields(sa: RawServiceAccount): { clientEmail: string; privateKey: string } | null {
  const clientEmail = sa.clientEmail || sa.client_email;
  const privateKey = sa.privateKey || sa.private_key;
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

async function mintAccessToken(): Promise<{ access_token: string; expires_in: number }> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expires_at - 60_000) {
    return {
      access_token: cachedAccessToken.access_token,
      expires_in: Math.max(60, Math.floor((cachedAccessToken.expires_at - Date.now()) / 1000)),
    };
  }
  if (accessTokenPromise) return accessTokenPromise;
  accessTokenPromise = (async () => {
    const sa = parseServiceAccount();
    const fields = sa ? saSigningFields(sa) : null;
    if (!fields) throw new Error("Firebase Admin service account not configured");
    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(fields.privateKey, "RS256");
    const assertion = await new SignJWT({
      iss: fields.clientEmail,
      scope: ADMIN_SCOPES.join(" "),
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .sign(key);
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      console.error("[firebase-admin] OAuth token exchange failed", res.status);
      throw new Error("Firebase Admin token exchange failed");
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token || typeof data.expires_in !== "number") {
      console.error("[firebase-admin] OAuth token response missing fields");
      throw new Error("Firebase Admin token response invalid");
    }
    cachedAccessToken = {
      access_token: data.access_token,
      expires_in: data.expires_in,
      expires_at: Date.now() + data.expires_in * 1000,
    };
    return { access_token: data.access_token, expires_in: data.expires_in };
  })();
  try {
    return await accessTokenPromise;
  } finally {
    accessTokenPromise = null;
  }
}

const adminCredential: Credential = {
  getAccessToken: () => mintAccessToken(),
};

const ADMIN_APP_NAME = "smart-upload-admin";

function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }
  const sa = parseServiceAccount();
  if (!sa || !saSigningFields(sa)) return null;
  const projectId = sa.projectId || sa.project_id;
  cachedApp = initializeApp(
    {
      credential: adminCredential,
      ...(projectId ? { projectId } : {}),
    },
    ADMIN_APP_NAME
  );
  return cachedApp;
}

async function sessionFingerprint(cookie: string): Promise<string> {
  const data = new TextEncoder().encode(cookie);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySessionCookie(cookie: string): Promise<SessionUser | null> {
  if (!cookie) return null;
  const fingerprint = await sessionFingerprint(cookie);
  const cached = sessionVerificationCache.get(fingerprint);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  sessionVerificationCache.delete(fingerprint);

  const app = getAdminApp();
  if (!app) return null;
  try {
    const decoded = await getAuth(app).verifySessionCookie(cookie, true);
    const user = { uid: decoded.uid, email: decoded.email ?? null };
    if (sessionVerificationCache.size >= SESSION_CACHE_MAX) {
      const oldest = sessionVerificationCache.keys().next().value;
      if (oldest) sessionVerificationCache.delete(oldest);
    }
    sessionVerificationCache.set(fingerprint, { user, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
    return user;
  } catch {
    return null;
  }
}

export async function verifyIdToken(idToken: string): Promise<SessionUser | null> {
  const app = getAdminApp();
  if (!app) {
    console.error("[firebase-admin] verifyIdToken skipped: admin app not configured");
    return null;
  }
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string };
    console.error("[firebase-admin] verifyIdToken failed", {
      name: e?.name,
      code: e?.code,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : undefined,
      hasEmail: false,
    });
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
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string };
    console.error("[firebase-admin] createSessionCookie failed", {
      name: e?.name,
      code: e?.code,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : undefined,
    });
    return null;
  }
}

export async function revokeRefreshTokens(uid: string): Promise<boolean> {
  for (const [key, value] of sessionVerificationCache) {
    if (value.user.uid === uid) sessionVerificationCache.delete(key);
  }
  const app = getAdminApp();
  if (!app) return false;
  try {
    await getAuth(app).revokeRefreshTokens(uid);
    return true;
  } catch {
    return false;
  }
}