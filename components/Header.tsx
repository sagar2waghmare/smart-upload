"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NavigationMenu } from "./NavigationMenu";
import { SearchOverlay } from "./SearchOverlay";
import { AccountButton } from "./AccountButton";
import { ISearch, ITv, IChevronDown } from "./icons";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const openSearch = () => setSearchOpen(true);
    window.addEventListener("smart-upload:open-search", openSearch);
    return () => window.removeEventListener("smart-upload:open-search", openSearch);
  }, []);

  return (
    <header className={"source-netflix-header " + (scrolled ? "is-scrolled" : "")}>
      <div className="source-netflix-top">
        <Link href="/" className="source-netflix-wordmark" aria-label="Home">NETFLIX</Link>

        <div className="source-netflix-actions">
          <Link href="/" className="source-netflix-icon" aria-label="TV Shows">
            <ITv />
          </Link>
          <button
            className="source-netflix-icon"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <ISearch />
          </button>
          <AccountButton />
        </div>
      </div>

      <div className="source-netflix-chips" aria-label="Browse">
        <Link href="/browse/series" className={pathname.startsWith("/browse/series") ? "active" : ""}>
          TV Shows
        </Link>
        <Link href="/browse/movie" className={pathname.startsWith("/browse/movie") ? "active" : ""}>
          Movies
        </Link>
        <button
          type="button"
          className={menuOpen ? "active" : ""}
          onClick={() => setMenuOpen((v) => !v)}
        >
          Categories <IChevronDown />
        </button>
      </div>

      <NavigationMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSearchOpen={() => {
          setMenuOpen(false);
          setSearchOpen(true);
        }}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
