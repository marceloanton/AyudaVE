import { formatSyncDate, getFreshnessClass } from "../lib/sync-status";

export function SourceFreshness({ syncStatus, t }) {
  if (!syncStatus) return null;

  const externalSources = Array.isArray(syncStatus.sources)
    ? syncStatus.sources.filter((source) => source.source !== "ayudave")
    : [];
  const visibleSources = externalSources.slice(0, 3);
  const hiddenSourceCount = Math.max(0, externalSources.length - visibleSources.length);
  const lastSynced = formatSyncDate(syncStatus.lastSyncedAt);
  const cronOk = syncStatus.cron?.lastOk;

  return (
    <section className={`source-freshness ${getFreshnessClass(syncStatus.lastSyncedAt)}`} aria-label={t.sourceFreshness.label}>
      <div>
        <strong>{t.sourceFreshness.title}</strong>
        <span>{lastSynced ? `${t.sourceFreshness.updated}: ${lastSynced}` : t.sourceFreshness.noSync}</span>
      </div>
      <ul>
        {visibleSources.length > 0 ? (
          visibleSources.map((source) => (
            <li key={source.source}>
              <strong>{source.source}</strong>
              <span>{source.total} · {source.pending} {t.sourceFreshness.pending}</span>
            </li>
          ))
        ) : (
          <li>
            <strong>{t.sourceFreshness.noSources}</strong>
            <span>{t.sourceFreshness.checkAgain}</span>
          </li>
        )}
        {hiddenSourceCount > 0 ? (
          <li className="source-more">
            <strong>+{hiddenSourceCount}</strong>
            <span>{t.sourceFreshness.more}</span>
          </li>
        ) : null}
      </ul>
      <div className="source-freshness-actions">
        <a href="./api.php?action=sync_status" rel="noreferrer" target="_blank">
          {cronOk === false ? t.sourceFreshness.cronIssue : t.sourceFreshness.open}
        </a>
        <a href="./datos-abiertos-ayudave.html">
          {t.utility.export}
        </a>
      </div>
    </section>
  );
}
