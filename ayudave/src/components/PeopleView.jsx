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

export function PeopleView({ people = [], t }) {
  const searching = people.filter((person) => person.status === "Buscando");
  const found = people.filter((person) => person.status === "Encontrado");
  const verified = people.filter((person) => person.verified);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
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
          <strong>{people.length}</strong>
          <span>{t.people.total}</span>
        </article>
        <article className="is-alert">
          <strong>{searching.length}</strong>
          <span>{t.people.searching}</span>
        </article>
        <article className="is-ok">
          <strong>{found.length}</strong>
          <span>{t.people.found}</span>
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
            ["Encontrado", t.people.found],
          ].map(([value, label]) => (
            <button className={status === value ? "is-active" : ""} key={value} onClick={() => setStatus(value)} type="button">
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="people-privacy">{t.people.privacy}</p>
      <div className="people-list">
        {filteredPeople.length === 0 ? (
          <article className="empty-state">
            <strong>{t.people.emptyTitle}</strong>
            <span>{t.people.emptyBody}</span>
          </article>
        ) : filteredPeople.map((person) => (
          <article className="person-card" key={person.id}>
            {person.photoUrl ? <img alt="" loading="lazy" src={person.photoUrl} /> : <div className="person-avatar">{person.displayName.slice(0, 1) || "P"}</div>}
            <div>
              <div className="person-title-row">
                <h2>{person.displayName}</h2>
                <span className={person.status === "Encontrado" ? "is-found" : "is-searching"}>{person.status}</span>
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
              {person.description ? <p className="person-description">{person.description}</p> : null}
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
    </section>
  );
}
