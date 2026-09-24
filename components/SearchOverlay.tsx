"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem, MediaKind } from "../lib/types";
import { loadLibrary } from "../lib/client-library";
import { IClose, ISearch, IImage } from "./icons";
import { MediaCard } from "./MediaCard";

type KindFilter = "all" | MediaKind;
type SortMode = "relevance" | "title" | "year" | "rating" | "recent";

const KIND_LABELS: Record<KindFilter, string> = {
  all: "All",
  movie: "Movies",
  series: "TV Shows",
  anime: "Anime",
};

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
  const [genre, setGenre] = useState("all");
  const [sort, setSort] = useState<SortMode>("relevance");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 90);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    loadLibrary()
      .then(setItems)
      .catch(() => setItems([]));
  }, [open]);

  const genreOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      for (const value of item.genres ?? []) {
        const normalized = value.trim();
        if (normalized) values.add(normalized);
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = items
      .filter((item) => kind === "all" || item.kind === kind)
      .filter(
        (item) =>
          genre === "all" ||
          (item.genres ?? []).some((value) => value.toLowerCase() === genre.toLowerCase()),
      )
      .map((item) => {
        if (!q) return { item, score: 0 };

        const title = item.title.toLowerCase();
        const overview = item.overview?.toLowerCase() ?? "";
        const genres = (item.genres ?? []).join(" ").toLowerCase();
        const year = String(item.year ?? "").toLowerCase();
        const kindText = KIND_LABELS[item.kind].toLowerCase();
        const episodeText = (item.seasons ?? [])
          .flatMap((season) => season.episodes)
          .map((episode) => episode.title)
          .join(" ")
          .toLowerCase();

        let score = 0;
        if (title === q) score += 100;
        else if (title.startsWith(q)) score += 70;
        else if (title.includes(q)) score += 50;
        if (year.includes(q)) score += 32;
        if (genres.includes(q)) score += 24;
        if (kindText.includes(q)) score += 12;
        if (overview.includes(q)) score += 8;
        if (episodeText.includes(q)) score += 6;

        return { item, score };
      })
      .filter(({ score }) => !q || score > 0);

    return [...filtered]
      .sort((a, b) => {
        if (sort === "title") return a.item.title.localeCompare(b.item.title);
        if (sort === "year") return Number(b.item.year ?? 0) - Number(a.item.year ?? 0);
        if (sort === "rating") return Number(b.item.rating ?? 0) - Number(a.item.rating ?? 0);
        if (sort === "recent") {
          return (
            Number(String(b.item.tag ?? "").includes("Recently")) -
            Number(String(a.item.tag ?? "").includes("Recently"))
          );
        }
        return b.score - a.score || a.item.title.localeCompare(b.item.title);
      })
      .map(({ item }) => item)
      .slice(0, 40);
  }, [genre, items, kind, query, sort]);

  const clearAll = useCallback(() => {
    setQuery("");
    setKind("all");
    setGenre("all");
    setSort("relevance");
    setActiveIndex(-1);
  }, []);

  const openActiveResult = useCallback(() => {
    if (activeIndex < 0 || !results[activeIndex]) return;
    const cards = document.querySelectorAll<HTMLElement>(".search-result-card");
    cards[activeIndex]?.querySelector<HTMLButtonElement>(".poster")?.click();
  }, [activeIndex, results]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(-1);
  }, [query, kind, genre, sort, open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (query || kind !== "all" || genre !== "all" || sort !== "relevance") {
          clearAll();
        } else {
          onClose();
        }
        return;
      }

      if (!results.length) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          return current < 0
            ? delta > 0
              ? 0
              : results.length - 1
            : (current + delta + results.length) % results.length;
        });
        return;
      }

      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        openActiveResult();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeIndex,
    clearAll,
    genre,
    kind,
    onClose,
    open,
    openActiveResult,
    query,
    results,
    sort,
  ]);

  const hasFilters = kind !== "all" || genre !== "all" || sort !== "relevance";
  const empty = query.trim() !== "" && results.length === 0;

  return (
    <div
      className={`search-overlay ${open ? "open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Search media"
    >
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
            onChange={(e) => setQuery(e.target.value)}
          />
          {query || hasFilters ? (
            <button
              type="button"
              className="btn-icon"
              aria-label="Clear search and filters"
              onClick={clearAll}
            >
              <IClose />
            </button>
          ) : null}
          <button
            type="button"
            className="btn-icon"
            aria-label="Close search"
            onClick={onClose}
          >
            <IClose />
          </button>
        </div>

        <div className="search-underline">
          <span style={{ width: query ? "100%" : hasFilters ? "55%" : "0%" }} />
        </div>

        <div className="search-toolbar" aria-label="Search filters">
          <div className="search-filter-group">
            {(Object.keys(KIND_LABELS) as KindFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`search-filter-chip ${kind === value ? "active" : ""}`}
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
              >
                {KIND_LABELS[value]}
              </button>
            ))}
          </div>

          <div className="search-sort-row">
            <label className="search-select-label">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                aria-label="Sort search results"
              >
                <option value="relevance">Relevance</option>
                <option value="recent">Recently added</option>
                <option value="title">Title A–Z</option>
                <option value="year">Newest year</option>
                <option value="rating">Highest rating</option>
              </select>
            </label>

            {genreOptions.length > 0 ? (
              <label className="search-select-label">
                <span>Genre</span>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  aria-label="Filter by genre"
                >
                  <option value="all">All genres</option>
                  {genreOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <p className="search-hint">
          <span className="kbd">Esc</span> to close
          <span className="search-result-count" aria-live="polite">
            {items.length
              ? `${results.length} result${results.length === 1 ? "" : "s"}`
              : "Loading library…"}
          </span>
          {activeIndex >= 0 && results[activeIndex] ? (
            <span className="search-keyboard-hint">
              <span className="kbd">↑↓</span> navigate ·{" "}
              <span className="kbd">Enter</span> open
            </span>
          ) : null}
        </p>

        {empty ? (
          <div className="search-state">
            <IImage />
            <h3>No matches</h3>
            <p>Try a different title, genre, year, or media type.</p>
            <button type="button" className="btn btn-ghost" onClick={clearAll}>
              Clear filters
            </button>
          </div>
        ) : results.length === 0 ? (
          <div className="search-state">
            <ISearch />
            <h3>{items.length ? "No titles match these filters" : "Loading your library"}</h3>
            <p>
              {items.length
                ? "Change the media type, genre, or sort options."
                : "Your library will appear here when it is ready."}
            </p>
          </div>
        ) : (
          <div className="search-results">
            {results.map((item, index) => (
              <div
                key={item.id}
                className={`search-result-card ${activeIndex === index ? "keyboard-active" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <MediaCard item={item} priority={index < 4} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
