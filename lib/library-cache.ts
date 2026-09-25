import { env } from "cloudflare:workers";

type KvLike = {
  get: {
    (key: string, type?: "text" | "json"): Promise<unknown>;
    (keys: string[], type?: "text" | "json"): Promise<Map<string, unknown>>;
  };
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

function kv(): KvLike | null {
  return (env as unknown as { LIBRARY_CACHE?: KvLike }).LIBRARY_CACHE ?? null;
}

const DRIVE_CACHE_KEY = "library:drive:v2";
const DRIVE_CACHE_TTL = 60 * 60;
const METADATA_TTL = 60 * 60 * 24 * 30;
const NEGATIVE_METADATA_TTL = 60 * 60 * 6;

export function metadataCacheKey(
  kind: string,
  titleKey: string,
  year?: string | number,
): string {
  const normalizedKind = kind.trim().toLowerCase() || "movie";
  const normalizedTitle = titleKey.trim().toLowerCase() || "unknown";
  const normalizedYear = year === undefined || year === null ? "" : String(year);
  return `metadata:v3:${encodeURIComponent(normalizedKind)}:${encodeURIComponent(normalizedTitle)}:${encodeURIComponent(normalizedYear)}`;
}

export function legacyMetadataCacheKey(id: string, modifiedTime?: string): string {
  const version = modifiedTime?.trim() || "unknown";
  return `metadata:v2:${encodeURIComponent(id)}:${encodeURIComponent(version)}`;
}

export async function getCachedDriveLibrary<T>(): Promise<T | null> {
  const store = kv();
  if (!store) return null;
  try {
    return (await store.get(DRIVE_CACHE_KEY, "json")) as T | null;
  } catch {
    return null;
  }
}

export async function setCachedDriveLibrary(value: unknown, expirationTtl = DRIVE_CACHE_TTL): Promise<void> {
  const store = kv();
  if (!store) return;
  try {
    await store.put(DRIVE_CACHE_KEY, JSON.stringify(value), { expirationTtl });
  } catch (error) {
    console.error("[library-cache] Drive cache write failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function getCachedMetadata<T>(keys: string[]): Promise<Map<string, T | null>> {
  const store = kv();
  const out = new Map<string, T | null>();
  if (!store || !keys.length) return out;

  try {
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      const values = await store.get(chunk, "json");
      for (const key of chunk) {
        out.set(key, (values.get(key) as T | null | undefined) ?? null);
      }
    }
  } catch (error) {
    console.error("[library-cache] Metadata bulk read failed", error instanceof Error ? error.message : "unknown");
  }

  return out;
}

export async function setCachedMetadata(
  key: string,
  value: unknown,
  expirationTtl = METADATA_TTL,
): Promise<void> {
  const store = kv();
  if (!store) return;

  try {
    await store.put(key, JSON.stringify(value), { expirationTtl });
  } catch (error) {
    console.error("[library-cache] Metadata write failed", error instanceof Error ? error.message : "unknown");
  }
}

export const NEGATIVE_METADATA_EXPIRATION_TTL = NEGATIVE_METADATA_TTL;
