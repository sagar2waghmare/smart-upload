"use client";
import { useEffect, useState } from "react";
import { isFavorite, toggleFavorite } from "../lib/favorites";
import { IHeart } from "./icons";

export function FavButton({ id, labelStyle = "mini" }: { id: string; labelStyle?: "mini" | "chip" }) {
  // Read localStorage after hydration so the server and first client
  // render produce identical markup.
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(isFavorite(id));
  }, [id]);

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOn(toggleFavorite(id));
  };

  if (labelStyle === "chip")
    return (
      <button className={`btn btn-secondary ${on ? "fav-on" : ""}`} aria-pressed={on} onClick={toggle}>
        <IHeart fill={on ? "currentColor" : "none"} />
        {on ? "In My List" : "My List"}
      </button>
    );

  return (
    <button
      className={`card-fav ${on ? "on" : ""}`}
      aria-label={on ? `Remove from favorites` : `Add to favorites`}
      aria-pressed={on}
      onClick={toggle}
    >
      <IHeart fill={on ? "currentColor" : "none"} />
    </button>
  );
}