"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "./NavigationMenu";
import { SearchOverlay } from "./SearchOverlay";
import { AccountButton } from "./AccountButton";
import { ICloudUpload, IMenu, ISearch } from "./icons";

const desktopNav = [
  { href: "/", label: "Home" },
  { href: "/browse/movie", label: "Movies" },
  { href: "/browse/series", label: "TV Shows" },
  { href: "/browse/anime", label: "Anime" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="header">
      <div className="brand">
        <button className="icon-btn" aria-label="Open navigation menu" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <IMenu />
        </button>
        <Link href="/" className="brand-mark" aria-label="Smart Upload home">S</Link>
        <Link href="/" className="brand-name">Smart Upload</Link>
      </div>

      <nav className="header-nav" aria-label="Primary">
        {desktopNav.map((n) => (
          <Link key={n.href} href={n.href} className={`navlink ${isActive(n.href) ? "active" : ""}`}>
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        <button className="icon-btn" aria-label="Search library" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}>
          <ISearch />
        </button>
        <Link href="/upload" className="upload-chip">
          <ICloudUpload />
          <span>Upload URL</span>
        </Link>
        <AccountButton />
      </div>

      <NavigationMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}