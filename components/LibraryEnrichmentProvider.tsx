"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { LibraryEnrichmentPatch, LibraryEnrichmentTarget, MediaItem } from "../lib/types";

type EnrichmentContextValue = {
  getPatch: (id: string) => LibraryEnrichmentPatch | undefined;
};

const EnrichmentContext = createContext<EnrichmentContextValue | null>(null);

export function useLibraryEnrichment(): EnrichmentContextValue {
  const value = useContext(EnrichmentContext);
  if (!value) throw new Error("useLibraryEnrichment must be used within LibraryEnrichmentProvider");
  return value;
}

function mergePatch(item: MediaItem, patch?: LibraryEnrichmentPatch): MediaItem {
  if (!patch || patch.id !== item.id) return item;
  return {
    ...item,
    title: patch.title || item.title,
    year: patch.year ?? item.year,
    kind: patch.kind ?? item.kind,
    tmdbId: patch.tmdbId ?? item.tmdbId,
    poster: patch.poster || item.poster,
    backdrop: patch.backdrop || item.backdrop,
    overview: patch.overview ?? item.overview,
    runtime: patch.runtime ?? item.runtime,
    rating: patch.rating ?? item.rating,
    genres: patch.genres ?? item.genres,
  };
}

export function LibraryEnrichmentProvider({
  targets = [],
  children,
}: {
  targets?: LibraryEnrichmentTarget[];
  children: React.ReactNode;
}) {
  const [patches, setPatches] = useState<Record<string, LibraryEnrichmentPatch>>({});

  useEffect(() => {
    if (!targets.length) return;
    let cancelled = false;

    const run = async () => {
      for (let i = 0; i < targets.length; i += 8) {
        if (cancelled) return;
        const batch = targets.slice(i, i + 8);
        try {
          const res = await fetch("/api/library/enrich", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ targets: batch }),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as { patches?: LibraryEnrichmentPatch[] };
          if (!cancelled && Array.isArray(data.patches)) {
            setPatches((prev) => {
              const next = { ...prev };
              for (const patch of data.patches ?? []) next[patch.id] = patch;
              return next;
            });
          }
        } catch {
          // A failed batch must not block later batches or the library UI.
        }
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [targets]);

  const value = useMemo(() => ({
    getPatch: (id: string) => patches[id],
  }), [patches]);

  return <EnrichmentContext.Provider value={value}>{children}</EnrichmentContext.Provider>;
}

export { mergePatch };
