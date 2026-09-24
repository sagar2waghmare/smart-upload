import { Hero } from "../components/Hero";
import { Rail } from "../components/Rail";
import { SignInPrompt } from "../components/SignInPrompt";
import { LoginScreen } from "../components/LoginScreen";
import { ContinueWatchingRail } from "../components/ContinueWatchingRail";
import { LibraryEnrichmentProvider } from "../components/LibraryEnrichmentProvider";
import { getLibrary } from "../lib/library-service";
import { authIntended, requireSession } from "../lib/auth";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const { signin } = await searchParams;
  if (authIntended() && !(await requireSession())) {
    return <LoginScreen />;
  }
  const showSignInPrompt = signin === "1";
  const { items } = await getLibrary();
  const heroItems = items.slice(0, 5);
  const movies = items.filter((item) => item.kind === "movie");
  const tvShows = items.filter((item) => item.kind === "series");
  const anime = items.filter((item) => item.kind === "anime");

  return (
    <LibraryEnrichmentProvider>
      <main className="home-main">
        <Hero items={heroItems} />
        <div className="page home-content">
          <SignInPrompt prompt={showSignInPrompt} />
          <ContinueWatchingRail initialItems={items} />
          <Rail title="Movies" items={movies.slice(0, 12)} seeAll="/browse/movie" />
          <Rail title="TV Shows" items={tvShows.slice(0, 12)} seeAll="/browse/series" />
          {anime.length > 0 && (
            <Rail title="Anime" items={anime.slice(0, 12)} seeAll="/browse/anime" />
          )}
        </div>
      </main>
    </LibraryEnrichmentProvider>
  );
}
