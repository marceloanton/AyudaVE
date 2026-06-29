import { useMemo, useState } from "react";
import { needTypes } from "../data/catalog";
import { redactSensitiveText, typeClass } from "../lib/report-utils";
import { Icon } from "./Icon";

function completedCount(items) {
  return items.filter((item) => item.done).length;
}

export function ReportPanel({ initialType = "Agua", onClose, onCreateReport, pendingCount, serverSyncAvailable, t }) {
  const [type, setType] = useState(initialType);
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [priority, setPriority] = useState("Alta");
  const [detail, setDetail] = useState("");
  const [people, setPeople] = useState("");
  const [website, setWebsite] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const privacyWarning = useMemo(
    () => [area, city, detail].some((value) => value.trim() && redactSensitiveText(value) !== value),
    [area, city, detail],
  );
  const qualityChecks = useMemo(
    () => [
      { id: "location", done: area.trim().length >= 4, label: t.reportForm.qualityLocation },
      { id: "city", done: city.trim().length >= 3, label: t.reportForm.qualityCity },
      { id: "detail", done: detail.trim().length >= 24, label: t.reportForm.qualityDetail },
      { id: "people", done: Number(people) > 0, label: t.reportForm.qualityPeople },
      { id: "privacy", done: !privacyWarning, label: t.reportForm.qualityPrivacy },
      { id: "map", done: Boolean(coordinates), label: t.reportForm.qualityMap },
    ],
    [area, city, coordinates, detail, people, privacyWarning, t],
  );
  const qualityScore = completedCount(qualityChecks);
  const qualityTone = privacyWarning ? "warning" : qualityScore >= 4 ? "good" : "needs-work";

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocationStatus(t.reportForm.geoUnavailable);
      return;
    }
    setLocationStatus(t.reportForm.geoLoading);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(7));
        const lng = Number(position.coords.longitude.toFixed(7));
        setCoordinates({ lat, lng });
        setLocationStatus(t.reportForm.geoSaved);
      },
      () => {
        setLocationStatus(t.reportForm.geoDenied);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFeedback("");
    try {
      await onCreateReport({
        type,
        area,
        city,
        priority,
        detail,
        contact: people ? `${people} personas` : "Sin validar",
        lat: coordinates?.lat ?? null,
        lng: coordinates?.lng ?? null,
        website,
      });
      setArea("");
      setCity("");
      setDetail("");
      setPeople("");
      setWebsite("");
      setCoordinates(null);
      setPriority("Alta");
      setFeedback(t.reportForm.saved);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside className="report-panel" aria-labelledby="reportar-title">
      <div className="panel-head">
        <div>
          <h1 id="reportar-title">{t.reportForm.title}</h1>
          <p>{t.reportForm.subtitle}</p>
        </div>
        <button className="close-button" onClick={onClose} type="button" aria-label={t.reportForm.close}>
          {t.reportForm.close}
        </button>
      </div>

      <form className="report-form" onSubmit={handleSubmit}>
        <label className="bot-field" aria-hidden="true">
          Website
          <input
            autoComplete="off"
            name="website"
            onChange={(event) => setWebsite(event.target.value)}
            tabIndex="-1"
            value={website}
          />
        </label>
        <div className="type-grid" role="group" aria-label={t.reportForm.type}>
          {needTypes.map((need) => (
            <label className={`need-option ${typeClass(need)}`} key={need}>
              <input checked={type === need} name="type" onChange={() => setType(need)} type="radio" value={need} />
              <span>
                <i />
                {t.type(need)}
              </span>
            </label>
          ))}
        </div>

        <div className="form-section">
          <h2>{t.reportForm.details}</h2>
          <label className="field with-icon">
            <Icon name="pin" />
            <small>{t.reportForm.location}</small>
            <input
              name="area"
              onChange={(event) => setArea(event.target.value)}
              placeholder={t.reportForm.locationPlaceholder}
              required
              value={area}
            />
          </label>
          <label className="field with-icon">
            <Icon name="map" />
            <small>{t.reportForm.city}</small>
            <input
              name="city"
              onChange={(event) => setCity(event.target.value)}
              placeholder={t.reportForm.cityPlaceholder}
              value={city}
            />
          </label>
          <div className="geo-row">
            <button onClick={captureLocation} type="button">
              <Icon name="pin" />
              {coordinates ? t.reportForm.geoUpdate : t.reportForm.geoUse}
            </button>
            <small>{locationStatus || t.reportForm.geoHint}</small>
          </div>
          <label className="field text-field">
            <small>{t.reportForm.need}</small>
            <textarea
              maxLength={520}
              name="detail"
              onChange={(event) => setDetail(event.target.value)}
              placeholder={t.reportForm.detailPlaceholder}
              required
              rows="5"
              value={detail}
            />
            <em>{detail.length}/520</em>
          </label>
          <div className="split-fields">
            <label className="field compact">
              <small>{t.reportForm.people}</small>
              <input min="1" name="people" onChange={(event) => setPeople(event.target.value)} type="number" value={people} />
            </label>
            <label className="field compact">
              <small>{t.reportForm.urgency}</small>
              <select name="priority" onChange={(event) => setPriority(event.target.value)} value={priority}>
                <option value="Alta">{t.priority("Alta")}</option>
                <option value="Media">{t.priority("Media")}</option>
                <option value="Baja">{t.priority("Baja")}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="attach-row attach-guidance" aria-label={t.reportForm.attachments}>
          <p>
            <strong>{t.reportForm.attachments}</strong> <span>{t.reportForm.optional}</span>
          </p>
          <small>{t.reportForm.lowConnection}</small>
        </div>

        <section className="report-guidance" aria-label={t.reportForm.guidanceTitle}>
          <strong>{t.reportForm.guidanceTitle}</strong>
          <p>{t.reportForm.guidance}</p>
        </section>
        <section className={`quality-card ${qualityTone}`} aria-label={t.reportForm.qualityTitle}>
          <div>
            <strong>{t.reportForm.qualityTitle}</strong>
            <span>{qualityScore}/{qualityChecks.length}</span>
          </div>
          <ul>
            {qualityChecks.map((item) => (
              <li className={item.done ? "is-done" : ""} key={item.id}>
                <span aria-hidden="true">{item.done ? "OK" : "!"}</span>
                {item.label}
              </li>
            ))}
          </ul>
        </section>
        {privacyWarning ? (
          <section className="privacy-warning" role="status">
            <strong>{t.reportForm.privacyWarningTitle}</strong>
            <p>{t.reportForm.privacyWarningBody}</p>
          </section>
        ) : null}

        <button className="submit-report" disabled={isSubmitting} type="submit">
          {t.reportForm.submit}
        </button>
        <p className="save-copy">{t.reportForm.saveCopy}</p>
        <p className="save-feedback" role="status">
          {feedback}
        </p>
      </form>

      <section className="sync-card">
        <h2>{t.reportForm.syncTitle}</h2>
        <div>
          <Icon name="cloud" />
          <p>
            <strong>{serverSyncAvailable ? t.sync.active : t.sync.offline}</strong>
            <small>
              {serverSyncAvailable
                ? t.reportForm.shared
                : t.reportForm.retry}
            </small>
          </p>
          <strong className="pending-count">{pendingCount}</strong>
        </div>
      </section>
    </aside>
  );
}
