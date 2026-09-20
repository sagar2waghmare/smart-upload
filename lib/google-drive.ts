import { importPKCS8, SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files";
const DEFAULT_MEDIA_FOLDER_ID = "1TEIGqujqwuNnzl_WfdHOYRWU_-4bWRp_";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface DriveLibraryItem {
  id: string;
  name: string;
  type: "movie" | "series" | "anime";
  path: string;
  mimeType: string;
  size: number;
  modifiedTime?: string;
  thumbnailLink?: string;
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
    return { project_id: projectId ?? "", client_email: clientEmail, private_key: privateKey };
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
  return `${DRIVE_API_URL}/${fileId}?alt=media`;
}

export async function driveFetch(url: string, headers: Record<string, string>): Promise<Response> {
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

const VIDEO_EXTENSIONS = new Set([
  ".mkv", ".mp4", ".webm", ".mov", ".avi", ".m4v", ".ts", ".m2ts", ".wmv",
]);

function mediaTypeFromPath(path: string): DriveLibraryItem["type"] {
  const parts = path.split("/").filter(Boolean).slice(1);
  const category = (parts[0] ?? "").toLowerCase().replace(/[ _-]/g, "");
  if (["series", "tv", "shows", "tvshows"].includes(category)) return "series";
  if (["anime", "animes"].includes(category)) return "anime";
  return "movie";
}

interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
}

interface DriveListResponse {
  nextPageToken?: string;
  files?: DriveFile[];
}

async function driveList(params: URLSearchParams, token: string): Promise<DriveListResponse> {
  const res = await fetch(`${DRIVE_API_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) {
    cachedToken = null;
    tokenExpiresAt = 0;
    throw new Error("Google Drive authentication expired");
  }
  if (!res.ok) {
    console.error("[google-drive] Library listing failed", res.status);
    throw new Error(`Google Drive library unavailable (${res.status})`);
  }
  return (await res.json()) as DriveListResponse;
}

async function driveFileMetadata(fileId: string, token: string): Promise<{ id: string; name?: string; mimeType?: string }> {
  const res = await fetch(
    `${DRIVE_API_URL}/${encodeURIComponent(fileId)}?fields=id,name,mimeType`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (res.status === 401) {
    cachedToken = null;
    tokenExpiresAt = 0;
    throw new Error("Google Drive authentication expired");
  }
  if (!res.ok) throw new Error(`Google Drive media folder unavailable (${res.status})`);
  return (await res.json()) as { id: string; name?: string; mimeType?: string };
}

async function findMediaFolderId(token: string): Promise<string> {
  const configured = process.env.SMART_UPLOAD_DRIVE_MEDIA_ID?.trim();
  if (configured) return configured;

  try {
    const root = await driveFileMetadata(DEFAULT_MEDIA_FOLDER_ID, token);
    if (root.mimeType === DRIVE_FOLDER_MIME) return root.id;
  } catch {
    // Fall through to folder-name discovery for deployments using a different Drive root.
  }

  const search = new URLSearchParams({
    q: `name = 'MEDIA' and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`,
    spaces: "drive",
    pageSize: "50",
    fields: "files(id,name,mimeType,parents)",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });
  const data = await driveList(search, token);
  const folder = data.files?.find((file) => file.id && file.mimeType === DRIVE_FOLDER_MIME);
  if (!folder?.id) throw new Error("Google Drive MEDIA folder not found");
  return folder.id;
}

export async function getDriveThumbnail(fileId: string): Promise<Response> {
  const token = await getAccessToken();
  const metadataUrl = `${DRIVE_API_URL}/${encodeURIComponent(fileId)}?fields=thumbnailLink`;
  const metadata = await fetch(metadataUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (metadata.status === 401) {
    cachedToken = null;
    tokenExpiresAt = 0;
    return getDriveThumbnail(fileId);
  }
  if (!metadata.ok) return metadata;
  const data = (await metadata.json()) as { thumbnailLink?: string };
  if (!data.thumbnailLink) return new Response(null, { status: 404 });
  return fetch(data.thumbnailLink, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

export async function listDriveLibrary(): Promise<DriveLibraryItem[]> {
  const items: DriveLibraryItem[] = [];
  const token = await getAccessToken();
  const rootId = await findMediaFolderId(token);
  const stack: Array<{ id: string; path: string }> = [{ id: rootId, path: "MEDIA" }];
  const visited = new Set<string>();

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);

    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${current.id}' in parents and trashed = false`,
        spaces: "drive",
        pageSize: "1000",
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,parents)",
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const data = await driveList(params, token);
      for (const file of data.files ?? []) {
        const name = file.name?.trim() ?? "";
        if (!name || !file.id) continue;
        const mimeType = file.mimeType ?? "";
        const childPath = `${current.path}/${name}`;
        if (mimeType === DRIVE_FOLDER_MIME) {
          stack.push({ id: file.id, path: childPath });
          continue;
        }
        if (mimeType === "application/vnd.google-apps.shortcut") continue;

        const dot = name.lastIndexOf(".");
        const extension = dot >= 0 ? name.slice(dot).toLowerCase() : "";
        if (name.toLowerCase().endsWith(".browser.mp4")) continue;
        if (!mimeType.startsWith("video/") && !VIDEO_EXTENSIONS.has(extension)) continue;

        items.push({
          id: file.id,
          name,
          type: mediaTypeFromPath(childPath),
          path: childPath,
          mimeType,
          size: Number(file.size ?? 0) || 0,
          modifiedTime: file.modifiedTime,
          thumbnailLink: file.thumbnailLink,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  return items.sort((a, b) => {
    const order = { movie: 0, series: 1, anime: 2 };
    return (order[a.type] - order[b.type]) || a.name.localeCompare(b.name);
  });
}
