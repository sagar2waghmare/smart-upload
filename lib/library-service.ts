import { listDriveLibrary, googleDriveConfigured } from "./google-drive";
import type { LibraryResponse, MediaItem } from "./types";

function normalizeItem(raw: {
  id: string;
  name: string;
  type: "movie" | "series" | "anime";
  modifiedTime?: string;
}): MediaItem | null {
  const id = raw.id.trim();
  if (!id || !raw.name.trim()) return null;

  const title = raw.name.replace(/\.[^.]+$/, "").trim();
  if (!title) return null;

  const poster = `/api/thumbnail/${encodeURIComponent(id)}`;

  return {
    id,
    kind: raw.type,
    title,
    poster,
    backdrop: poster,
    tag: raw.modifiedTime ? "Recently Added" : undefined,
    source: "google-drive",
  };
}

export async function getLibrary(): Promise<LibraryResponse> {
  if (!googleDriveConfigured()) {
    console.error("[library] Google Drive is not configured");
    return { mode: "google-drive", items: [], count: 0 };
  }

  try {
    const rawItems = await listDriveLibrary();
    const items = rawItems
      .map(normalizeItem)
      .filter((item): item is MediaItem => item !== null);
    return { mode: "google-drive", items, count: items.length };
  } catch (err) {
    console.error("[library] Google Drive fetch failed", err);
    return { mode: "google-drive", items: [], count: 0 };
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
