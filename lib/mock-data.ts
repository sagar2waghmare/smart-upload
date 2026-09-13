import type { MediaItem } from "./types";

const lib = (i: string) => `/library/${i}.webp`;

export const mockLibrary: MediaItem[] = [
  {
    id: "the-last-horizon",
    kind: "movie",
    title: "The Last Horizon",
    year: 2026,
    overview:
      "A crew searching beyond the edge of mapped space discovers a signal that changes everything they thought they knew about the universe.",
    runtime: 134,
    rating: 8.1,
    genres: ["Science Fiction", "Adventure"],
    poster: lib("movies"),
    backdrop: lib("movies"),
    tag: "NEW",
    tagStyle: "new",
    progress: 68,
    hasSubtitles: true,
    mediaUrl: "",
  },
  {
    id: "midnight-signal",
    kind: "movie",
    title: "Midnight Signal",
    year: 2025,
    overview:
      "A radio engineer intercepts a transmission from a town that stopped broadcasting thirty years ago — then the calls start arriving.",
    runtime: 112,
    rating: 7.4,
    genres: ["Thriller", "Mystery"],
    poster: lib("mixed"),
    backdrop: lib("mixed"),
    progress: 42,
    hasSubtitles: true,
    mediaUrl: "",
  },
  {
    id: "paper-kingdom",
    kind: "movie",
    title: "Paper Kingdom",
    year: 2023,
    overview:
      "In a city built from folded paper, a courier uncovers a conspiracy folded into the very street she grew up on.",
    runtime: 141,
    rating: 7.8,
    genres: ["Fantasy", "Drama"],
    poster: lib("boxsets"),
    backdrop: lib("boxsets"),
    hasSubtitles: false,
    mediaUrl: "",
  },
  {
    id: "aurora",
    kind: "anime",
    title: "Aurora",
    year: 2025,
    overview:
      "A loner pilot is chosen to ferry the last surviving light of a dying star across a frozen world.",
    runtime: 118,
    rating: 8.0,
    genres: ["Anime", "Adventure"],
    poster: lib("anime"),
    backdrop: lib("anime"),
    tag: "4K",
    tagStyle: "4k",
    hasSubtitles: true,
    mediaUrl: "",
  },
  {
    id: "echoes",
    kind: "movie",
    title: "Echoes",
    year: 2024,
    overview:
      "An acoustician revisits her childhood home to record its silence and instead finds every room still whispering the past.",
    runtime: 96,
    rating: 6.9,
    genres: ["Drama"],
    poster: lib("tvshows"),
    backdrop: lib("tvshows"),
    hasSubtitles: false,
    mediaUrl: "",
  },
  {
    id: "neon-district",
    kind: "series",
    title: "Neon District",
    year: 2026,
    overview:
      "In a rain-soaked megacity, a burned-out detective and a rookie hacker chase a ghost running through the neon district's server farms.",
    runtime: 48,
    rating: 8.3,
    genres: ["Crime", "Sci-Fi"],
    poster: lib("tvshows"),
    backdrop: lib("tvshows"),
    tag: "NEW",
    tagStyle: "new",
    progress: 24,
    hasSubtitles: true,
    mediaUrl: "",
    seasons: [
      {
        season: 1,
        title: "Season 1",
        episodes: [
          {
            id: "neon-district-S01E01",
            title: "Signal Jack",
            season: 1,
            episode: 1,
            overview: "Detective Vale takes a case that should have stayed encrypted.",
            runtime: 48,
            thumb: lib("tvshows"),
            mediaUrl: "",
          },
          {
            id: "neon-district-S01E02",
            title: "Ghost Protocol",
            season: 1,
            episode: 2,
            overview: "The hacker joins the hunt; the district goes dark block by block.",
            runtime: 45,
            thumb: lib("tvshows"),
            mediaUrl: "",
          },
          {
            id: "neon-district-S01E03",
            title: "Neon Sunset",
            season: 1,
            episode: 3,
            overview: "A chase to the rim of the district reveals who holds the pen.",
            runtime: 51,
            thumb: lib("tvshows"),
            mediaUrl: "",
          },
        ],
      },
    ],
  },
  {
    id: "starlight-reverie",
    kind: "anime",
    title: "Starlight Reverie",
    year: 2025,
    overview:
      "An apprentice cartographer maps constellations for a kingdom that has forgotten the night sky.",
    runtime: 24,
    rating: 7.9,
    genres: ["Anime", "Fantasy"],
    poster: lib("anime"),
    backdrop: lib("anime"),
    tag: "NEW",
    tagStyle: "new",
    hasSubtitles: true,
    mediaUrl: "",
    seasons: [
      {
        season: 1,
        title: "Season 1",
        episodes: [
          {
            id: "starlight-reverie-S01E01",
            title: "The Cartographer's Apprentice",
            season: 1,
            episode: 1,
            overview: "Rin is hired to complete a map of stars that only she can see.",
            runtime: 24,
            thumb: lib("anime"),
            mediaUrl: "",
          },
          {
            id: "starlight-reverie-S01E02",
            title: "A Sky Forgotten",
            season: 1,
            episode: 2,
            overview: "The kingdom's astronomers warn there were never stars at all.",
            runtime: 24,
            thumb: lib("anime"),
            mediaUrl: "",
          },
        ],
      },
    ],
  },
];

export function byId(id: string): MediaItem | undefined {
  return mockLibrary.find((m) => m.id === id);
}

export function resolveEpisode(item: MediaItem, seasonArg?: number, episodeArg?: number) {
  if (!item.seasons?.length) return undefined;
  const season =
    seasonArg ?? (item.progress ? 1 : undefined) ?? item.seasons[0].season;
  const s = item.seasons.find((x) => x.season === season) ?? item.seasons[0];
  const ep =
    episodeArg ??
    (item.progress ? Math.min(s.episodes.length, 2) : undefined) ??
    s.episodes[0].episode;
  return s.episodes.find((e) => e.episode === ep) ?? s.episodes[0];
}

export const continueWatching = mockLibrary.filter((m) => m.progress !== undefined);
export const recentlyAdded = [...mockLibrary].sort((a, b) => String(b.year).localeCompare(String(a.year))).slice(0, 6);

export const featuredMedia: MediaItem[] = [
  mockLibrary[0],
  mockLibrary[5],
  mockLibrary[3],
  mockLibrary[1],
  mockLibrary[2],
];

export const libraries = [
  { title: "Movies", count: `${mockLibrary.filter((m) => m.kind === "movie").length * 21} titles`, image: lib("movies"), href: "/browse/movie" },
  { title: "TV Shows", count: `${mockLibrary.filter((m) => m.kind === "series").length * 21} shows`, image: lib("tvshows"), href: "/browse/series" },
  { title: "Anime", count: `${mockLibrary.filter((m) => m.kind === "anime").length * 18} titles`, image: lib("anime"), href: "/browse/anime" },
  { title: "Music", count: "214 albums", image: lib("music"), href: "/settings" },
];