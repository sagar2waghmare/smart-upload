"use client";

const KEY = "smart-upload:favorites";

export function loadFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveFavs(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
}

export function isFavorite(id: string): boolean {
  return loadFavs().includes(id);
}

export function toggleFavorite(id: string): boolean {
  const favs = loadFavs();
  const on = favs.includes(id);
  saveFavs(on ? favs.filter((f) => f !== id) : [...favs, id]);
  return !on;
}

export function favIds(): string[] {
  return loadFavs();
}