"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { IHome, ISearch, ISparkles } from "./icons";

export function NetflixBottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="source-netflix-bottom-tabs" aria-label="Primary">
      <Link href="/" className={pathname === "/" ? "active" : ""}>
        <IHome />
        <span>Home</span>
      </Link>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("smart-upload:open-search"))}>
        <ISearch />
        <span>Search</span>
      </button>
      <Link href="/favorites" className={pathname.startsWith("/favorites") ? "active" : ""}>
        <ISparkles />
        <span>For You</span>
      </Link>
    </nav>
  );
}
