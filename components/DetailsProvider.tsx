"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Episode, MediaItem } from "../lib/types";
import { DetailsOverlay } from "./DetailsOverlay";
import { PlaybackOverlay } from "./PlaybackOverlay";

type DetailsContextValue = {
  item: MediaItem | null;
  playerOpen: boolean;
  episode: Episode | null;
  openDetails: (item: MediaItem) => void;
  closeDetails: () => void;
  openPlayer: (episode?: Episode) => void;
  closePlayer: () => void;
};

const DetailsContext = createContext<DetailsContextValue | null>(null);

export function useDetails(): DetailsContextValue {
  const ctx = useContext(DetailsContext);
  if (!ctx) throw new Error("useDetails must be used within DetailsProvider");
  return ctx;
}

export function DetailsProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<MediaItem | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);

  const pushOverlayState = useCallback((kind: "details" | "player", id: string, episodeId?: string) => {
    const state = { ...(window.history.state ?? {}), smartUploadOverlay: kind, smartUploadId: id, smartUploadEpisodeId: episodeId ?? null };
    window.history.pushState(state, "", window.location.href);
  }, []);

  const openDetails = useCallback((it: MediaItem) => {
    setItem(it);
    setEpisode(null);
    setPlayerOpen(false);
    pushOverlayState("details", it.id);
  }, [pushOverlayState]);

  const closeDetails = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.smartUploadOverlay === "details") {
      window.history.back();
      return;
    }
    setItem(null);
    setEpisode(null);
    setPlayerOpen(false);
  }, []);

  const openPlayer = useCallback((ep?: Episode) => {
    setEpisode(ep ?? null);
    setPlayerOpen(true);
    if (item) pushOverlayState("player", item.id, ep?.id);
  }, [item, pushOverlayState]);

  const closePlayer = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.smartUploadOverlay === "player") {
      window.history.back();
      return;
    }
    setPlayerOpen(false);
  }, []);

  // Lock page scroll while any overlay is present.
  useEffect(() => {
    if (!item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [item]);

  // Escape closes the player first, then the details overlay.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (playerOpen) setPlayerOpen(false);
      else closeDetails();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, playerOpen, closeDetails]);

  const value = useMemo(
    () => ({ item, playerOpen, episode, openDetails, closeDetails, openPlayer, closePlayer }),
    [item, playerOpen, episode, openDetails, closeDetails, openPlayer, closePlayer],
  );

  return (
    <DetailsContext.Provider value={value}>
      {children}
      <DetailsOverlay key={item ? `details-${item.id}` : "details-closed"} />
      <PlaybackOverlay key={item && playerOpen ? `player-${item.id}` : "player-closed"} />
    </DetailsContext.Provider>
  );
}