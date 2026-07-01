import { useState } from "react";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-VE", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" });
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-VE").format(Number(value || 0));
}

function safeDisplayName(person) {
  const name = String(person.displayName || "").trim();
  if (!name) return "Persona";
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0] || "Persona";
  const initial = parts.length > 1 ? ` ${parts[1].slice(0, 1).toUpperCase()}.` : "";
  return `${first}${initial}`;
}

export function PeopleView({ counts = null, externalMetrics = null, hasMore = false, isLoadingMore = false, onLoadMore, people = [], total = 0, t }) {
  const searching = counts?.searching ?? people.filter((person) => person.status === "Buscando").length;
  const localized = counts?.localized ?? people.filter((person) => person.status === "Localizado").length;
  const found = counts?.found ?? people.filter((person) => person.status === "Encontrado").length;
  const syncedTotal = total || counts?.total || people.length;
  const verified = people.filter((person) => person.verified);
  const external = externalMetrics?.metrics || null;
  const externalUpdatedAt = externalMetrics?.snapshotAt || externalMetrics?.generatedAt || "";
  const externalMode = externalMetrics?.source?.mode === "aggregate_snapshot" ? t.people.externalSnapshot : t.people.externalLive;
  const externalMeta = t.people.externalMode
    .replace("{mode}", externalMode)
    .replace("{updated}", formatDate(externalUpdatedAt) || t.people.externalUnknown);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [safeMode, setSafeMode] = useState(true);
  const filteredPeople = people.filter((person) => {
    const statusMatch = status === "todos" || person.status === status;
    const haystack = normalizeText(`${person.displayName} ${person.city} ${person.zone} ${person.lastSeen} ${person.description}`);
    return statusMatch && (!query.trim() || haystack.includes(normalizeText(query)));
  });

  return (
    <section className="people-view" aria-labelledby="personas-title">
      <header className="people-header">
        <div>
          <h1 id="personas-title">{t.people.title}</h1>
          <p>{t.people.subtitle}</p>
        </div>
        <a href="https://venezuelareporta.org/" rel="noreferrer" target="_blank">
          {t.people.reportAtSource}
        </a>
      </header>
      <div className="people-summary" aria-label={t.people.summary}>
        <article>
          <strong>{syncedTotal}</strong>
          <span>{t.people.total}</span>
        </article>
        <article className="is-alert">
          <strong>{searching}</strong>
          <span>{t.people.searching}</span>
        </article>
        <article className="is-ok">
          <strong>{found}</strong>
          <span>{t.people.found}</span>
        </article>
        <article className="is-info">
          <strong>{localized}</strong>
          <span>{t.people.localized}</span>
        </article>
        <article>
          <strong>{verified.length}</strong>
          <span>{t.people.verified}</span>
        </article>
      </div>
      <div className="people-tools">
        <input
          aria-label={t.people.search}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.people.search}
          type="search"
          value={query}
        />
        <div role="group" aria-label={t.people.filter}>
          {[
            ["todos", t.people.all],
            ["Buscando", t.people.searching],
            ["Localizado", t.people.localized],
            ["Encontrado", t.people.found],
          ].map(([value, label]) => (
            <button
              aria-pressed={status === value}
              className={status === value ? "is-active" : ""}
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="people-safe-mode">
        <div>
          <strong>{t.people.safeModeTitle}</strong>
          <span>{t.people.safeModeBody}</span>
        </div>
        <button
          aria-pressed={safeMode}
          className={safeMode ? "is-active" : ""}
          onClick={() => setSafeMode((value) => !value)}
          type="button"
        >
          {safeMode ? t.people.safeModeOn : t.people.safeModeOff}
        </button>
      </div>
      <p className="people-privacy">{t.people.privacy}</p>
      {(query.trim() || status !== "todos") && hasMore ? (
        <p className="people-privacy">{t.people.localFilterNotice}</p>
      ) : null}
      {external ? (
        <aside className="people-external-metrics" aria-label={t.people.externalTitle}>
          <div>
            <strong>{t.people.externalTitle}</strong>
            <p>{t.people.externalBody}</p>
            <span className="people-external-meta">{externalMeta}</span>
          </div>
          <dl>
            <div>
              <dt>{t.people.externalTotal}</dt>
              <dd>{formatNumber(external.totalPeople)}</dd>
            </div>
            <div>
              <dt>{t.people.externalWithoutContact}</dt>
              <dd>{formatNumber(external.withoutContact)}</dd>
            </div>
            <div>
              <dt>{t.people.externalLocalized}</dt>
              <dd>{formatNumber(external.localized)}</dd>
            </div>
          </dl>
          <a href={externalMetrics.source?.url || "https://desaparecidosterremotovenezuela.com/"} rel="noreferrer" target="_blank">
            {t.people.externalOpen}
          </a>
        </aside>
      ) : null}
      <p className="people-loaded">{t.people.showingLoaded.replace("{loaded}", String(people.length)).replace("{total}", String(syncedTotal))}</p>
      <div className="people-list">
        {filteredPeople.length === 0 ? (
          <article className="empty-state">
            <strong>{t.people.emptyTitle}</strong>
            <span>{t.people.emptyBody}</span>
          </article>
        ) : filteredPeople.map((person) => (
          <article className={`person-card ${safeMode ? "is-safe-mode" : ""}`} key={person.id}>
            {!safeMode && person.photoUrl ? <img alt="" loading="lazy" src={person.photoUrl} /> : <div className="person-avatar">{person.displayName.slice(0, 1) || "P"}</div>}
            <div>
              <div className="person-title-row">
                <h2>{safeMode ? safeDisplayName(person) : person.displayName}</h2>
                <span className={person.status === "Encontrado" ? "is-found" : person.status === "Localizado" ? "is-localized" : "is-searching"}>
                  {person.status}
                </span>
              </div>
              <p>{[person.city, person.zone].filter(Boolean).join(" - ") || t.people.locationUnknown}</p>
              <dl>
                {person.age ? (
                  <>
                    <dt>{t.people.age}</dt>
                    <dd>{person.age}</dd>
                  </>
                ) : null}
                {person.lastSeen ? (
                  <>
                    <dt>{t.people.lastSeen}</dt>
                    <dd>{person.lastSeen}</dd>
                  </>
                ) : null}
                {person.updatedAt || person.syncedAt ? (
                  <>
                    <dt>{t.people.updated}</dt>
                    <dd>{formatDate(person.updatedAt || person.syncedAt)}</dd>
                  </>
                ) : null}
              </dl>
              {person.description && !safeMode ? <p className="person-description">{person.description}</p> : null}
              {person.description && safeMode ? <p className="person-description">{t.people.safeDescription}</p> : null}
              <footer>
                <span>{person.verified ? t.people.verifiedOrigin : t.people.sourcePending}</span>
                {person.isMinor ? <span>{t.people.minorProtected}</span> : null}
                {person.sourceUrl ? (
                  <a href={person.sourceUrl} rel="noreferrer" target="_blank">
                    {t.people.openSource}
                  </a>
                ) : null}
              </footer>
            </div>
          </article>
        ))}
      </div>
      {hasMore ? (
        <button className="people-load-more" disabled={isLoadingMore} onClick={onLoadMore} type="button">
          {isLoadingMore ? t.people.loadingMore : t.people.loadMore}
        </button>
      ) : null}
    </section>
  );
}
