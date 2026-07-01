import { useMemo, useState } from "react";
import { needTypes } from "../data/catalog";
import { Icon } from "./Icon";
import { RealMap } from "./RealMap";

function hasMapCoordinate(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -10 && lat <= 16 && lng >= -82 && lng <= -52;
}

function isConfirmed(item) {
  return item.status === "Confirmado" || item.status === "Abierto";
}

function matchesValidationFilter(item, validationFilter) {
  if (validationFilter === "confirmed") return isConfirmed(item);
  if (validationFilter === "pending") return item.status === "Sin validar";
  return true;
}

const maxMapReports = 180;
const maxMapHelpPoints = 320;
const affectedZoneSourceUrl = "https://www.usgs.gov/programs/landslide-hazards/science/2026-venezuela-sequence-earthquake-triggered-landslide-hazards";

export function MapPanel({ currentType, helpPoints, onSelectReport, reports, query, selectedReport, setCurrentType, setQuery, t }) {
  const [showReports, setShowReports] = useState(true);
  const [showHelpPoints, setShowHelpPoints] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [showAffectedZone, setShowAffectedZone] = useState(true);
  const [validationFilter, setValidationFilter] = useState("all");
  const filteredReports = useMemo(
    () => reports.filter((report) => matchesValidationFilter(report, validationFilter)),
    [reports, validationFilter],
  );
  const filteredHelpPoints = useMemo(
    () => helpPoints.filter((point) => matchesValidationFilter(point, validationFilter)),
    [helpPoints, validationFilter],
  );
  const visibleReportPoints = useMemo(
    () => (showReports ? filteredReports.filter(hasMapCoordinate) : []),
    [filteredReports, showReports],
  );
  const visibleHelpPoints = useMemo(
    () => (showHelpPoints ? filteredHelpPoints.filter(hasMapCoordinate) : []),
    [filteredHelpPoints, showHelpPoints],
  );
  const mapCounts = useMemo(
    () => {
      const visibleMapItems = [...visibleReportPoints, ...visibleHelpPoints];
      return {
        reports: visibleReportPoints.length,
        help: visibleHelpPoints.length,
        shownReports: Math.min(visibleReportPoints.length, maxMapReports),
        shownHelp: Math.min(visibleHelpPoints.length, maxMapHelpPoints),
        confirmed: visibleMapItems.filter(isConfirmed).length,
        pending: visibleMapItems.filter((item) => item.status === "Sin validar").length,
      };
    },
    [visibleHelpPoints, visibleReportPoints],
  );

  return (
    <div className="map-panel">
      <div className="map-search">
        <Icon name="search" />
        <input
          aria-label={t.map.search}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.map.search}
          type="search"
          value={query}
        />
      </div>
      <div className="map-actions">
        <button
          aria-label={t.map.reports}
          aria-pressed={showReports}
          className={showReports ? "is-active" : ""}
          onClick={() => setShowReports((value) => !value)}
          title={t.map.reports}
          type="button"
        >
          <Icon name="sliders" />
          {t.map.reports}
        </button>
        <button
          aria-label={t.map.helpPoints}
          aria-pressed={showHelpPoints}
          className={showHelpPoints ? "is-active" : ""}
          onClick={() => setShowHelpPoints((value) => !value)}
          title={t.map.helpPoints}
          type="button"
        >
          <Icon name="layers" />
          {t.map.helpPoints}
        </button>
      </div>
      <div className="map-type-filter" role="group" aria-label={t.map.filterByType}>
        {["Todos", ...needTypes].map((type) => (
          <button
            aria-pressed={currentType === type}
            className={currentType === type ? "is-active" : ""}
            key={type}
            onClick={() => setCurrentType(type)}
            type="button"
          >
            {type === "Energia/senal" ? t.type(type).split(" / ")[0] : t.type(type)}
          </button>
        ))}
      </div>
      <div className="map-validation-filter" role="group" aria-label={t.map.filterByValidation}>
        {[
          ["all", t.map.validationAll],
          ["confirmed", t.map.validationConfirmed],
          ["pending", t.map.validationPending],
        ].map(([value, label]) => (
          <button
            aria-pressed={validationFilter === value}
            className={validationFilter === value ? "is-active" : ""}
            key={value}
            onClick={() => setValidationFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="map-layer-filter" role="group" aria-label={t.map.filterByLayer}>
        <button
          aria-pressed={showHeat}
          className={showHeat ? "is-active heat-toggle" : "heat-toggle"}
          onClick={() => setShowHeat((value) => !value)}
          type="button"
        >
          {t.map.heatLayer}
        </button>
        <button
          aria-pressed={showAffectedZone}
          className={showAffectedZone ? "is-active affected-toggle" : "affected-toggle"}
          onClick={() => setShowAffectedZone((value) => !value)}
          title={t.map.affectedZoneNote}
          type="button"
        >
          {t.map.affectedZone}
        </button>
      </div>
      <div className="map-canvas" aria-label={t.map.canvas}>
        <RealMap
          helpPoints={filteredHelpPoints}
          onSelectReport={onSelectReport}
          reports={filteredReports}
          selectedReport={selectedReport}
          showAffectedZone={showAffectedZone}
          showHeat={showHeat}
          showHelpPoints={showHelpPoints}
          showReports={showReports}
          t={t}
        />
        <div className="map-legend" aria-label={t.map.summary}>
          <strong>{mapCounts.reports}</strong>
          <span>{t.map.reportsWithLocation}</span>
          <strong>{mapCounts.help}</strong>
          <span>{t.map.helpPointsLabel}</span>
          {(mapCounts.shownReports < mapCounts.reports || mapCounts.shownHelp < mapCounts.help) ? (
            <em className="legend-visible">
              {t.map.visibleLimit
                .replace("{shown}", String(mapCounts.shownReports + mapCounts.shownHelp))
                .replace("{total}", String(mapCounts.reports + mapCounts.help))}
            </em>
          ) : null}
          <em className="legend-confirmed">{mapCounts.confirmed} {t.map.confirmedShort}</em>
          <em className="legend-pending">{mapCounts.pending} {t.map.pendingShort}</em>
          {showHeat ? <em className="legend-heat">{t.map.heatLayer}</em> : null}
          {showAffectedZone ? <em className="legend-affected">{t.map.affectedZone}</em> : null}
          {showAffectedZone ? (
            <a className="legend-source" href={affectedZoneSourceUrl} rel="noreferrer" target="_blank">
              {t.map.affectedSource}: USGS
            </a>
          ) : null}
          {showAffectedZone ? <small className="legend-note">{t.map.affectedZoneNote}</small> : null}
        </div>
      </div>
    </div>
  );
}
