import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLibrary } from "../../../lib/library-service";
import { authIntended, requireSession } from "../../../lib/auth";
import { MediaCard } from "../../../components/MediaCard";
import { LibraryEnrichmentProvider } from "../../../components/LibraryEnrichmentProvider";
import { IArrowLeft, IFilm, IPlay, ISparkles, ITv } from "../../../components/icons";

type Kind = "movie" | "series" | "anime";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  const titles: Record<string, string> = { movie: "Movies", series: "TV Shows", anime: "Anime" };
  return { title: titles[kind] ?? "Library" };
}

const labels: Record<Kind, { title: string; icon: React.ReactNode; help: string }> = {
  movie: { title: "Movies", icon: <IFilm />, help: "Feature films in your library" },
  series: { title: "TV Shows", icon: <ITv />, help: "Series and seasons in your library" },
  anime: { title: "Anime", icon: <ISparkles />, help: "Anime titles in your library" },
};

export default async function BrowsePage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const meta = labels[kind as Kind] ?? labels.movie;
  if (authIntended() && !(await requireSession())) redirect("/?signin=1");
  const { items, mode } = await getLibrary();
  const list = items.filter((m) => m.kind === kind);
  const sourceLabel = mode === "google-drive" ? "synced from Google Drive" : "in demo library";

  return (
    <LibraryEnrichmentProvider>
      <main className="page">
        <Link href="/" className="back-link">
          <IArrowLeft /> Home
        </Link>
        <div className="page-head">
          <div>
            <h1>{meta.icon} {meta.title}</h1>
            <p className="sub">{meta.help} · {list.length} {sourceLabel}</p>
          </div>
        </div>
        {list.length === 0 ? (
          <div className="state-box" style={{ marginTop: "1.5rem" }}>
            <IPlay style={{ width: "2.8rem", height: "2.8rem", opacity: 0.55 }} />
            <h3>Nothing here yet</h3>
            <p>No {meta.title.toLowerCase()} found{mode === "google-drive" ? " in the connected Google Drive library" : " in the demo library"}.</p>
            <Link href="/upload" className="btn btn-primary">Upload URL</Link>
          </div>
        ) : (
          <div className="card-grid" style={{ paddingTop: "1.5rem" }}>
            {list.map((m, index) => <MediaCard key={m.id} item={m} priority={index < 6} />)}
          </div>
        )}
      </main>
    </LibraryEnrichmentProvider>
  );
}
