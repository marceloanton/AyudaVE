import { detectInternationalAidPoint, redactSensitiveText, typeClass, typeInitial } from "../lib/report-utils";
import { TrustBadge } from "./TrustBadge";

export function HelpPanel({ helpPoints, onNavigate, onValidatePoint, t }) {
  return (
    <aside className="help-panel" aria-labelledby="nearby-help-title">
      <h2 id="nearby-help-title">{t.directory.nearby}</h2>
      <div className="directory-grid">
        {helpPoints.length === 0 ? (
          <div className="empty-state compact">
            <h3>{t.directory.emptyTitle}</h3>
            <p>{t.directory.emptyBody}</p>
          </div>
        ) : null}
        {helpPoints.map((point) => {
          const internationalCountry = detectInternationalAidPoint(point);
          return (
          <article className="help-card" key={point.id || point.name}>
            <div className={`help-icon ${typeClass(point.type)}`} aria-hidden="true">
              {typeInitial(point.type)}
            </div>
            <div className="help-main">
              <h3>{point.name}</h3>
              <p>
                {redactSensitiveText(point.area)}, {redactSensitiveText(point.service)}
              </p>
              {internationalCountry ? (
                <span className="country-badge">{t.directory.outsideVenezuela}: {internationalCountry}</span>
              ) : null}
              <div className="help-meta">
                <span>{point.hours}</span>
                <span>{t.status(point.status)}</span>
                <TrustBadge compact item={point} t={t} />
                {point.source_url ? (
                  <a className="source-link" href={point.source_url} rel="noreferrer" target="_blank">
                    {t.detail.openSource}
                  </a>
                ) : null}
              </div>
              <div className="place-validation compact">
                <small>{Number(point.validationActive || 0)} {t.directory.activeShort} · {Number(point.validationReview || 0)} {t.directory.reviewShort}</small>
                <div className="place-validation-actions">
                  <button
                    className={point.userValidation === "active" ? "is-active" : ""}
                    onClick={() => onValidatePoint(point, "active")}
                    type="button"
                  >
                    {t.directory.stillActive}
                  </button>
                  <button
                    className={point.userValidation === "review" ? "is-warning" : ""}
                    onClick={() => onValidatePoint(point, "review")}
                    type="button"
                  >
                    {t.directory.needsReview}
                  </button>
                </div>
              </div>
            </div>
          </article>
          );
        })}
      </div>
      <button className="see-all" onClick={() => onNavigate("directorio")} type="button">
        {t.directory.seeAll} <span>({helpPoints.length})</span>
      </button>
    </aside>
  );
}
