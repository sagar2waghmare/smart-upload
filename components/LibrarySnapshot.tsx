import { IFilm, ITv, ISparkles, ILibrary } from "./icons";

type Stat = { label: string; value: number | string; icon: React.ReactNode };

export function LibrarySnapshot({ items }: { items: { kind: string }[] }) {
  const movies = items.filter((m) => m.kind === "movie").length;
  const series = items.filter((m) => m.kind === "series").length;
  const anime = items.filter((m) => m.kind === "anime").length;
  const total = items.length;

  const stats: Stat[] = [
    { label: "Total", value: total, icon: <ILibrary style={{ width: "1.15em", height: "1.15em" }} /> },
    { label: "Movies", value: movies, icon: <IFilm style={{ width: "1.15em", height: "1.15em" }} /> },
    { label: "TV Shows", value: series, icon: <ITv style={{ width: "1.15em", height: "1.15em" }} /> },
    { label: "Anime", value: anime, icon: <ISparkles style={{ width: "1.15em", height: "1.15em" }} /> },
  ];

  return (
    <section className="section snapshot-section" aria-label="Library at a glance">
      <div className="section-head">
        <h2>
          <ILibrary style={{ color: "var(--accent-bright)", width: "1.1em", height: "1.1em" }} />
          Library at a Glance
        </h2>
      </div>
      <div className="snapshot-grid">
        {stats.map((s) => (
          <div key={s.label} className="snapshot-card">
            <span className="snapshot-icon">{s.icon}</span>
            <span className="snapshot-value">{s.value}</span>
            <span className="snapshot-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
