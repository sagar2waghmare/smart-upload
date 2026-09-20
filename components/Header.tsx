"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NavigationMenu } from "./NavigationMenu";
import { SearchOverlay } from "./SearchOverlay";
import { AccountButton } from "./AccountButton";
import { ICloudUpload, IMenu, ISearch, ITv } from "./icons";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 42);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`header netflix-header ${scrolled ? "is-scrolled" : ""}`}>
      <div className="nf-header-left">
        <button
          className="icon-btn nf-menu-trigger"
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <IMenu />
        </button>

        <Link href="/" className="nf-wordmark" aria-label="Smart Upload home">
          <span className="nf-wordmark-main">SMART</span>
          <span className="nf-wordmark-sub">UPLOAD</span>
        </Link>
      </div>

      <nav className="streaming-nav nf-nav" aria-label="Primary">
        <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
        <Link href="/browse/movie" className={pathname.startsWith("/browse/movie") ? "active" : ""}>Movies</Link>
        <Link href="/browse/series" className={pathname.startsWith("/browse/series") ? "active" : ""}>TV Shows</Link>
        <Link href="/browse/anime" className={pathname.startsWith("/browse/anime") ? "active" : ""}>Anime</Link>
        <Link href="/favorites" className={pathname.startsWith("/favorites") ? "active" : ""}>My List</Link>
      </nav>

      <div className="header-actions nf-actions">
        <Link href="/upload" className="icon-btn nf-action" aria-label="Upload URL">
          <ICloudUpload />
        </Link>
        <button
          className="icon-btn nf-action"
          aria-label="Open search"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen(true)}
        >
          <ISearch />
        </button>
        <span className="nf-tv" aria-hidden="true"><ITv /></span>
        <AccountButton />
      </div>

      <NavigationMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSearchOpen={() => setSearchOpen(true)}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
