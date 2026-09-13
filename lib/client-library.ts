"use client";
import type { LibraryResponse, MediaItem } from "./types";

let cache: MediaItem[] | null = null;
let inflight: Promise<MediaItem[]> | null = null;

export function loadLibrary(): Promise<MediaItem[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight)
    inflight = fetch("/api/library", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("library fetch failed");
        return r.json() as Promise<LibraryResponse>;
      })
      .then((d) => {
        cache = d.items;
        return d.items;
      })
      .finally(() => {
        inflight = null;
      });
  return inflight;
}