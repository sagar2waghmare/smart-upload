import Link from "next/link";
import { IFilm, ITv, ISparkles, ICloudUpload, IChevronRight } from "./icons";

type QuickLink = { label: string; href: string; icon: React.ReactNode };

const links: QuickLink[] = [
  { label: "Movies", href: "/browse/movie", icon: <IFilm style={{ width: "1.1em", height: "1.1em" }} /> },
  { label: "TV Shows", href: "/browse/series", icon: <ITv style={{ width: "1.1em", height: "1.1em" }} /> },
  { label: "Anime", href: "/browse/anime", icon: <ISparkles style={{ width: "1.1em", height: "1.1em" }} /> },
  { label: "Upload", href: "/upload", icon: <ICloudUpload style={{ width: "1.1em", height: "1.1em" }} /> },
];

export function QuickAccess() {
  return (
    <section className="section" aria-label="Quick access">
      <div className="quick-grid">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="quick-pill">
            <span className="quick-pill-icon">{l.icon}</span>
            <span className="quick-pill-label">{l.label}</span>
            <IChevronRight style={{ width: "1em", height: "1em", opacity: .5 }} />
          </Link>
        ))}
      </div>
    </section>
  );
}
