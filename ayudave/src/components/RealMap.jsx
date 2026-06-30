import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
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

function clusterResolution(zoom) {
  if (zoom >= 10) return 0;
  if (zoom >= 8) return 0.18;
  if (zoom >= 7) return 0.28;
  return 0.42;
}

function clusterPoints(points, zoom) {
  const resolution = clusterResolution(zoom);
  if (!resolution) return { clusters: [], singles: points };

  const groups = new Map();
  points.forEach((point) => {
    const [lat, lng] = point.position;
    const key = `${Math.round(lat / resolution)}:${Math.round(lng / resolution)}`;
    const group = groups.get(key) || [];
    group.push(point);
    groups.set(key, group);
  });

  const clusters = [];
  const singles = [];
  groups.forEach((group, key) => {
    if (group.length < 4) {
      singles.push(...group);
      return;
    }

    const totals = group.reduce(
      (acc, point) => {
        acc.lat += point.position[0];
        acc.lng += point.position[1];
        if (point.kind === "report") acc.reports += 1;
        if (point.kind === "help") acc.help += 1;
        if (point.item.priority === "Alta") acc.urgent += 1;
        if (point.item.status === "Sin validar") acc.pending += 1;
        return acc;
      },
      { help: 0, lat: 0, lng: 0, pending: 0, reports: 0, urgent: 0 },
    );
    clusters.push({
      count: group.length,
      help: totals.help,
      id: `cluster-${key}`,
      pending: totals.pending,
      position: [totals.lat / group.length, totals.lng / group.length],
      reports: totals.reports,
      urgent: totals.urgent,
    });
  });

  return { clusters, singles };
}

function MapZoomTracker({ onZoomChange }) {
  const map = useMapEvents({
    moveend: () => onZoomChange(map.getZoom()),
    zoomend: () => onZoomChange(map.getZoom()),
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
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

function ClusterMarker({ cluster, t }) {
  const map = useMap();
  const hasUrgent = cluster.urgent > 0;

  return (
    <CircleMarker
      center={cluster.position}
      className="leaflet-cluster"
      eventHandlers={{ click: () => map.setView(cluster.position, Math.min(map.getZoom() + 2, 11), { animate: true }) }}
      fillColor={hasUrgent ? "#ef4f49" : "#006f85"}
      fillOpacity={0.82}
      key={cluster.id}
      pathOptions={{ color: "#ffffff", weight: 3 }}
      radius={Math.min(24, 10 + Math.sqrt(cluster.count) * 2.8)}
    >
      <Popup autoPanPaddingBottomRight={[40, 40]} autoPanPaddingTopLeft={[40, 150]} maxWidth={260} minWidth={210}>
        <strong>{cluster.count} {t.map.clusterItems}</strong>
        <span>{cluster.reports} {t.map.reports.toLowerCase()} · {cluster.help} {t.map.helpPoints.toLowerCase()}</span>
        {cluster.urgent ? <small>{cluster.urgent} {t.map.clusterUrgent}</small> : null}
        {cluster.pending ? <small>{cluster.pending} {t.map.clusterPending}</small> : null}
        <button onClick={() => map.setView(cluster.position, Math.min(map.getZoom() + 2, 11), { animate: true })} type="button">
          {t.map.clusterZoom}
        </button>
      </Popup>
      <Tooltip className="cluster-count" direction="center" opacity={1} permanent>
        {cluster.count}
      </Tooltip>
    </CircleMarker>
  );
}

export function RealMap({ helpPoints, onSelectReport, reports, selectedReport, showHelpPoints, showReports, t }) {
  const [mapZoom, setMapZoom] = useState(6);
  const reportPoints = useMemo(
    () => reports
      .map((report) => ({ item: report, kind: "report", position: toPoint(report) }))
      .filter((point) => point.position)
      .slice(0, 180),
    [reports],
  );
  const helpMapPoints = useMemo(
    () => helpPoints
      .map((point) => ({ item: point, kind: "help", position: toPoint(point) }))
      .filter((point) => point.position)
      .slice(0, 320),
    [helpPoints],
  );
  const visiblePoints = useMemo(
    () => [...(showReports ? reportPoints : []), ...(showHelpPoints ? helpMapPoints : [])],
    [helpMapPoints, reportPoints, showHelpPoints, showReports],
  );
  const { clusters, singles } = useMemo(() => clusterPoints(visiblePoints, mapZoom), [mapZoom, visiblePoints]);
  const visibleHelpSingles = singles.filter((point) => point.kind === "help");
  const visibleReportSingles = singles.filter((point) => point.kind === "report");

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
      <MapZoomTracker onZoomChange={setMapZoom} />
      <FitMap disabled={Boolean(selectedReport)} points={visiblePoints} />
      <FocusSelectedReport report={selectedReport} />
      {clusters.map((cluster) => <ClusterMarker cluster={cluster} key={cluster.id} t={t} />)}
      {showHelpPoints
        ? visibleHelpSingles.map(({ item, position }) => (
            <CircleMarker
              center={position}
              className={`leaflet-help ${typeClass(item.type)}`}
              fillColor={typeColors[item.type] || "#006f85"}
              fillOpacity={isConfirmed(item) ? 0.72 : 0.46}
              key={`help-${item.external_id || item.name}-${position.join(",")}`}
              pathOptions={{ color: isConfirmed(item) ? "#2ca365" : "#f59e0b", weight: 1.5 }}
              radius={isConfirmed(item) ? 7 : 6}
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
        ? visibleReportSingles.map(({ item, position }) => (
            <CircleMarker
              center={position}
              className={`leaflet-report ${typeClass(item.type)}`}
              eventHandlers={{ click: () => onSelectReport(item) }}
              fillColor={typeColors[item.type] || "#006f85"}
              fillOpacity={item.priority === "Alta" ? 0.9 : 0.68}
              key={`report-${item.id}`}
              pathOptions={{
                color: markerStroke(item, selectedReport?.id === item.id),
                weight: markerWeight(item, selectedReport?.id === item.id),
              }}
              radius={selectedReport?.id === item.id ? 12 : item.priority === "Alta" ? 9 : 7}
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
