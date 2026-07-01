function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export function SourceTrustPanel({ syncStatus, t }) {
  const sources = Array.isArray(syncStatus?.sources)
    ? syncStatus.sources.filter((source) => source.source !== "ayudave").slice(0, 6)
    : [];

  return (
    <article className="guide-card source-trust-card">
      <h2>{t.sourceTrust.title}</h2>
      <p>{t.sourceTrust.body}</p>
      {sources.length > 0 ? (
        <div className="source-trust-list">
          {sources.map((source) => (
            <div key={source.source}>
              <strong>{source.source}</strong>
              <span>
                {source.total} {t.sourceTrust.records} · {source.confirmed} {t.alerts.confirmed} · {source.pending} {t.alerts.pending}
              </span>
              <small>{formatDate(source.lastSyncedAt || source.lastUpdatedAt) || t.sourceTrust.noDate}</small>
            </div>
          ))}
        </div>
      ) : (
        <span className="source-trust-empty">{t.sourceTrust.empty}</span>
      )}
      <a href="./estado-tecnico-ayudave.html">{t.sourceTrust.open}</a>
    </article>
  );
}
