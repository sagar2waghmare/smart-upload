"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { IImage } from "./icons";

type Props = {
  src?: string | null;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  unoptimized?: boolean;
  objectPosition?: string;
  objectFit?: "cover" | "contain";
};

export function SmartImage({
  src,
  alt,
  sizes = "(max-width:400px) 118px, (max-width:640px) 132px, (max-width:1024px) 180px, 240px",
  className,
  priority,
  unoptimized,
  objectPosition = "center",
  objectFit = "cover",
}: Props) {
  const [ok, setOk] = useState(Boolean(src));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setOk(Boolean(src));
    setRetry(0);
  }, [src]);

  const imageSrc = src
    ? retry > 0
      ? `${src}${src.includes("?") ? "&" : "?"}retry=${retry}`
      : src
    : undefined;

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {ok && imageSrc ? (
        <Image
          key={imageSrc}
          src={imageSrc}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={unoptimized ?? /^https?:\/\//i.test(imageSrc)}
          onError={() => {
            if (imageSrc.startsWith("/api/thumbnail/")) {
              setOk(false);
              return;
            }
            if (retry < 1) {
              setRetry(1);
            } else {
              setOk(false);
            }
          }}
          style={{ objectFit, objectPosition }}
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
