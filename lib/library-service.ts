import { mockLibrary } from "./mock-data";
import type { LibraryResponse, MediaItem } from "./types";

const AWS_URL = process.env.AWS_LIBRARY_API_URL;
const AWS_KEY = process.env.AWS_LIBRARY_API_KEY;
const AWS_KEY_HEADER = process.env.AWS_LIBRARY_API_KEY_HEADER ?? "x-api-key";

export function awsConfigured(): boolean {
  return Boolean(AWS_URL);
}

function normalizeItem(raw: Record<string, unknown>): MediaItem | null {
  if (!raw || typeof raw !== "object") return null;
  const id = (raw.id ?? raw._id ?? "") as string;
  const title = (raw.title ?? "") as string;
  if (!id || !title) return null;
  const kind = ["movie", "series", "anime"].includes(String(raw.kind)) ? (raw.kind as MediaItem["kind"]) : "movie";
  const seasons = Array.isArray(raw.seasons) ? (raw.seasons as MediaItem["seasons"]) : undefined;
  return {
    id,
    kind,
    title,
    year: (raw.year as MediaItem["year"]) ?? undefined,
    overview: (raw.overview as string) ?? undefined,
    runtime: typeof raw.runtime === "number" ? (raw.runtime as number) : undefined,
    rating: typeof raw.rating === "number" ? (raw.rating as number) : undefined,
    genres: Array.isArray(raw.genres) ? (raw.genres as string[]) : undefined,
    poster: (raw.poster as string) ?? undefined,
    backdrop: (raw.backdrop ?? raw.poster) as string | undefined,
    tag: (raw.tag as string) ?? undefined,
    progress: typeof raw.progress === "number" ? (raw.progress as number) : undefined,
    mediaUrl: (raw.mediaUrl ?? raw.playbackUrl ?? raw.streamUrl) as string | undefined,
    seasons,
    hasSubtitles: Boolean(raw.hasSubtitles),
    source: "aws",
  };
}

export async function getLibrary(): Promise<LibraryResponse> {
  if (AWS_URL) {
    try {
      const res = await fetch(AWS_URL, {
        headers: AWS_KEY ? { [AWS_KEY_HEADER]: AWS_KEY } : undefined,
        next: { revalidate: 60 },
      });
      if (!res.ok) throw new Error(`AWS library API responded ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      const rawItems = Array.isArray(data) ? data : Array.isArray(data.items) ? (data.items as unknown[]) : [];
      const items = rawItems
        .map((r) => normalizeItem(r as Record<string, unknown>))
        .filter((i): i is MediaItem => i !== null);
      return { mode: "aws", items, count: items.length };
    } catch (err) {
      console.error("[library] AWS fetch failed, falling back to demo", err);
      return { mode: "demo", items: mockLibrary, count: mockLibrary.length };
    }
  }
  return { mode: "demo", items: mockLibrary, count: mockLibrary.length };
}

export async function getPublished(): Promise<MediaItem[]> {
  const lib = await getLibrary();
  return lib.items;
}

export async function getMediaById(id: string): Promise<MediaItem | undefined> {
  const items = await getPublished();
  return items.find((m) => m.id === id);
}