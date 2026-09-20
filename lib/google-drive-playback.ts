import { importPKCS8, SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DEFAULT_MEDIA_FOLDER_ID = "1TEIGqujqwuNnzl_WfdHOYRWU_-4bWRp_";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

interface ServiceAccount { client_email: string; private_key: string; }
type CachedAccess = { token: string; expiresAt: number };
type MediaCheck = { id: string; name?: string; parents?: string[]; mimeType?: string; trashed?: boolean; size?: string };
type CachedMedia = { item: MediaCheck; expiresAt: number };

let cachedAccess: CachedAccess | null = null;
let tokenPromise: Promise<string> | null = null;
const mediaChecks = new Map<string, { valid: boolean; expiresAt: number }>();
const mediaMetadata = new Map<string, CachedMedia>();

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const value = raw.startsWith("{") ? raw : readFileSync(resolve(raw), "utf8");
      const parsed = JSON.parse(value) as ServiceAccount;
      if (parsed.client_email && parsed.private_key) return parsed;
    } catch { /* fall through */ }
  }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (clientEmail && privateKey) return { client_email: clientEmail, private_key: privateKey };
  return null;
}

async function accessToken(): Promise<string> {
  if (cachedAccess && Date.now() < cachedAccess.expiresAt) return cachedAccess.token;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const sa = serviceAccount();
    if (!sa) throw new Error("Google Drive service account not configured");
    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(sa.private_key, "RS256");
    const assertion = await new SignJWT({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" }).sign(key);
    const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
    const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!res.ok) { console.error("[google-drive-playback] token exchange failed", res.status); throw new Error("Google Drive authentication failed"); }
    const data = (await res.json()) as { access_token: string };
    cachedAccess = { token: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
    return data.access_token;
  })();
  try { return await tokenPromise; } finally { tokenPromise = null; }
}

async function metadata(fileId: string, token: string): Promise<MediaCheck> {
  const cached = mediaMetadata.get(fileId);
  if (cached && cached.expiresAt > Date.now()) return cached.item;
  const url = `${DRIVE_API_URL}/${encodeURIComponent(fileId)}?fields=id,name,parents,mimeType,trashed,size`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "force-cache", next: { revalidate: 300 } });
  if (res.status === 401) { cachedAccess = null; throw new Error("Google Drive authentication expired"); }
  if (!res.ok) throw new Error("Google Drive media not found");
  const item = (await res.json()) as MediaCheck;
  mediaMetadata.set(fileId, { item, expiresAt: Date.now() + 5 * 60 * 1000 });
  return item;
}

async function mediaRoot(token: string): Promise<string> {
  const configured = process.env.SMART_UPLOAD_DRIVE_MEDIA_ID?.trim();
  if (configured) return configured;
  const res = await fetch(`${DRIVE_API_URL}/${DEFAULT_MEDIA_FOLDER_ID}?fields=id,mimeType`, { headers: { Authorization: `Bearer ${token}` }, cache: "force-cache", next: { revalidate: 3600 } });
  if (res.ok) {
    const data = (await res.json()) as { id: string; mimeType?: string };
    if (data.mimeType === DRIVE_FOLDER_MIME) return data.id;
  }
  throw new Error("Google Drive MEDIA folder not found");
}

async function isInsideMedia(fileId: string, token: string): Promise<boolean> {
  const cached = mediaChecks.get(fileId);
  if (cached && cached.expiresAt > Date.now()) return cached.valid;
  const root = await mediaRoot(token);
  let currentId = fileId;
  const visited = new Set<string>();
  for (let depth = 0; depth < 12; depth += 1) {
    if (currentId === root) {
      mediaChecks.set(fileId, { valid: true, expiresAt: Date.now() + 30 * 60 * 1000 });
      return true;
    }
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const item = await metadata(currentId, token);
    if (item.trashed) break;
    const parent = item.parents?.[0];
    if (!parent) break;
    currentId = parent;
  }
  mediaChecks.set(fileId, { valid: false, expiresAt: Date.now() + 60 * 1000 });
  return false;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function findPreparedBrowserMedia(fileId: string): Promise<string | null> {
  const id = fileId.trim();
  if (!id) return null;
  const token = await accessToken();
  const item = await metadata(id, token);
  if (item.trashed || !item.mimeType?.startsWith("video/") || !item.name || !item.parents?.[0]) return null;

  const ext = item.name.includes(".") ? item.name.slice(item.name.lastIndexOf(".")) : "";
  const base = ext ? item.name.slice(0, -ext.length) : item.name;
  const preparedName = `${base}.browser.mp4`;
  const query = `'${escapeDriveQueryValue(item.parents[0])}' in parents and name = '${escapeDriveQueryValue(preparedName)}' and trashed = false`;
  const url = new URL(DRIVE_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("fields", "files(id,name,mimeType,size,parents)");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { files?: MediaCheck[] };
  const prepared = data.files?.find(
    (file) => file.id && file.mimeType === "video/mp4" && file.name === preparedName,
  );
  return prepared?.id ?? null;
}

export async function findPreparedAudioTracks(fileId: string): Promise<Array<{ label: string; language?: string; id: string }>> {
  const id = fileId.trim();
  if (!id) return [];
  const token = await accessToken();
  const item = await metadata(id, token);
  if (item.trashed || !item.name || !item.parents?.[0]) return [];

  const ext = item.name.includes(".") ? item.name.slice(item.name.lastIndexOf(".")) : "";
  const base = ext ? item.name.slice(0, -ext.length) : item.name;
  const prefix = `${base}.browser.audio.`;

  const query = `'${escapeDriveQueryValue(item.parents[0])}' in parents and trashed = false and name contains '${escapeDriveQueryValue(prefix)}'`;
  const url = new URL(DRIVE_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("fields", "files(id,name,mimeType,size,parents)");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { files?: MediaCheck[] };
  return (data.files ?? [])
    .filter((file) => file.id && file.name?.startsWith(prefix) && file.name.endsWith(".m4a"))
    .map((file) => {
      const tokenPart = file.name!.slice(prefix.length, -".m4a".length);
      const parts = tokenPart.split(".");
      const language = parts.length >= 2 ? parts[1] : undefined;
      const index = Number(parts[0]);
      const labelMap: Record<string, string> = {
        eng: "English", en: "English",
        hin: "Hindi", hi: "Hindi",
        tam: "Tamil", ta: "Tamil",
        tel: "Telugu", te: "Telugu",
        mal: "Malayalam", ml: "Malayalam",
        kan: "Kannada", kn: "Kannada",
        ben: "Bengali", bn: "Bengali",
        mar: "Marathi", mr: "Marathi",
        pan: "Punjabi", pa: "Punjabi",
        guj: "Gujarati", gu: "Gujarati",
        und: "Unknown",
      };
      const label = labelMap[(language ?? "").toLowerCase()] ?? (language ? language.toUpperCase() : `Audio ${Number.isFinite(index) ? index + 1 : ""}`.trim());
      return { id: file.id!, label, language, index };
    })
    .sort((a, b) => (a.index - b.index) || a.label.localeCompare(b.label))
    .map(({ id: trackId, label, language }) => ({ id: trackId, label, language }));
}

export async function getDriveMediaMimeType(fileId: string): Promise<string | null> {
  const id = fileId.trim();
  if (!id) return null;
  const token = await accessToken();
  const item = await metadata(id, token);
  if (item.trashed || !item.mimeType?.startsWith("video/") || !(await isInsideMedia(id, token))) return null;
  return item.mimeType;
}

export async function validateDriveMedia(fileId: string): Promise<boolean> {
  const id = fileId.trim();
  if (!id) return false;
  const token = await accessToken();
  const item = await metadata(id, token);
  if (item.trashed || !item.mimeType?.startsWith("video/")) return false;
  return isInsideMedia(id, token);
}

export async function drivePlaybackFetch(fileId: string, headers: Record<string, string>): Promise<Response> {
  const id = fileId.trim();
  if (!id) throw new Error("Invalid media id");
  let token = await accessToken();
  const item = await metadata(id, token);
  if (item.trashed || !item.mimeType?.startsWith("video/")) throw new Error("Media is not a playable video");
  if (!(await isInsideMedia(id, token))) throw new Error("Media is outside the Smart Upload library");
  const url = `${DRIVE_API_URL}/${encodeURIComponent(id)}?alt=media`;
  let res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401) {
    cachedAccess = null;
    token = await accessToken();
    res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${token}` }, cache: "no-store" });
  }
  return res;
}
