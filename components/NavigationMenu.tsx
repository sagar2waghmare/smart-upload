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
  ILibrary,
  IMenu,
  ISparkles,
  ITv,
} from "./icons";

const groups: { label: string; items: { href: string; label: string; icon: typeof IHome; accent?: boolean }[] }[] = [
  {
    label: "Main",
    items: [
      { href: "/", label: "Home", icon: IHome },
      { href: "/my-media", label: "My Media", icon: ILibrary },
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

export function NavigationMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const { configured, loading, user, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div
        className={`menu-backdrop ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        id={titleId}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`side-menu ${open ? "open" : ""}`}
        onKeyDown={onKey}
        aria-hidden={!open}
      >
        <div className="side-menu-header">
          <button className="icon-btn" aria-label="Menu" onClick={onClose}>
            <IMenu />
          </button>
          <span className="brand-mark">S</span>
          <span className="brand-name">Smart Upload</span>
          <button ref={closeRef} className="icon-btn side-menu-close" aria-label="Close menu" onClick={onClose}>
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
                    className={`menu-item ${isActive(it.href) ? "active" : ""}`}
                    onClick={onClose}
                  >
                    <Icon />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="menu-divider" />
          <Link href="/upload" className="menu-item menu-item-upload" onClick={onClose}>
            <ICloudUpload />
            <span>Upload URL</span>
          </Link>
          <div className="menu-divider" />
          <Link href="/settings" className="menu-item" onClick={onClose}>
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
              <button className="menu-item" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); onClose(); }}>
                <IGear />
                <span>{busy ? "Signing out…" : "Sign out"}</span>
              </button>
            </>
          ) : configured ? (
            <button className="menu-item menu-item-upload" disabled={busy} onClick={async () => { setBusy(true); await signIn(); setBusy(false); onClose(); }}>
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