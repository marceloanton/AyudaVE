import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
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

function clusterPixelRadius(zoom) {
  if (zoom >= 10) return 0;
  if (zoom >= 9) return 50;
  if (zoom >= 8) return 62;
  if (zoom >= 7) return 76;
  return 94;
}

function clusterPoints(points, map, zoom) {
  const radius = clusterPixelRadius(zoom);
  if (!radius) return { clusters: [], singles: points };
  const minClusterSize = zoom < 8 ? 2 : 3;
  const groups = [];
  points.forEach((point) => {
    const projected = map.project(L.latLng(point.position), zoom);
    let bestGroup = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    groups.forEach((group) => {
      const distance = projected.distanceTo(group.projected);
      if (distance <= radius && distance < bestDistance) {
        bestDistance = distance;
        bestGroup = group;
      }
    });

    if (!bestGroup) {
      groups.push({
        projected,
        points: [point],
        x: projected.x,
        y: projected.y,
      });
      return;
    }

    bestGroup.points.push(point);
    bestGroup.x += projected.x;
    bestGroup.y += projected.y;
    bestGroup.projected = L.point(bestGroup.x / bestGroup.points.length, bestGroup.y / bestGroup.points.length);
  });

  const clusters = [];
  const singles = [];
  groups.forEach((group, index) => {
    if (group.points.length < minClusterSize) {
      singles.push(...group.points);
      return;
    }

    const totals = group.points.reduce(
      (acc, point) => {
        if (point.kind === "report") acc.reports += 1;
        if (point.kind === "help") acc.help += 1;
        if (point.item.priority === "Alta") acc.urgent += 1;
        if (point.item.status === "Sin validar") acc.pending += 1;
        return acc;
      },
      { help: 0, pending: 0, reports: 0, urgent: 0 },
    );
    const position = map.unproject(group.projected, zoom);
    clusters.push({
      count: group.points.length,
      help: totals.help,
      id: `cluster-${zoom}-${index}-${group.points.length}`,
      pending: totals.pending,
      position: [position.lat, position.lng],
      reports: totals.reports,
      urgent: totals.urgent,
    });
  });

  return { clusters, singles };
}

function FitMap({ disabled, points }) {
  const map = useMap();

  useEffect(() => {
    const isMobile = window.innerWidth <= 820;
    const fitOptions = {
      animate: false,
      maxZoom: 10,
      paddingBottomRight: [28, 28],
      paddingTopLeft: [28, isMobile ? 300 : 28],
    };

    if (disabled) return;
    if (points.length === 0) {
      map.fitBounds(defaultBounds, fitOptions);
      return;
    }

    const bounds = points.map((point) => point.position);
    map.fitBounds(bounds, fitOptions);
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
  const displayCount = cluster.count > 99 ? "99+" : String(cluster.count);
  const size = Math.min(54, Math.max(38, 34 + Math.sqrt(cluster.count) * 1.8));
  const label = `${cluster.count} ${t.map.clusterItems}`;
  const icon = useMemo(
    () => L.divIcon({
      className: "cluster-icon-shell",
      html: `<div class="cluster-marker ${hasUrgent ? "is-urgent" : ""}" style="--cluster-size:${size}px"><strong>${displayCount}</strong></div>`,
      iconAnchor: [size / 2, size / 2],
      iconSize: [size, size],
      popupAnchor: [0, -size / 2],
    }),
    [displayCount, hasUrgent, size],
  );

  return (
    <Marker
      alt={label}
      eventHandlers={{ click: () => map.setView(cluster.position, Math.min(map.getZoom() + 2, 11), { animate: true }) }}
      icon={icon}
      key={cluster.id}
      position={cluster.position}
      title={label}
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
    </Marker>
  );
}

function ClusteredPointLayer({ onSelectReport, selectedReport, t, visiblePoints }) {
  const map = useMapEvents({
    moveend: () => setViewState({ bounds: map.getBounds().toBBoxString(), zoom: map.getZoom() }),
    zoomend: () => setViewState({ bounds: map.getBounds().toBBoxString(), zoom: map.getZoom() }),
  });
  const [viewState, setViewState] = useState(() => ({ bounds: "initial", zoom: map.getZoom() }));

  const { clusters, singles } = useMemo(
    () => clusterPoints(visiblePoints, map, viewState.zoom),
    [map, viewState, visiblePoints],
  );
  const visibleHelpSingles = singles.filter((point) => point.kind === "help");
  const visibleReportSingles = singles.filter((point) => point.kind === "report");

  return (
    <>
      {clusters.map((cluster) => <ClusterMarker cluster={cluster} key={cluster.id} t={t} />)}
      {visibleHelpSingles.map(({ item, position }) => (
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
      ))}
      {visibleReportSingles.map(({ item, position }) => (
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
      ))}
    </>
  );
}

export function RealMap({ helpPoints, onSelectReport, reports, selectedReport, showHelpPoints, showReports, t }) {
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
      <ClusteredPointLayer
        onSelectReport={onSelectReport}
        selectedReport={selectedReport}
        t={t}
        visiblePoints={visiblePoints}
      />
    </MapContainer>
  );
}
