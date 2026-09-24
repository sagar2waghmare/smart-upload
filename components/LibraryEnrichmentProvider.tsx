"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LibraryEnrichmentPatch, MediaItem } from "../lib/types";

type EnrichmentContextValue = {
  getPatch: (id: string) => LibraryEnrichmentPatch | undefined;
  request: (ids: string | string[]) => void;
  observe: (id: string, node: HTMLElement | null) => void;
};

const EnrichmentContext = createContext<EnrichmentContextValue | null>(null);

export function useLibraryEnrichment(): EnrichmentContextValue {
  const value = useContext(EnrichmentContext);
  if (!value) {
    throw new Error("useLibraryEnrichment must be used within LibraryEnrichmentProvider");
  }
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
  children,
}: {
  children: React.ReactNode;
}) {
  const [patches, setPatches] = useState<Record<string, LibraryEnrichmentPatch>>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const requestedRef = useRef(new Set<string>());
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cancelledRef = useRef(false);

  const request = useCallback((value: string | string[]) => {
    const ids = Array.isArray(value) ? value : [value];
    const next: string[] = [];

    for (const raw of ids) {
      const id = raw.trim();
      if (!id || requestedRef.current.has(id)) continue;
      requestedRef.current.add(id);
      next.push(id);
    }

    if (next.length) {
      setQueue((previous) => [...previous, ...next]);
    }
  }, []);

  const observe = useCallback((id: string, node: HTMLElement | null) => {
    const safeId = id.trim();
    if (!safeId) return;

    const previous = nodesRef.current.get(safeId);
    if (previous && previous !== node) {
      observerRef.current?.unobserve(previous);
    }

    if (!node) {
      if (previous) observerRef.current?.unobserve(previous);
      nodesRef.current.delete(safeId);
      return;
    }

    node.dataset.enrichmentId = safeId;
    nodesRef.current.set(safeId, node);
    observerRef.current?.observe(node);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    if (typeof IntersectionObserver === "undefined") {
      const ids = [...nodesRef.current.keys()].slice(0, 18);
      request(ids);
      return () => {
        cancelledRef.current = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const node = entry.target as HTMLElement;
          const id = node.dataset.enrichmentId;
          if (!id) continue;
          request(id);
          observer.unobserve(node);
        }
      },
      { rootMargin: "700px 0px", threshold: 0.01 },
    );

    observerRef.current = observer;
    for (const [id, node] of nodesRef.current) {
      node.dataset.enrichmentId = id;
      observer.observe(node);
    }

    return () => {
      cancelledRef.current = true;
      observer.disconnect();
      observerRef.current = null;
    };
  }, [request]);

  useEffect(() => {
    if (active >= 2 || queue.length === 0 || cancelledRef.current) return;

    const ids = queue.slice(0, 6);
    setQueue((previous) => previous.slice(ids.length));
    setActive((count) => count + 1);

    void (async () => {
      try {
        const res = await fetch("/api/library/enrich", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ids }),
        });

        if (!res.ok) return;

        const data = (await res.json()) as { patches?: LibraryEnrichmentPatch[] };
        if (cancelledRef.current || !Array.isArray(data.patches)) return;

        setPatches((previous) => {
          const next = { ...previous };
          for (const patch of data.patches ?? []) {
            next[patch.id] = patch;
          }
          return next;
        });
      } catch {
        // A failed batch must not block other visible cards.
      } finally {
        if (!cancelledRef.current) setActive((count) => Math.max(0, count - 1));
      }
    })();
  }, [active, queue]);

  const value = useMemo(
    () => ({
      getPatch: (id: string) => patches[id],
      request,
      observe,
    }),
    [observe, request, patches],
  );

  return (
    <EnrichmentContext.Provider value={value}>
      {children}
    </EnrichmentContext.Provider>
  );
}

export { mergePatch };
