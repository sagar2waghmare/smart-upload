import { cert, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let cachedApp: App | null = null;

export interface SessionUser {
  uid: string;
  email: string | null;
}

function parseServiceAccount(): ServiceAccount | null {
  const blob = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (blob) {
    try {
      return JSON.parse(blob) as ServiceAccount;
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

function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  const sa = parseServiceAccount();
  if (!sa) return null;
  cachedApp = initializeApp({ credential: cert(sa) }, "smart-upload-admin");
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