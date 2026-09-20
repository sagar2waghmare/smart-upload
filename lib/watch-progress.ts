"use client";
import { useEffect, useState } from "react";

export interface WatchProgress {
  id: string;
  position: number;
  duration: number;
  episodeId?: string;
  updatedAt: number;
}

const KEY = "smart-upload:watch-progress";
export const PROGRESS_EVENT = "watch-progress";
let cachedMap: Record<string, WatchProgress> | null = null;

function loadMap(): Record<string, WatchProgress> {
  if (typeof window === "undefined") return {};
  if (cachedMap) return cachedMap;
  try {
    const raw = window.localStorage.getItem(KEY);
    cachedMap = raw ? (JSON.parse(raw) as Record<string, WatchProgress>) : {};
  } catch {
    cachedMap = {};
  }
  return cachedMap;
}

function writeMap(map: Record<string, WatchProgress>) {
  if (typeof window === "undefined") return;
  cachedMap = map;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
  try {
    window.dispatchEvent(new Event(PROGRESS_EVENT));
  } catch {
    /* noop */
  }
}

export function getProgress(id: string): WatchProgress | null {
  if (typeof window === "undefined") return null;
  return loadMap()[id] ?? null;
}

export function saveProgress(p: Omit<WatchProgress, "updatedAt">) {
  const map = loadMap();
  const prev = map[p.id];
  const next: WatchProgress = { id: p.id, position: p.position, duration: p.duration, updatedAt: Date.now() };
  if (p.episodeId) next.episodeId = p.episodeId;
  else if (prev?.episodeId) next.episodeId = prev.episodeId;
  map[p.id] = next;
  writeMap(map);
}

export function clearProgress(id: string) {
  const map = loadMap();
  if (!(id in map)) return;
  delete map[id];
  writeMap(map);
}

export function progressPercent(p: WatchProgress | null): number {
  if (!p || !Number.isFinite(p.duration) || p.duration <= 0) return 0;
  return Math.max(0, Math.min(100, (p.position / p.duration) * 100));
}

export type WatchMode = "play" | "resume" | "replay";

export function watchMode(p: WatchProgress | null): WatchMode {
  const pct = progressPercent(p);
  if (pct < 5) return "play";
  if (pct < 95) return "resume";
  return "replay";
}

export function formatPosition(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export function useWatchProgress(): Record<string, WatchProgress> {
  const [map, setMap] = useState<Record<string, WatchProgress>>(() => loadMap());

  useEffect(() => {
    const sync = () => setMap(loadMap());
    window.addEventListener(PROGRESS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROGRESS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return map;
}