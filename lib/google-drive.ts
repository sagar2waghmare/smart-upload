import { importPKCS8, SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_MEDIA_URL = "https://www.googleapis.com/drive/v3/files";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

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
      const parsed = JSON.parse(result.value);
      if (parsed.client_email && parsed.private_key) return parsed as ServiceAccount;
    } catch {
      // fall through
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return {
      project_id: projectId ?? "",
      client_email: clientEmail,
      private_key: privateKey,
    };
  }
  return null;
}

async function signJwt(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  return new SignJWT({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(privateKey);
}

async function exchangeJwtForToken(jwt: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.error("[google-drive] Token exchange failed", res.status);
    throw new Error("Google Drive authentication failed");
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function googleDriveConfigured(): boolean {
  return parseServiceAccount() !== null;
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const sa = parseServiceAccount();
  if (!sa) throw new Error("Google Drive: service account not configured");

  const jwt = await signJwt(sa);
  const token = await exchangeJwtForToken(jwt);
  cachedToken = token;
  tokenExpiresAt = now + 50 * 60 * 1000;
  return token;
}

export function driveMediaUrl(fileId: string): string {
  return `${DRIVE_MEDIA_URL}/${fileId}?alt=media`;
}

export async function driveFetch(
  url: string,
  headers: Record<string, string>
): Promise<Response> {
  let token = await getAccessToken();
  let res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${token}` } });

  if (res.status === 401) {
    cachedToken = null;
    tokenExpiresAt = 0;
    token = await getAccessToken();
    res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${token}` } });
  }

  return res;
}
