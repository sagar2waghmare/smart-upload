export default function BrowseLoading() {
  return (
    <main className="page browse-loading" aria-busy="true" aria-label="Loading library">
      <div className="browse-loading-head">
        <div className="loading-skeleton loading-back" />
        <div className="loading-skeleton loading-title" />
        <div className="loading-skeleton loading-subtitle" />
      </div>
      <div className="browse-loading-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <div className="browse-loading-card" key={i}>
            <div className="loading-skeleton loading-poster" />
            <div className="loading-skeleton loading-line" />
            <div className="loading-skeleton loading-line short" />
          </div>
        ))}
      </div>
    </main>
  );
}
