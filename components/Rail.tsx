import Link from "next/link";
import type { MediaItem } from "../lib/types";
import { MediaCard } from "./MediaCard";
import { IArrowRight } from "./icons";

export function Rail({ title, items, seeAll, icon, fill }: { title: string; items: MediaItem[]; seeAll?: string; icon?: React.ReactNode; fill?: boolean }) {
  if (!items.length) return null;
  return (
    <section className="section rail-edge" aria-label={title}>
      <div className="section-head">
        <h2>
          {icon}
          {title}
        </h2>
        {seeAll && (
          <Link href={seeAll} className="see-all">
            See all <IArrowRight />
          </Link>
        )}
      </div>
      <div className={`rail${fill ? " rail--fluid" : ""}`}>
        {items.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
      </div>
    </section>
  );
}