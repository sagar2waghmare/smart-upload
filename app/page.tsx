import { Hero } from "../components/Hero";
import { Rail } from "../components/Rail";
import { SignInPrompt } from "../components/SignInPrompt";
import { LoginScreen } from "../components/LoginScreen";
import { ContinueWatchingRail } from "../components/ContinueWatchingRail";
import { getLibrary } from "../lib/library-service";
import { featuredMedia } from "../lib/mock-data";
import { isDemoMode } from "../lib/config";
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
  const { items, mode } = await getLibrary();
  const heroItems = mode === "aws" && items.length > 0 ? items.slice(0, 5) : featuredMedia;
  const recent = items.slice();
  const movies = items.filter((item) => item.kind === "movie");
  const tvShows = items.filter((item) => item.kind === "series");
  const anime = items.filter((item) => item.kind === "anime");

  return (
    <main className="home-main">
      <Hero items={heroItems} />
      <div className="page home-content">
        <SignInPrompt prompt={showSignInPrompt} />
        <ContinueWatchingRail seeAll="/my-media" />
        <Rail title="Movies" items={movies.slice(0, 12)} seeAll="/browse/movie" />
        <Rail title="TV Shows" items={tvShows.slice(0, 12)} seeAll="/browse/series" />
        <Rail title="Recently Added" items={recent.slice(0, 12)} />
        {anime.length > 0 && (
          <Rail title="Anime" items={anime.slice(0, 12)} seeAll="/browse/anime" />
        )}
        {isDemoMode() && (
          <section className="section home-demo-note" aria-label="Demo mode notice">
            <p className="empty-note">
              Demo mode: the library below is sample data. Point <code>AWS_LIBRARY_API_URL</code> at your API to load your real media.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
