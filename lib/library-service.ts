import { listDriveLibrary, googleDriveConfigured } from "./google-drive";
import { identifyFilename } from "./identify";
import { tmdbConfigured } from "./metadata/tmdb";
import type { LibraryResponse, MediaItem } from "./types";

async function normalizeItem(raw: {
  id: string;
  name: string;
  type: "movie" | "series" | "anime";
  modifiedTime?: string;
  thumbnailLink?: string;
}): Promise<MediaItem | null> {
  const id = raw.id.trim();
  const filename = raw.name.trim();
  if (!id || !filename) return null;

  const fallbackTitle = filename.replace(/\.[^.]+$/, "").trim();
  if (!fallbackTitle) return null;

  const fallbackPoster = `/api/thumbnail/${encodeURIComponent(id)}`;
  const base: MediaItem = {
    id,
    kind: raw.type,
    title: fallbackTitle,
    poster: raw.thumbnailLink?.trim() || fallbackPoster,
    backdrop: raw.thumbnailLink?.trim() || fallbackPoster,
    tag: raw.modifiedTime ? "Recently Added" : undefined,
    source: "google-drive",
  };

  if (!tmdbConfigured()) return base;

  try {
    const identified = await identifyFilename(filename);
    if (identified.tmdb?.matched && identified.tmdb.poster) {
      return {
        ...base,
        title: identified.title || fallbackTitle,
        year: identified.year,
        kind: identified.kind,
        poster: identified.tmdb.poster,
        backdrop: identified.tmdb.backdrop ?? identified.tmdb.poster,
      };
    }

    return {
      ...base,
      title: identified.title || fallbackTitle,
      year: identified.year,
      kind: identified.kind,
    };
  } catch {
    return base;
  }
}

export async function getLibrary(): Promise<LibraryResponse> {
  if (!googleDriveConfigured()) {
    console.error("[library] Google Drive is not configured");
    return { mode: "google-drive", items: [], count: 0, error: "Google Drive is not configured" };
  }
  try {
    const rawItems = await listDriveLibrary();
    const normalized = await Promise.all(rawItems.map(normalizeItem));
    const items = normalized.filter((item): item is MediaItem => item !== null);
    console.log(`[library] Google Drive returned ${items.length} media items`);
    return { mode: "google-drive", items, count: items.length };
  } catch (err) {
    console.error("[library] Google Drive fetch failed", err);
    return { mode: "google-drive", items: [], count: 0, error: err instanceof Error ? err.message : "Google Drive library unavailable" };
  }
}

export async function getPublished(): Promise<MediaItem[]> {
  return (await getLibrary()).items;
}

export async function getMediaById(id: string): Promise<MediaItem | undefined> {
  return (await getPublished()).find((m) => m.id === id);
}
