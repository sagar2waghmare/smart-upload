import Link from "next/link";
import { IArrowRight } from "./icons";
import { SmartImage } from "./SmartImage";

export function LibraryTile({ item }: { item: { title: string; count: string; image: string; href: string } }) {
  return (
    <Link href={item.href} className="library-tile">
      <SmartImage className="library-tile-art" src={item.image} alt="" sizes="400px" />
      <div className="library-tile-shade" />
      <div className="library-tile-copy">
        <div>
          <h3>{item.title}</h3>
          <p>{item.count}</p>
        </div>
        <IArrowRight className="go-arrow" style={{ width: "1.2em", height: "1.2em" }} />
      </div>
    </Link>
  );
}