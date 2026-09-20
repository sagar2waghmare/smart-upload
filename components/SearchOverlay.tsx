"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { loadLibrary } from "../lib/client-library";
import { IClose, ISearch, IImage, IPlay, IChevronRight } from "./icons";
import { useDetails } from "./DetailsProvider";
import { MediaCard } from "./MediaCard";

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" width="18" height="18" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
    </svg>
  );
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { openDetails } = useDetails();

  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    loadLibrary().then(setItems).catch(() => setItems([])).finally(() => setLoaded(true));
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = old;
    };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((m) =>
      m.title.toLowerCase().includes(q) ||
      (m.genres ?? []).some((g) => g.toLowerCase().includes(q))
    );
  }, [items, query]);

  const topSearches = useMemo(() => items.slice(0, 10), [items]);
  const clear = useCallback(() => setQuery(""), []);

  if (!open) return null;

  return (
    <div className="search-overlay open" role="dialog" aria-modal="true" aria-label="Search">
      <div className="search-inner">
        <div className="search-bar">
          <span className="search-icon"><ISearch /></span>
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            placeholder="Search games, shows, movies"
            aria-label="Search games, shows, movies"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (query) clear();
                else onClose();
              }
            }}
          />
          {query && (
            <button className="btn-icon" aria-label="Clear" onClick={clear}>
              <IClose />
            </button>
          )}
          <button className="btn-icon" aria-label="Voice search">
            <MicIcon />
          </button>
          <button className="btn-icon" aria-label="Close search" onClick={onClose}>
            <IClose />
          </button>
        </div>

        {query.trim() === "" ? (
          <div>
            <h2 className="search-section-title">Top Searches</h2>
            {loaded && topSearches.length === 0 ? (
              <div className="search-state">
                <IImage />
                <p>Your library is empty.</p>
              </div>
            ) : (
              topSearches.map((item, i) => (
                <div key={item.id}>
                  <button
                    type="button"
                    className="source-netflix-top-search-row"
                    onClick={() => openDetails(item)}
                  >
                    <span className="source-netflix-top-search-thumb">
                      <img src={item.backdrop ?? item.poster} alt="" />
                    </span>
                    <span className="source-netflix-top-search-title">{item.title}</span>
                    <span className="source-netflix-top-search-play"><IPlay /></span>
                  </button>
                  {i < topSearches.length - 1 && <div className="source-netflix-top-search-separator" />}
                </div>
              ))
            )}
          </div>
        ) : results.length > 0 ? (
          <div>
            <h2 className="search-section-title">Movies &amp; TV</h2>
            <div className="search-results">
              {results.map((item) => <MediaCard key={item.id} item={item} />)}
            </div>
          </div>
        ) : (
          <div className="search-state">
            <ISearch />
            <p>No matches</p>
            <span>Try a different search term.</span>
          </div>
        )}
      </div>
    </div>
  );
}
