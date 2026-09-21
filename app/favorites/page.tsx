"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MediaItem } from "../../lib/types";
import { loadLibrary } from "../../lib/client-library";
import { favIds } from "../../lib/favorites";
import { MediaCard } from "../../components/MediaCard";
import { IArrowLeft, IHeart } from "../../components/icons";

export default function FavoritesPage() {
  // Load browser-only favorites after hydration so SSR and the first client
  // render remain identical.
  const [ids, setIds] = useState<string[]>([]);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLibrary()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const sync = () => setIds(favIds());

    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const favItems = items?.filter((m) => ids.includes(m.id)) ?? [];
  const loading = items === null && !error;

  return (
    <main className="page">
      <Link href="/" className="back-link"><IArrowLeft /> Home</Link>
      <div className="page-head">
        <div>
          <h1>Favorites</h1>
          <p className="sub">Titles you saved with the heart button — stored locally in this browser.</p>
        </div>
      </div>

      {error && (
        <div className="state-box" style={{ marginTop: "1.5rem" }}>
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="card-grid" style={{ paddingTop: "1.5rem" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="skel-poster" />
              <div className="skeleton skel-line" />
              <div className="skeleton skel-line short" />
            </div>
          ))}
        </div>
      ) : !error && (
        fitState(favItems, loading)
      )}
    </main>
  );

  function fitState(list: MediaItem[], isLoading: boolean) {
    if (isLoading) return null;
    if (list.length === 0)
      return (
        <div className="state-box" style={{ marginTop: "1.5rem" }}>
          <IHeart />
          <h3>No favorites yet</h3>
          <p>Tap the heart on any poster to keep it here. Favorites sync inside your browser for now.</p>
          <Link href="/" className="btn btn-primary">Browse the library</Link>
        </div>
      );
    return (
      <div className="card-grid" style={{ paddingTop: "1.5rem" }}>
        {list.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
      </div>
    );
  }
}