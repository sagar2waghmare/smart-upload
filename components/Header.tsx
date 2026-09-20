"use client";

import { useState } from "react";
import { NavigationMenu } from "./NavigationMenu";
import { SearchOverlay } from "./SearchOverlay";
import { IMenu } from "./icons";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="header nav-hover-zone compact-header">
      <button
        className="icon-btn nav-trigger"
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <IMenu />
      </button>

      <NavigationMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSearchOpen={() => setSearchOpen(true)}
      />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
