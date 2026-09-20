import { Hero } from "../components/Hero";
import { Rail } from "../components/Rail";
import { SignInPrompt } from "../components/SignInPrompt";
import { LoginScreen } from "../components/LoginScreen";
import { ContinueWatchingRail } from "../components/ContinueWatchingRail";
import { TopTenRail } from "../components/TopTenRail";
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
  const topTen = items.slice(0, 10);
  const movies = items.filter((item) => item.kind === "movie");
  const tvShows = items.filter((item) => item.kind === "series");
  const anime = items.filter((item) => item.kind === "anime");

  return (
    <main className="home-main nf-home">
      <Hero items={heroItems} />
      <div className="page home-content nf-home-content">
        <SignInPrompt prompt={showSignInPrompt} />
        <ContinueWatchingRail />
        <TopTenRail items={topTen} />
        <Rail title="Movies" items={movies.slice(0, 12)} seeAll="/browse/movie" />
        <Rail title="TV Shows" items={tvShows.slice(0, 12)} seeAll="/browse/series" />
        {anime.length > 0 && <Rail title="Anime" items={anime.slice(0, 12)} seeAll="/browse/anime" />}
      </div>
    </main>
  );
}
