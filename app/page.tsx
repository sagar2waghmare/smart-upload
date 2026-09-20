import { Hero } from "../components/Hero";
import { Rail } from "../components/Rail";
import { LoginScreen } from "../components/LoginScreen";
import { ContinueWatchingRail } from "../components/ContinueWatchingRail";
import { TopTenRail } from "../components/TopTenRail";
import { getLibrary } from "../lib/library-service";
import { authIntended, requireSession } from "../lib/auth";

const pick = (
  items: Awaited<ReturnType<typeof getLibrary>>["items"],
  test: (m: (typeof items)[number]) => boolean,
) => {
  const matches = items.filter(test);
  return matches.length ? matches.slice(0, 10) : items.slice(0, 10);
};

export default async function Home() {
  if (authIntended() && !(await requireSession())) return <LoginScreen />;

  const { items } = await getLibrary();
  const heroItems = items.slice(0, 5);
  const topTen = items.slice(0, 10);
  const trending = items.slice(0, 10);
  const originals = pick(items, (m) => m.kind === "series");
  const action = pick(items, (m) => (m.genres ?? []).some((g) => /action|adventure/i.test(g)));
  const dark = pick(items, (m) => (m.genres ?? []).some((g) => /dark|thriller|mystery|drama/i.test(g)));
  const crime = pick(items, (m) => (m.genres ?? []).some((g) => /crime|thriller/i.test(g)));

  return (
    <main className="source-netflix-home">
      <Hero items={heroItems} />
      <div className="source-netflix-rows">
        <ContinueWatchingRail />
        <TopTenRail title="Top 10 in your library" items={topTen} />
        <Rail title="Trending Now" items={trending} />
        <Rail title="Only on Netflix" items={originals} />
        <Rail title="Action & Adventure" items={action} />
        <Rail title="Dark & Cerebral" items={dark} />
        <Rail title="Crime & Thrillers" items={crime} />
      </div>
    </main>
  );
}
