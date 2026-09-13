"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { loadLibrary } from "../lib/client-library";
import { IClose, ISearch, IImage, IExternal } from "./icons";
import { MediaCard } from "./MediaCard";

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      document.body.style.overflow = "hidden";
      const t = window.setTimeout(() => inputRef.current?.focus(), 90);
      return () => {
        window.clearTimeout(t);
        document.body.style.overflow = "";
        triggerRef.current?.focus();
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    loadLibrary()
      .then(setItems)
      .catch(() => setItems([]));
  }, [open]);

  const results = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 18);
    return items
      .filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.genres?.some((g) => g.toLowerCase().startsWith(q)) ?? false)
      )
      .slice(0, 40);
  }, [query, items]);

  const r = results();
  const empty = query.trim() !== "" && r.length === 0;

  return (
    <div className={`search-overlay ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Search media">
      <div className="search-inner">
        <div className="search-bar">
          <span className="search-icon">
            <ISearch />
          </span>
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            placeholder="Search your library…"
            aria-label="Search your library"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearched(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (query) setQuery("");
                else onClose();
              }
            }}
          />
          {query && (
            <button className="btn-icon" aria-label="Clear search" onClick={() => { setQuery(""); setSearched(false); }}>
              <IClose />
            </button>
          )}
          <button className="btn-icon" aria-label="Close search" onClick={onClose}>
            <IClose />
          </button>
        </div>
        <div className="search-underline">
          <span style={{ width: query ? "100%" : 0 }} />
        </div>
        <p className="search-hint">
          <span className="kbd">Esc</span> to close
          {empty && <span>— no matches, try another title</span>}
        </p>

        {items.length === 0 && searched ? (
          <div className="search-state">
            <IImage />
            <h3>No results</h3>
            <p>Nothing in your library matches “{query.trim()}”.</p>
            <button className="btn btn-ghost" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        ) : r.length === 0 ? (
          <div className="search-state">
            <ISearch />
            <h3>Search your library</h3>
            <p>You can also connect this page to the AWS library API via environment variables.</p>
            <a href="/settings" className="pill pill-primary" onClick={onClose}>
              <IExternal /> View integration status
            </a>
          </div>
        ) : (
          <div className="search-results">
            {r.map((m) => (
              <div key={m.id} onClick={onClose}>
                <MediaCard item={m} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}