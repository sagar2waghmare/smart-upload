"use client";
import Image from "next/image";
import { useState } from "react";
import { IImage } from "./icons";

type Props = {
  src?: string | null;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  unoptimized?: boolean;
  objectPosition?: string;
};

export function SmartImage({
  src,
  alt,
  sizes = "(max-width:400px) 118px, (max-width:640px) 132px, (max-width:1024px) 180px, 240px",
  className,
  priority,
  unoptimized,
  objectPosition = "center",
}: Props) {
  const [ok, setOk] = useState(Boolean(src));

  return (
    <div className={className} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {ok && src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={unoptimized}
          onError={() => setOk(false)}
          style={{ objectFit: "cover", objectPosition }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "var(--fundo-card)",
          }}
        >
          <IImage width={26} height={26} style={{ color: "var(--texto-claro)", opacity: 0.45 }} />
        </div>
      )}
    </div>
  );
}