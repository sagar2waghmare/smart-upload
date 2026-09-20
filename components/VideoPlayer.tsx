"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  MediaPlayer,
  MediaProvider,
  PlayButton,
  SeekButton,
  useMediaState,
  type MediaPlayerInstance,
} from "@vidstack/react";
import {
  PlyrLayout,
  plyrLayoutIcons,
} from "@vidstack/react/player/layouts/plyr";
import type { Episode, MediaItem } from "../lib/types";
import {
  IExpand,
  IPlay,
  IPause,
  ISkipBack,
  ISkipFwd,
} from "./icons";

type Props = {
  src: string;
  poster?: string | null;
  backdrop?: string | null;
  title: string;
  episodeTitle?: string;
  demo?: boolean;
  subtitleUrl?: string;
  item: MediaItem;
  episode?: Episode | null;
  onEpisode?: (ep: Episode) => void;
  initialTime?: number;
  onProgress?: (p: { position: number; duration: number }) => void;
  onEnded?: () => void;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function NetflixCenterControls() {
  const paused = useMediaState("paused");
  const ended = useMediaState("ended");

  return (
    <div className="su-center-controls" aria-label="Playback controls">
      <SeekButton className="su-center-seek" seconds={-10} aria-label="Back 10 seconds">
        <ISkipBack />
        <span>10</span>
      </SeekButton>
      <PlayButton className="su-center-play" aria-label={paused || ended ? "Play" : "Pause"}>
        {paused || ended ? <IPlay /> : <IPause />}
      </PlayButton>
      <SeekButton className="su-center-seek" seconds={10} aria-label="Forward 10 seconds">
        <ISkipFwd />
        <span>10</span>
      </SeekButton>
    </div>
  );
}

function EpisodeNav({
  previous,
  next,
  onEpisode,
}: {
  previous: Episode | null;
  next: Episode | null;
  onEpisode?: (ep: Episode) => void;
}) {
  if (!onEpisode || (!previous && !next)) return null;

  return (
    <div className="su-episode-nav">
      {previous && (
        <button
          type="button"
          className="su-episode-button"
          onClick={() => onEpisode(previous)}
          aria-label={`Play previous episode: ${previous.title}`}
        >
          <ISkipBack />
          <span>EP {previous.episode}</span>
        </button>
      )}
      {next && (
        <button
          type="button"
          className="su-episode-button"
          onClick={() => onEpisode(next)}
          aria-label={`Play next episode: ${next.title}`}
        >
          <span>EP {next.episode}</span>
          <ISkipFwd />
        </button>
      )}
    </div>
  );
}

export function VideoPlayer({
  src,
  poster,
  backdrop,
  title,
  episodeTitle,
  demo,
  subtitleUrl,
  item,
  episode,
  onEpisode,
  initialTime,
  onProgress,
  onEnded,
}: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const initialAppliedRef = useRef(false);
  const lastProgressRef = useRef(0);
  const callbacksRef = useRef({ onProgress, onEnded });

  useEffect(() => {
    callbacksRef.current = { onProgress, onEnded };
  }, [onProgress, onEnded]);

  const flatEpisodes = useMemo(
    () => item.seasons?.flatMap((season) => season.episodes) ?? [],
    [item.seasons],
  );

  const episodeIndex = episode
    ? flatEpisodes.findIndex((ep) => ep.id === episode.id)
    : -1;

  const previous = episodeIndex > 0 ? flatEpisodes[episodeIndex - 1] : null;
  const next =
    episodeIndex >= 0 && episodeIndex < flatEpisodes.length - 1
      ? flatEpisodes[episodeIndex + 1]
      : null;

  const applyInitial = useCallback(() => {
    const player = playerRef.current;
    if (
      !player ||
      initialAppliedRef.current ||
      !initialTime ||
      initialTime <= 0.5
    ) {
      return;
    }

    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    player.currentTime =
      duration > 0 ? Math.min(initialTime, Math.max(0, duration - 0.25)) : initialTime;
    initialAppliedRef.current = true;
  }, [initialTime]);

  const emitProgress = useCallback((force = false) => {
    const player = playerRef.current;
    if (!player || !player.state.started) return;

    const now = Date.now();
    if (!force && now - lastProgressRef.current < 4000) return;

    const position = Number(player.currentTime);
    const duration = Number(player.duration);
    if (!Number.isFinite(position) || position < 0) return;

    lastProgressRef.current = now;
    callbacksRef.current.onProgress?.({
      position,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    });
  }, []);

  useEffect(() => {
    return () => emitProgress(true);
  }, [emitProgress]);

  return (
    <div className="su-player-frame">
      <MediaPlayer
        ref={playerRef}
        className="su-player"
        src={src}
        title={title}
        poster={poster ?? backdrop ?? undefined}
        viewType="video"
        streamType="on-demand"
        load="eager"
        preload="metadata"
        playsInline
        controls
        controlsDelay={2400}
        keyTarget="player"
        fullscreenOrientation="landscape"
        onLoadedMetadata={applyInitial}
        onCanPlay={applyInitial}
        onTimeUpdate={() => emitProgress(false)}
        onPause={() => emitProgress(true)}
        onEnded={() => {
          emitProgress(true);
          callbacksRef.current.onEnded?.();
        }}
      >
        <MediaProvider>
          {subtitleUrl && (
            <track
              kind="subtitles"
              src={subtitleUrl}
              srcLang="en"
              label="English"
              default
            />
          )}
        </MediaProvider>

        <div className="su-player-top">
          <div className="su-player-heading">
            <span className="su-player-eyebrow">{episodeTitle ? "NOW PLAYING" : "SMART UPLOAD"}</span>
            <strong>{title}</strong>
            {episodeTitle && <span>{episodeTitle}</span>}
          </div>
          <div className="su-player-status">
            {demo && <span>DEMO</span>}
            <i aria-hidden="true" />
          </div>
        </div>

        <NetflixCenterControls />

        <EpisodeNav previous={previous} next={next} onEpisode={onEpisode} />

        <PlyrLayout
          icons={plyrLayoutIcons}
          seekTime={10}
          speed={PLAYBACK_RATES}
          clickToPlay
          clickToFullscreen
          displayDuration
          toggleTime={false}
          controls={[
            "play",
            "progress",
            "current-time",
            "mute+volume",
            "captions",
            "settings",
            "pip",
            "fullscreen",
          ]}
        />
      </MediaPlayer>

      <div className="su-player-brand" aria-hidden="true">
        <span>S</span> Smart Upload
      </div>
    </div>
  );
}
