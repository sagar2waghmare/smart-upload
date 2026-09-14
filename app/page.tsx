import { Hero } from "../components/Hero";
import { Rail } from "../components/Rail";
import { LibraryTile } from "../components/LibraryTile";
import { SignInPrompt } from "../components/SignInPrompt";
import { LoginScreen } from "../components/LoginScreen";
import { ContinueWatchingRail } from "../components/ContinueWatchingRail";
import { LibrarySnapshot } from "../components/LibrarySnapshot";
import { QuickAccess } from "../components/QuickAccess";
import { getLibrary } from "../lib/library-service";
import { featuredMedia, libraries as mockLibraries } from "../lib/mock-data";
import { isDemoMode } from "../lib/config";
import { authIntended, requireSession } from "../lib/auth";
import { ILibrary } from "../components/icons";

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

  return (
    <main>
      <Hero items={heroItems} />
      <div className="page">
        <SignInPrompt prompt={showSignInPrompt} />
        <ContinueWatchingRail seeAll="/my-media" />
        <Rail title="Recently Added" items={recent.slice(0, 8)} seeAll={heroItems[0].kind === "movie" ? "/browse/movie" : "/browse/series"} fill />
        <section className="section">
          <div className="section-head">
            <h2>
              <ILibrary style={{ color: "var(--accent-bright)", width: "1.1em", height: "1.1em" }} />
              My Media
            </h2>
            <span className="see-all">{mode === "aws" ? "synced with AWS library" : "local demo library"}</span>
          </div>
          <div className="rail rail--fluid">
            {mockLibraries.map((x) => (
              <LibraryTile key={x.title} item={x} />
            ))}
          </div>
        </section>
        <LibrarySnapshot items={items} />
        <QuickAccess />
        {isDemoMode() && (
          <section className="section" aria-label="Demo mode notice">
            <p className="empty-note">
              Demo mode: the library below is sample data. Point <code>AWS_LIBRARY_API_URL</code> at your API to load your real media.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}