"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/types";
import { FavButton } from "./FavButton";
import { SmartImage } from "./SmartImage";
import { useDetails } from "./DetailsProvider";
import { IArrowLeft, IArrowRight, IInfo, IPlay } from "./icons";

const AUTO_DURATION = 8500;

const kindLabel = (k?: MediaItem["kind"]) =>
  k === "series" ? "TV SERIES" : k === "anime" ? "ANIME" : "FEATURED MOVIE";

export function Hero({ items }: { items: MediaItem[] }) {
  const { openDetails } = useDetails();
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const dragRef = useRef({ startX: 0, dragging: false });

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  const advance = useCallback(() => {
    setIndex((prev) => (prev + 1) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2 || hidden) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    const id = window.setInterval(advance, AUTO_DURATION);
    return () => window.clearInterval(id);
  }, [count, hidden, advance]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { startX: e.clientX, dragging: true };
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      const dx = e.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 50) go(dx < 0 ? index + 1 : index - 1);
    },
    [index, go],
  );

  if (!count) return null;
  const active = items[index];

  return (
    <section className="hero-filmes" aria-roledescription="carousel" aria-label="Featured titles">
      <div className="hero-ambient" aria-hidden="true">
        <SmartImage src={active.backdrop ?? active.poster} alt="" sizes="100vw" priority />
      </div>
      <div className="hero-vignette" aria-hidden="true" />

      <div className="hero-track" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {items.map((item, i) => {
          let posicao = i - index;
          if (posicao > count / 2) posicao -= count;
          if (posicao < -count / 2) posicao += count;
          const distancia = Math.abs(posicao);
          const ativo = posicao === 0;

          return (
            <article
              key={item.id}
              className={`hero-poster ${ativo ? "ativo" : ""}`}
              style={{ "--posicao": posicao, "--distancia": distancia } as React.CSSProperties}
              aria-hidden={!ativo}
            >
              <SmartImage
                src={item.poster}
                alt={`${item.title} poster`}
                sizes="(max-width: 600px) 190px, (max-width: 900px) 225px, 270px"
                priority={ativo}
              />
              <div className="hero-poster-sheen" aria-hidden="true" />
              {ativo && (
                <div className="hero-info">
                  <span className="hero-kind">{kindLabel(active.kind)}</span>
                  <h1>{active.title}</h1>
                  <p className="hero-star">
                    {active.rating ? `${active.rating.toFixed(1)} / 10` : ""}
                    {active.year ? ` · ${active.year}` : ""}
                    {active.runtime ? ` · ${Math.floor(active.runtime / 60)}h ${active.runtime % 60}m` : ""}
                  </p>
                  <div className="hero-actions">
                    <button type="button" className="btn btn-primary" onClick={() => openDetails(active)} aria-label={`Open ${active.title} details before playback`}>
                      <IPlay /> Play
                    </button>
                    <FavButton id={active.id} labelStyle="chip" />
                    <button type="button" className="btn btn-secondary" onClick={() => openDetails(active)} aria-label="View details and episodes">
                      <IInfo /> Details
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="hero-nav" aria-label="Featured navigation">
        <button className="hero-nav-btn" onClick={() => go(index - 1)} aria-label="Previous featured title"><IArrowLeft /></button>
        <button className="hero-nav-btn" onClick={() => go(index + 1)} aria-label="Next featured title"><IArrowRight /></button>
      </div>

      <div className="hero-dots" role="tablist" aria-label="Featured titles">
        {items.map((item, i) => (
          <button key={item.id} className={`hero-dot ${i === index ? "on" : ""}`} onClick={() => go(i)} aria-label={`Show ${item.title}`} aria-selected={i === index} role="tab" />
        ))}
      </div>

      <style jsx global>{`
        .hero-filmes {
          position: relative;
          isolation: isolate;
          width: 100%;
          height: clamp(500px, 56vw, 610px);
          min-height: 500px;
          margin: -0.15rem auto 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          touch-action: pan-y;
        }
        .hero-ambient {
          position: absolute;
          inset: -12%;
          z-index: -3;
          opacity: .28;
          filter: blur(34px) saturate(1.2);
          transform: scale(1.12);
          pointer-events: none;
        }
        .hero-ambient::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 43%, rgba(124,58,237,.17), transparent 40%), linear-gradient(180deg, rgba(16,14,18,.15) 20%, rgba(16,14,18,.82) 78%, #100e12 100%);
        }
        .hero-vignette {
          position: absolute;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          background: radial-gradient(ellipse at 50% 43%, transparent 18%, rgba(16,14,18,.2) 53%, rgba(16,14,18,.9) 100%), linear-gradient(180deg, rgba(16,14,18,.08) 40%, #100e12 96%);
        }
        .hero-track {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          perspective: 1300px;
        }
        .hero-poster {
          position: absolute;
          left: 50%;
          top: 40%;
          width: 162px;
          height: 243px;
          overflow: visible;
          border-radius: 15px;
          opacity: calc(1 - (var(--distancia) * .23));
          filter: brightness(calc(1 - (var(--distancia) * .13))) saturate(calc(1 - (var(--distancia) * .05)));
          z-index: calc(20 - var(--distancia));
          transform: translate(calc(-50% + (var(--posicao) * 210px)), -50%) scale(calc(1 - (var(--distancia) * .08))) rotateY(calc(var(--posicao) * -5deg));
          transform-origin: center center;
          transition: transform 760ms cubic-bezier(.16,1,.3,1), opacity 520ms ease, filter 520ms ease;
          will-change: transform, opacity, filter;
        }
        .hero-poster.ativo {
          width: 255px;
          height: 365px;
          opacity: 1;
          filter: none;
          z-index: 30;
          transform: translate(-50%, -50%) scale(1) rotateY(0deg);
        }
        .hero-poster > div:first-child {
          border-radius: 15px;
        }
        .hero-poster img {
          border-radius: 15px;
          box-shadow: 0 24px 60px rgba(0,0,0,.6);
          transition: transform 580ms cubic-bezier(.16,1,.3,1), box-shadow 580ms ease, filter 580ms ease;
        }
        .hero-poster:hover img {
          transform: scale(1.025) translateY(-5px);
          filter: brightness(1.04) saturate(1.07);
          box-shadow: 0 34px 80px rgba(0,0,0,.8);
        }
        .hero-poster-sheen {
          position: absolute;
          inset: 0;
          z-index: 5;
          border-radius: 15px;
          pointer-events: none;
          background: linear-gradient(115deg, rgba(255,255,255,.12), transparent 23%, transparent 70%, rgba(255,255,255,.05));
          opacity: .34;
          transition: opacity .45s ease;
        }
        .hero-poster:hover .hero-poster-sheen { opacity: .72; }
        .hero-poster::after {
          content: "";
          position: absolute;
          left: 7%;
          right: 7%;
          bottom: -31px;
          height: 48px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(124,58,237,.58), rgba(124,58,237,.14) 42%, transparent 72%);
          filter: blur(15px);
          opacity: .28;
          transform: scaleX(.72);
          transition: opacity .65s ease, transform .75s cubic-bezier(.16,1,.3,1);
          pointer-events: none;
        }
        .hero-poster.ativo::after {
          opacity: .95;
          transform: scaleX(1);
          animation: heroGlow 3.8s ease-in-out infinite;
        }
        @keyframes heroGlow {
          0%,100% { filter: blur(15px); opacity: .72; }
          50% { filter: blur(21px); opacity: 1; }
        }
        .hero-info {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10;
          padding: 67px 16px 15px;
          border-radius: 0 0 15px 15px;
          background: linear-gradient(180deg, transparent 0%, rgba(8,7,10,.48) 27%, rgba(8,7,10,.96) 100%);
          color: #fff;
          pointer-events: none;
          transform: translateZ(20px);
        }
        .hero-kind { display: inline-block; margin-bottom: 3px; color: rgba(255,255,255,.72); font-size: .61rem; font-weight: 750; letter-spacing: .15em; }
        .hero-info h1 { color: #fff; font-size: clamp(1.1rem, 2vw, 1.48rem); line-height: 1.08; letter-spacing: -.025em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 3px 16px rgba(0,0,0,.7); }
        .hero-star { margin-top: 6px; color: rgba(255,255,255,.7); font-size: .72rem; font-weight: 600; }
        .hero-actions { display: flex; align-items: center; gap: 6px; margin-top: 10px; pointer-events: auto; }
        .hero-actions .btn { min-height: 34px; padding: .52em .8em; font-size: .73rem; border-radius: 9px; }
        .hero-actions .btn-primary { box-shadow: 0 8px 24px rgba(255,91,34,.24); }
        .hero-actions .btn-primary:hover { transform: translateY(-2px); }
        .hero-actions .btn-secondary { background: rgba(255,255,255,.09); border-color: rgba(255,255,255,.16); backdrop-filter: blur(8px); }
        .hero-nav { position: absolute; left: 0; right: 0; top: 40%; z-index: 40; display: flex; justify-content: space-between; padding: 0 clamp(.6rem, 2vw, 1.2rem); transform: translateY(-50%); pointer-events: none; }
        .hero-nav-btn { pointer-events: auto; width: 38px; height: 38px; border: 1px solid rgba(255,255,255,.14); border-radius: 50%; background: rgba(16,14,18,.5); color: #fff; display: grid; place-items: center; cursor: pointer; backdrop-filter: blur(12px); box-shadow: 0 10px 28px rgba(0,0,0,.35); transition: transform .25s ease, background .25s ease, border-color .25s ease; }
        .hero-nav-btn:hover { transform: scale(1.08); background: rgba(124,58,237,.2); border-color: rgba(124,58,237,.48); }
        .hero-nav-btn svg { width: 17px; height: 17px; }
        .hero-dots { position: absolute; left: 50%; bottom: 13px; z-index: 45; transform: translateX(-50%); display: flex; align-items: center; gap: 7px; padding: 7px 10px; border-radius: 999px; background: rgba(16,14,18,.42); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(10px); }
        .hero-dot { width: 6px; height: 6px; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,.28); cursor: pointer; transition: width .35s ease, background .35s ease, transform .35s ease; }
        .hero-dot:hover { transform: scale(1.45); background: rgba(255,255,255,.76); }
        .hero-dot.on { width: 22px; background: var(--laranja); box-shadow: 0 0 12px rgba(255,107,53,.42); }

        .home-main { width: min(100%, 1500px); margin: 0 auto; }
        .home-content { width: min(100%, 1440px); margin: 0 auto; padding: 0 clamp(1rem, 3.2vw, 3rem) 4rem; }
        .home-content .secao-conteudos { margin: 0; padding: 1.2rem 0 1rem; }
        .home-content .secao-conteudos + .secao-conteudos { border-top: 1px solid rgba(255,255,255,.055); }
        .titulo-secao { display: flex; align-items: center; gap: 1rem; margin-bottom: .8rem; }
        .titulo-secao h2 { color: var(--texto-destaque); font-size: clamp(1.04rem, 1.45vw, 1.26rem); font-weight: 750; letter-spacing: -.02em; }
        .titulo-secao a { margin-left: auto; color: rgba(255,255,255,.56); font-size: .7rem; font-weight: 650; transition: color .2s ease; }
        .titulo-secao a:hover { color: var(--laranja); }
        .controles-carrossel { margin-left: auto; display: flex; gap: 5px; }
        .controles-carrossel button { width: 29px; height: 29px; border-radius: 8px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); color: rgba(255,255,255,.72); cursor: pointer; transition: transform .2s ease, background .2s ease, border-color .2s ease; }
        .controles-carrossel button:hover { transform: translateY(-2px); background: rgba(124,58,237,.14); border-color: rgba(124,58,237,.35); }
        .lista-conteudos { display: flex; gap: 13px; overflow-x: auto; overflow-y: hidden; padding: 4px 3px 17px; scroll-behavior: smooth; scroll-snap-type: x proximity; scrollbar-width: none; }
        .lista-conteudos::-webkit-scrollbar { display: none; }
        .card-conteudo { position: relative; flex: 0 0 clamp(142px, 12vw, 170px); scroll-snap-align: start; }
        .card-conteudo .poster { position: relative; display: block; width: 100%; aspect-ratio: 2 / 3; overflow: hidden; border: 0; border-radius: 11px; background: var(--fundo-card); cursor: pointer; box-shadow: 0 12px 26px rgba(0,0,0,.22); }
        .card-conteudo .poster::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 58%, rgba(0,0,0,.4)); opacity: .58; transition: opacity .3s ease; }
        .card-conteudo .poster > div { transition: transform .45s cubic-bezier(.16,1,.3,1); }
        .card-conteudo:hover .poster { box-shadow: 0 18px 38px rgba(0,0,0,.44), 0 0 0 1px rgba(124,58,237,.2); }
        .card-conteudo:hover .poster > div { transform: scale(1.045); }
        .card-conteudo:hover .poster::after { opacity: .22; }
        .card-conteudo .info-conteudo { padding: 8px 2px 0; }
        .card-conteudo .info-conteudo h3 { color: var(--texto-destaque); font-size: .78rem; line-height: 1.25; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-conteudo .info-conteudo span { display: block; margin-top: 3px; color: rgba(168,163,179,.72); font-size: .64rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-conteudo .info-conteudo strong { display: block; margin-top: 3px; color: var(--cor-nota); font-size: .63rem; font-weight: 700; }
        .card-conteudo .media-card-progress { margin-top: 5px; }
        .card-conteudo .media-card-progress-label { color: rgba(255,255,255,.56); font-size: .58rem; }
        .card-conteudo .progress-bar { height: 3px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.1); }
        .card-conteudo .progress-bar span { display: block; height: 100%; background: var(--laranja); border-radius: inherit; }

        @media (max-width: 900px) {
          .hero-filmes { height: 525px; min-height: 500px; }
          .hero-poster { width: 145px; height: 218px; transform: translate(calc(-50% + (var(--posicao) * 175px)), -50%) scale(calc(1 - (var(--distancia) * .08))) rotateY(calc(var(--posicao) * -4deg)); }
          .hero-poster.ativo { width: 225px; height: 325px; }
          .home-content { padding-inline: 1.1rem; }
        }
        @media (max-width: 600px) {
          .hero-filmes { height: 475px; min-height: 450px; }
          .hero-ambient { opacity: .2; filter: blur(25px) saturate(1.12); }
          .hero-poster { width: 108px; height: 162px; transform: translate(calc(-50% + (var(--posicao) * 126px)), -50%) scale(calc(1 - (var(--distancia) * .1))) rotateY(calc(var(--posicao) * -3deg)); }
          .hero-poster.ativo { width: 188px; height: 278px; }
          .hero-info { padding: 57px 11px 11px; }
          .hero-kind { font-size: .56rem; }
          .hero-info h1 { font-size: 1rem; }
          .hero-star { font-size: .62rem; margin-top: 5px; }
          .hero-actions { gap: 4px; margin-top: 7px; }
          .hero-actions .btn { min-height: 29px; padding: .44em .58em; font-size: .63rem; border-radius: 8px; }
          .hero-nav { top: 39%; padding-inline: .3rem; }
          .hero-nav-btn { width: 32px; height: 32px; }
          .hero-dots { bottom: 7px; }
          .home-content { padding: 0 .8rem 3rem; }
          .home-content .secao-conteudos { padding-block: .9rem .75rem; }
          .lista-conteudos { gap: 10px; padding-bottom: 12px; }
          .card-conteudo { flex-basis: 124px; }
          .card-conteudo .info-conteudo h3 { font-size: .7rem; }
          .card-conteudo .info-conteudo span { font-size: .58rem; }
          .titulo-secao h2 { font-size: .98rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-poster, .hero-poster img, .hero-poster::after, .hero-poster-sheen, .hero-ambient, .card-conteudo .poster, .card-conteudo .poster > div { transition: none !important; animation: none !important; }
        }
      `}</style>
    </section>
  );
}
