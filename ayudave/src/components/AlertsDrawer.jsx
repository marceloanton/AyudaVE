import { alerts } from "../data/catalog";
import { formatSyncDate, getFreshnessClass } from "../lib/sync-status";

function countReports(reports) {
  return reports.reduce(
    (counts, report) => {
      if (report.priority === "Alta" && report.status !== "Resuelto") counts.urgent += 1;
      if (report.source && report.status === "Sin validar") counts.externalPending += 1;
      if (report.privacyReview) counts.privacyReview += 1;
      return counts;
    },
    { urgent: 0, externalPending: 0, privacyReview: 0 },
  );
}

export function AlertsDrawer({ open, reports = [], serverSyncAvailable, syncStatus, t }) {
  const counts = countReports(reports);
  const cronNeedsReview = !syncStatus?.cron?.configured || syncStatus?.cron?.lastOk === false;
  const syncIssue = !serverSyncAvailable || cronNeedsReview;
  const sourceRows = Array.isArray(syncStatus?.sources)
    ? syncStatus.sources.filter((source) => source.source !== "ayudave")
    : [];
  const operationalCards = [
    {
      id: "urgent",
      count: counts.urgent,
      title: t.alerts.urgentOpen,
      body: counts.urgent > 0 ? t.alerts.urgentOpenBody : t.alerts.urgentOkBody,
      tone: counts.urgent > 0 ? "urgent" : "ok",
    },
    {
      id: "external",
      count: counts.externalPending,
      title: t.alerts.externalPending,
      body: counts.externalPending > 0 ? t.alerts.externalPendingBody : t.alerts.externalOkBody,
      tone: counts.externalPending > 0 ? "warning" : "ok",
    },
    {
      id: "privacy",
      count: counts.privacyReview,
      title: t.alerts.privacyReview,
      body: counts.privacyReview > 0 ? t.alerts.privacyReviewBody : t.alerts.privacyOkBody,
      tone: counts.privacyReview > 0 ? "warning" : "ok",
    },
    {
      id: "sync",
      count: syncIssue ? "!" : "OK",
      title: syncIssue ? t.alerts.syncIssue : t.alerts.syncOk,
      body: syncIssue ? t.alerts.syncIssueBody : t.alerts.syncOkBody,
      tone: syncIssue ? "warning" : "ok",
    },
  ];

  return (
    <section className={`alerts-drawer ${open ? "is-open" : ""}`} id="view-alertas" aria-labelledby="alertas-title">
      <div className="section-heading">
        <p>{t.alerts.eyebrow}</p>
        <h2 id="alertas-title">{t.alerts.title}</h2>
      </div>
      <div className="alert-summary-grid" aria-label={t.alerts.operationalTitle}>
        {operationalCards.map((card) => (
          <article className={`alert-card operational ${card.tone}`} key={card.id}>
            <strong className="alert-count">{card.count}</strong>
            <div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          </article>
        ))}
      </div>
      <h3 className="alert-section-title">{t.alerts.sourcesTitle}</h3>
      <div className="source-health-grid" aria-label={t.alerts.sourcesTitle}>
        {sourceRows.length > 0 ? (
          sourceRows.map((source) => {
            const freshness = getFreshnessClass(source.lastSyncedAt);
            return (
              <article className={`source-health-card ${freshness}`} key={source.source}>
                <div>
                  <strong>{source.source}</strong>
                  <span>{formatSyncDate(source.lastSyncedAt) || t.sourceFreshness.noSync}</span>
                </div>
                <dl>
                  <div>
                    <dt>{t.alerts.total}</dt>
                    <dd>{source.total}</dd>
                  </div>
                  <div>
                    <dt>{t.alerts.pending}</dt>
                    <dd>{source.pending}</dd>
                  </div>
                  <div>
                    <dt>{t.alerts.confirmed}</dt>
                    <dd>{source.confirmed}</dd>
                  </div>
                </dl>
                <em>{t.alerts[freshness.replace("is-", "")] || t.alerts.unknown}</em>
              </article>
            );
          })
        ) : (
          <article className="source-health-card is-unknown">
            <div>
              <strong>{t.sourceFreshness.noSources}</strong>
              <span>{t.sourceFreshness.checkAgain}</span>
            </div>
          </article>
        )}
      </div>
      {cronNeedsReview ? (
        <p className="cron-warning">
          <strong>{t.alerts.cronTitle}</strong>
          <span>{t.alerts.cronBody}</span>
        </p>
      ) : null}
      <h3 className="alert-section-title">{t.alerts.staticTitle}</h3>
      <div className="alert-stack">
        {alerts.map((alert) => (
          <article className={`alert-card ${alert.urgent ? "urgent" : ""}`} key={alert.title}>
            <h3>{alert.title}</h3>
            <p>{alert.body}</p>
            <div className="alert-meta">
              {alert.meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
