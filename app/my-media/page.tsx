import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLibrary } from "../../lib/library-service";
import { authIntended, requireSession } from "../../lib/auth";
import { libraries } from "../../lib/mock-data";
import { MediaCard } from "../../components/MediaCard";
import { LibraryEnrichmentProvider } from "../../components/LibraryEnrichmentProvider";
import { IArrowLeft, ILibrary, IPlay } from "../../components/icons";

export const metadata: Metadata = { title: "My Media" };

export default async function MyMediaPage() {
  if (authIntended() && !(await requireSession())) redirect("/?signin=1");
  const { items, mode, enrichmentTargets } = await getLibrary();
  const continueItems = items.filter((m) => m.progress !== undefined);
  const rest = items.filter((m) => m.progress === undefined);
  const sourceLabel = mode === "google-drive" ? "synced from Google Drive" : "local demo data";

  return (
    <LibraryEnrichmentProvider targets={enrichmentTargets}>
      <main className="page">
        <Link href="/" className="back-link"><IArrowLeft /> Home</Link>
        <div className="page-head">
          <div>
            <h1>My Media</h1>
            <p className="sub">Everything in your private library · {items.length} titles · {sourceLabel}</p>
          </div>
        </div>

        <section className="secao-conteudos" aria-label="Continue watching">
          <div className="titulo-secao">
            <h2><IPlay style={{ color: "var(--laranja)", width: "1.05em", height: "1.05em" }} /> Continue Watching</h2>
          </div>
          {continueItems.length ? (
            <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
              {continueItems.map((m) => <MediaCard key={m.id} item={m} />)}
            </div>
          ) : (
            <p className="empty-note">Nothing in progress yet. Start a title to see it here.</p>
          )}
        </section>

        {rest.length > 0 && (
          <section className="secao-conteudos" aria-label="Library">
            <div className="titulo-secao">
              <h2><ILibrary style={{ color: "var(--laranja)", width: "1.05em", height: "1.05em" }} /> Library</h2>
            </div>
            <div className="card-grid">
              {rest.map((m) => <MediaCard key={m.id} item={m} />)}
            </div>
          </section>
        )}

        <section className="secao-conteudos" aria-label="Library categories">
          <div className="titulo-secao">
            <h2>Collections</h2>
          </div>
          <div className="library-grid">
            {libraries.map((x) => <LibraryTile key={x.title} item={x} />)}
          </div>
        </section>
      </main>
    </LibraryEnrichmentProvider>
  );
}
