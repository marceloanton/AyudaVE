import { useMemo, useState } from "react";
import { needTypes } from "../data/catalog";
import { detectInternationalAidPoint, redactSensitiveText, typeClass, typeInitial } from "../lib/report-utils";
import { Icon } from "./Icon";
import { TrustBadge } from "./TrustBadge";

export function DirectoryView({ helpPoints, onValidatePoint, t }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("Todos");
  const [scope, setScope] = useState("all");

  const scopeCounts = useMemo(() => {
    const international = helpPoints.filter((point) => detectInternationalAidPoint(point)).length;
    const pending = helpPoints.filter((point) => point.status === "Sin validar").length;
    const confirmed = helpPoints.filter((point) => point.status === "Confirmado" || point.status === "Abierto").length;
    return {
      all: helpPoints.length,
      local: helpPoints.length - international,
      international,
      pending,
      confirmed,
    };
  }, [helpPoints]);

  const filteredPoints = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return helpPoints.filter((point) => {
      const isInternational = Boolean(detectInternationalAidPoint(point));
      const typeMatch = type === "Todos" || point.type === type;
      const scopeMatch = scope === "all" || (scope === "local" && !isInternational) || (scope === "international" && isInternational);
      const haystack = `${point.name} ${point.area} ${point.service} ${point.status}`.toLowerCase();
      return scopeMatch && typeMatch && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [helpPoints, query, scope, type]);

  return (
    <section className="directory-view" id="view-directorio" aria-labelledby="directorio-title">
      <div className="view-header">
        <div>
          <p>{t.directory.eyebrow}</p>
          <h2 id="directorio-title">{t.directory.title}</h2>
        </div>
        <label className="directory-search">
          <Icon name="search" />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.directory.search}
            type="search"
            value={query}
          />
        </label>
      </div>
      <div className="directory-summary" aria-label={t.directory.summaryLabel}>
        {[
          [t.directory.summaryTotal, scopeCounts.all],
          [t.directory.scopeLocal, scopeCounts.local],
          [t.directory.scopeInternational, scopeCounts.international],
          [t.directory.summaryPending, scopeCounts.pending],
          [t.directory.summaryConfirmed, scopeCounts.confirmed],
        ].map(([label, value]) => (
          <article key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <div className="filter-chips" role="group" aria-label={t.directory.filter}>
        {["Todos", ...needTypes].map((item) => (
          <button aria-pressed={type === item} className={type === item ? "is-active" : ""} key={item} onClick={() => setType(item)} type="button">
            {t.type(item)}
          </button>
        ))}
      </div>
      <div className="filter-chips scope-chips" role="group" aria-label={t.directory.filterByScope}>
        {[
          ["all", t.directory.scopeAll, scopeCounts.all],
          ["local", t.directory.scopeLocal, scopeCounts.local],
          ["international", t.directory.scopeInternational, scopeCounts.international],
        ].map(([value, label, count]) => (
          <button aria-pressed={scope === value} className={scope === value ? "is-active" : ""} key={value} onClick={() => setScope(value)} type="button">
            {label} <span>{count}</span>
          </button>
        ))}
      </div>
      <div className="directory-table">
        {filteredPoints.length === 0 ? (
          <div className="empty-state">
            <h3>{t.directory.emptyTitle}</h3>
            <p>{t.directory.emptyBody}</p>
          </div>
        ) : null}
        {filteredPoints.map((point) => {
          const internationalCountry = detectInternationalAidPoint(point);
          return (
          <article className="directory-row" key={point.id || `${point.name}-${point.service}`}>
            <div className={`help-icon ${typeClass(point.type)}`} aria-hidden="true">
              {typeInitial(point.type)}
            </div>
            <div>
              <h3>{point.name}</h3>
              <p>{redactSensitiveText(point.service)}</p>
              {internationalCountry ? (
                <span className="country-badge">{t.directory.outsideVenezuela}: {internationalCountry}</span>
              ) : null}
              <TrustBadge compact item={point} t={t} />
              {point.source_url ? (
                <a className="source-link" href={point.source_url} rel="noreferrer" target="_blank">
                  {t.detail.openSource}
                </a>
              ) : null}
            </div>
            <span>{redactSensitiveText(point.area)}</span>
            <strong>{point.hours}</strong>
            <div className="place-validation">
              <em>{t.status(point.status)}</em>
              <small>
                {t.directory.validations}: {Number(point.validationActive || 0)} / {Number(point.validationReview || 0)}
              </small>
              <div className="place-validation-actions">
                <button
                  aria-pressed={point.userValidation === "active"}
                  className={point.userValidation === "active" ? "is-active" : ""}
                  onClick={() => onValidatePoint(point, "active")}
                  type="button"
                >
                  {t.directory.stillActive}
                </button>
                <button
                  aria-pressed={point.userValidation === "review"}
                  className={point.userValidation === "review" ? "is-warning" : ""}
                  onClick={() => onValidatePoint(point, "review")}
                  type="button"
                >
                  {t.directory.needsReview}
                </button>
                <button
                  aria-pressed={point.userValidation === "incorrect"}
                  className={point.userValidation === "incorrect" ? "is-danger" : ""}
                  onClick={() => onValidatePoint(point, "incorrect")}
                  type="button"
                >
                  {t.directory.incorrect}
                </button>
              </div>
              {point.userValidation ? <b>{t.directory.validationSaved}</b> : null}
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
