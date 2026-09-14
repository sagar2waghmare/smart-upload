"use client";
import { useState } from "react";
import Link from "next/link";
import { NavigationMenu } from "./NavigationMenu";
import { SearchOverlay } from "./SearchOverlay";
import { AccountButton } from "./AccountButton";
import { ICloudUpload, IMenu, ISearch } from "./icons";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="header">
      <div className="brand">
        <button className="icon-btn" aria-label="Open navigation menu" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <IMenu />
        </button>
        <Link href="/" className="brand-mark" aria-label="Smart Upload home">S</Link>
        <Link href="/" className="brand-name">Smart Upload</Link>
      </div>

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