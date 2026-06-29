import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { redactSensitiveText, trustKey, typeClass } from "../lib/report-utils";

const venezuelaCenter = [8.2, -66.6];
const defaultBounds = [
  [0.6, -73.6],
  [12.6, -59.7],
];

const typeColors = {
  Agua: "#2383b5",
  Comida: "#2ca365",
  Medicina: "#81418e",
  Refugio: "#ef6c16",
  Traslado: "#2383b5",
  "Energia/senal": "#d49a00",
};

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -10 && lat <= 16 && lng >= -82 && lng <= -52;
}

function toPoint(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  return isValidCoordinate(lat, lng) ? [lat, lng] : null;
}

function FitMap({ disabled, points }) {
  const map = useMap();

  useEffect(() => {
    if (disabled) return;
    if (points.length === 0) {
      map.fitBounds(defaultBounds, { animate: false, padding: [18, 18] });
      return;
    }

    const bounds = points.map((point) => point.position);
    map.fitBounds(bounds, { animate: false, maxZoom: 10, padding: [28, 28] });
  }, [disabled, map, points]);

  return null;
}

function FocusSelectedReport({ report }) {
  const map = useMap();

  useEffect(() => {
    const position = report ? toPoint(report) : null;
    if (position) {
      map.setView(position, Math.max(map.getZoom(), 10), { animate: true });
    }
  }, [map, report]);

  return null;
}

function markerStroke(item, selected) {
  if (selected) return "#111827";
  if (item.status === "Confirmado") return "#2ca365";
  if (item.status === "Resuelto") return "#6b7280";
  return item.priority === "Alta" ? "#ef4f49" : "#ffffff";
}

function markerWeight(item, selected) {
  if (selected) return 4;
  if (item.status === "Confirmado" || item.priority === "Alta") return 3;
  return 2;
}

function isConfirmed(item) {
  return item.status === "Confirmado" || item.status === "Abierto";
}

export function RealMap({ helpPoints, onSelectReport, reports, selectedReport, showHelpPoints, showReports, t }) {
  const reportPoints = reports
    .map((report) => ({ item: report, position: toPoint(report) }))
    .filter((point) => point.position)
    .slice(0, 180);
  const helpMapPoints = helpPoints
    .map((point) => ({ item: point, position: toPoint(point) }))
    .filter((point) => point.position)
    .slice(0, 320);
  const visiblePoints = [...(showReports ? reportPoints : []), ...(showHelpPoints ? helpMapPoints : [])];

  return (
    <MapContainer
      attributionControl
      className="real-map"
      center={venezuelaCenter}
      maxBounds={[
        [-12, -84],
        [18, -50],
      ]}
      minZoom={5}
      scrollWheelZoom
      zoom={6}
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitMap disabled={Boolean(selectedReport)} points={visiblePoints} />
      <FocusSelectedReport report={selectedReport} />
      {showHelpPoints
        ? helpMapPoints.map(({ item, position }) => (
            <CircleMarker
              center={position}
              className={`leaflet-help ${typeClass(item.type)}`}
              fillColor={typeColors[item.type] || "#006f85"}
              fillOpacity={isConfirmed(item) ? 0.78 : 0.52}
              key={`help-${item.external_id || item.name}-${position.join(",")}`}
              pathOptions={{ color: isConfirmed(item) ? "#2ca365" : "#f59e0b", weight: 2 }}
              radius={isConfirmed(item) ? 8 : 7}
            >
              <Popup autoPanPaddingBottomRight={[40, 40]} autoPanPaddingTopLeft={[40, 150]} maxWidth={260} minWidth={210}>
                <strong>{item.name}</strong>
                <span>{redactSensitiveText(item.area)}</span>
                {item.service ? <span>{redactSensitiveText(item.service)}</span> : null}
                <small>{t.status(item.status || "Sin validar")} · {t.map.helpPoint}</small>
                <em>{t.trust(trustKey(item))}</em>
                {item.source_url ? (
                  <a href={item.source_url} rel="noreferrer" target="_blank">
                    {t.detail.openSource}
                  </a>
                ) : null}
              </Popup>
            </CircleMarker>
          ))
        : null}
      {showReports
        ? reportPoints.map(({ item, position }) => (
            <CircleMarker
              center={position}
              className={`leaflet-report ${typeClass(item.type)}`}
              eventHandlers={{ click: () => onSelectReport(item) }}
              fillColor={typeColors[item.type] || "#006f85"}
              fillOpacity={item.priority === "Alta" ? 0.96 : 0.78}
              key={`report-${item.id}`}
              pathOptions={{
                color: markerStroke(item, selectedReport?.id === item.id),
                weight: markerWeight(item, selectedReport?.id === item.id),
              }}
              radius={selectedReport?.id === item.id ? 13 : item.priority === "Alta" ? 10 : 8}
            >
              <Popup autoPanPaddingBottomRight={[40, 40]} autoPanPaddingTopLeft={[40, 150]} maxWidth={260} minWidth={210}>
                <strong>{t.type(item.type)}</strong>
                <span>{redactSensitiveText(item.area)}</span>
                <small>{t.priority(item.priority)} · {t.status(item.status)}</small>
                <em>{t.trust(trustKey(item))}</em>
                {item.source_url ? (
                  <a href={item.source_url} rel="noreferrer" target="_blank">
                    {t.detail.openSource}
                  </a>
                ) : null}
                <button onClick={() => onSelectReport(item)} type="button">{t.map.viewDetail}</button>
              </Popup>
            </CircleMarker>
          ))
        : null}
    </MapContainer>
  );
}
