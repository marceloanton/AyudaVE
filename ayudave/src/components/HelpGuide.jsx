import { Icon } from "./Icon";
import { FieldMode } from "./FieldMode";
import { CommunityRegister } from "./CommunityRegister";
import { SourceTrustPanel } from "./SourceTrustPanel";
import { emergencyContacts, internationalAidCountries, needTypes, referenceSources } from "../data/catalog";
import { typeClass } from "../lib/report-utils";

export function HelpGuide({ helpPoints, onNavigate, onStartReport, reports, syncStatus, t }) {
  return (
    <section className="help-guide-view" aria-labelledby="ayuda-title">
      <div className="help-hero">
        <p>{t.helpGuide.eyebrow}</p>
        <h1 id="ayuda-title">{t.helpGuide.title}</h1>
        <span>{t.helpGuide.intro}</span>
        <button onClick={() => onStartReport("Agua")} type="button">
          <Icon name="edit" />
          {t.helpGuide.cta}
        </button>
      </div>

      <FieldMode helpPoints={helpPoints} onNavigate={onNavigate} onStartReport={onStartReport} reports={reports} t={t} />

      <div className="guide-grid">
        <article className="guide-card guide-card-actions">
          <h2>{t.reportForm.type}</h2>
          <div className="quick-report-grid">
            {needTypes.map((need) => (
              <button className={typeClass(need)} key={need} onClick={() => onStartReport(need)} type="button">
                <i />
                <span>{t.type(need)}</span>
              </button>
            ))}
          </div>
        </article>

        <CommunityRegister t={t} />

        <SourceTrustPanel syncStatus={syncStatus} t={t} />

        <article className="guide-card guide-card-wide">
          <h2>{t.helpGuide.stepsTitle}</h2>
          <ol className="guide-steps">
            {t.helpGuide.steps.map(([title, body]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="guide-card">
          <h2>{t.helpGuide.privacyTitle}</h2>
          <ul>
            {t.helpGuide.privacy.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="guide-card">
          <h2>{t.helpGuide.validationTitle}</h2>
          <dl className="status-guide-list">
            {t.helpGuide.validation.map(([status, body]) => (
              <div key={status}>
                <dt>
                  <span className={`status-badge ${status.replace(" ", "-")}`}>{t.status(status)}</span>
                </dt>
                <dd>{body}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="guide-card guide-card-wide emergency-card">
          <h2>{t.helpGuide.emergencyTitle}</h2>
          <p>{t.helpGuide.emergencyBody}</p>
          <div className="emergency-grid">
            {emergencyContacts.map((contact) => (
              <a href={`tel:${contact.phone.replace(/[^0-9]/g, "")}`} key={contact.name}>
                <strong>{contact.phone}</strong>
                <span>{contact.name}</span>
                <small>{contact.note}</small>
              </a>
            ))}
          </div>
        </article>

        <article className="guide-card international-card">
          <h2>{t.helpGuide.internationalTitle}</h2>
          <p>{t.helpGuide.internationalBody}</p>
          <div className="country-list">
            {internationalAidCountries.map((country) => (
              <span key={country}>{country}</span>
            ))}
          </div>
        </article>

        <article className="guide-card guide-card-wide reference-sources-card">
          <h2>{t.helpGuide.referenceSourcesTitle}</h2>
          <p>{t.helpGuide.referenceSourcesBody}</p>
          <div className="reference-source-list">
            {referenceSources.map((source) => (
              <a href={source.url} key={source.name} rel="noreferrer" target="_blank">
                <strong>{source.name}</strong>
                <span>{source.scope}</span>
                <small>{source.use}</small>
                <em>{source.sync}</em>
              </a>
            ))}
          </div>
        </article>

        <article className="guide-card guide-card-note">
          <Icon name="cloud" />
          <div>
            <h2>{t.helpGuide.offlineTitle}</h2>
            <p>{t.helpGuide.offlineBody}</p>
          </div>
        </article>
      </div>
    </section>
  );
}
