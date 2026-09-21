"use client";

import { useState } from "react";
import { NavigationMenu } from "./NavigationMenu";
import { SearchOverlay } from "./SearchOverlay";
import { IMenu } from "./icons";
import { useDetails } from "./DetailsProvider";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { item, playerOpen } = useDetails();
  const overlayOpen = Boolean(item);

  return (
    <header className={`header nav-hover-zone compact-header ${playerOpen ? "player-active" : ""}`}>
      {!overlayOpen ? (
        <button
          className="icon-btn nav-trigger"
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <IMenu />
        </button>
      ) : null}

      {!overlayOpen ? (
        <>
          <NavigationMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onSearchOpen={() => setSearchOpen(true)}
          />
          <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
        </>
      ) : null}
    </header>
  );
}
