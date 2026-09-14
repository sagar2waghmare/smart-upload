import { listDriveLibrary, googleDriveConfigured } from "./google-drive";
import type { LibraryResponse, MediaItem } from "./types";

// Kept as a compatibility helper for existing health/settings consumers.
// The catalog source is now Google Drive; no AWS request is made.
export function awsConfigured(): boolean {
  return googleDriveConfigured();
}

function normalizeItem(raw: {
  id: string;
  name: string;
  type: "movie" | "series" | "anime";
  thumbnailLink?: string;
  modifiedTime?: string;
}): MediaItem | null {
  const id = raw.id.trim();
  if (!id || !raw.name.trim()) return null;

  const title = raw.name.replace(/\.[^.]+$/, "").trim();
  if (!title) return null;

  return {
    id,
    kind: raw.type,
    title,
    poster: raw.thumbnailLink,
    backdrop: raw.thumbnailLink,
    tag: raw.modifiedTime ? "Recently Added" : undefined,
    source: "google-drive",
  };
}

export async function getLibrary(): Promise<LibraryResponse> {
  if (!googleDriveConfigured()) {
    console.error("[library] Google Drive is not configured");
    return { mode: "aws", items: [], count: 0 };
  }

  try {
    const rawItems = await listDriveLibrary();
    const items = rawItems
      .map(normalizeItem)
      .filter((item): item is MediaItem => item !== null);
    return { mode: "aws", items, count: items.length };
  } catch (err) {
    console.error("[library] Google Drive fetch failed", err);
    return { mode: "aws", items: [], count: 0 };
  }
}

export async function getPublished(): Promise<MediaItem[]> {
  const lib = await getLibrary();
  return lib.items;
}

export async function getMediaById(id: string): Promise<MediaItem | undefined> {
  const items = await getPublished();
  return items.find((m) => m.id === id);
}
