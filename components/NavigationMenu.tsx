"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { getAppMode, getAppVersion } from "../lib/config";
import {
  ICloudUpload,
  IClose,
  IFilm,
  IGear,
  IHeart,
  IHome,
  ISearch,
  ISparkles,
  ITv,
  IMenu,
} from "./icons";

const groups: { label: string; items: { href: string; label: string; icon: typeof IHome; accent?: boolean }[] }[] = [
  {
    label: "Main",
    items: [
      { href: "/", label: "Home", icon: IHome },
      { href: "/favorites", label: "Favorites", icon: IHeart },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/browse/movie", label: "Movies", icon: IFilm },
      { href: "/browse/series", label: "TV Shows", icon: ITv },
      { href: "/browse/anime", label: "Anime", icon: ISparkles },
    ],
  },
];

export function NavigationMenu({ open, onClose, onSearchOpen }: { open: boolean; onClose: () => void; onSearchOpen: () => void }) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const { configured, loading, user, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isDesktop = useRef(false);
  const suppressHover = useRef(false);
  const prevOpen = useRef(open);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px)");
    isDesktop.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { isDesktop.current = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (prevOpen.current && !open) suppressHover.current = true;
    prevOpen.current = open;
  }, [open]);

  const isOpen = hovered || open;

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      document.body.style.overflow = "hidden";
      const t = window.setTimeout(() => closeRef.current?.focus(), 80);
      return () => {
        window.clearTimeout(t);
        document.body.style.overflow = "";
        triggerRef.current?.focus();
      };
    }
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setHovered(false);
      onClose();
    }
    if (e.key === "Tab" && open && panelRef.current) {
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleClose = () => {
    setHovered(false);
    onClose();
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div
        className={`menu-backdrop ${isOpen ? "open" : ""}`}
        onClick={handleClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        id={titleId}
        role="dialog"
        aria-modal={open}
        aria-label="Navigation menu"
        className={`side-menu ${isOpen ? "open" : ""}`}
        onKeyDown={onKey}
        aria-hidden={!isOpen}
        onMouseEnter={() => { if (isDesktop.current && !suppressHover.current) setHovered(true); }}
        onMouseLeave={() => { if (isDesktop.current) { setHovered(false); suppressHover.current = false; } }}
      >
        <div className="side-menu-header">
          <button className="icon-btn" aria-label="Menu" onClick={handleClose}>
            <IMenu />
          </button>
          <span className="brand-mark">S</span>
          <span className="brand-name">Smart Upload</span>
          <button ref={closeRef} className="icon-btn side-menu-close" aria-label="Close menu" onClick={handleClose}>
            <IClose />
          </button>
        </div>

        <div className="menu-scroll">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="menu-group-label">{g.label}</p>
              {g.items.map((it) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    prefetch={it.href.startsWith("/browse/") ? true : undefined}
                    className={`menu-item ${isActive(it.href) ? "active" : ""}`}
                    onClick={handleClose}
                  >
                    <Icon />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="menu-divider" />
          <button className="menu-item" onClick={() => { onSearchOpen(); handleClose(); }}>
            <ISearch />
            <span>Search</span>
          </button>
          <div className="menu-divider" />
          <Link href="/upload" className="menu-item menu-item-upload" onClick={handleClose}>
            <ICloudUpload />
            <span>Upload URL</span>
          </Link>
          <div className="menu-divider" />
          <Link href="/settings" className="menu-item" onClick={handleClose}>
            <IGear />
            <span>Settings</span>
          </Link>
          <div className="menu-divider" />
          {loading ? (
            <p className="menu-item" style={{ opacity: ".5", cursor: "default", pointerEvents: "none" }}>Checking session…</p>
          ) : user ? (
            <>
              <p className="menu-item" style={{ opacity: ".7", cursor: "default", pointerEvents: "none" }}>
                {user.email ?? "Signed in"}
              </p>
              <button className="menu-item" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); handleClose(); }}>
                <IGear />
                <span>{busy ? "Signing out…" : "Sign out"}</span>
              </button>
            </>
          ) : configured ? (
            <button className="menu-item menu-item-upload" disabled={busy} onClick={async () => { setBusy(true); await signIn(); setBusy(false); handleClose(); }}>
              <IGear />
              <span>{busy ? "Signing in…" : "Sign in with Google"}</span>
            </button>
          ) : (
            <p className="menu-item" style={{ opacity: ".5", cursor: "default", pointerEvents: "none" }}>Sign-in not configured</p>
          )}
        </div>

        <div className="menu-footer">
          <span>Smart Upload</span>
          <span className="pill pill-neutral mode-pill">{getAppMode()} · v{getAppVersion()}</span>
        </div>
      </aside>
    </>
  );
}
