export const storageKey = "ayudave-reports-v2";

const approximateLocations = [
  ["petare", 10.4764, -66.8079],
  ["la dolorita", 10.4672, -66.7863],
  ["caracas", 10.4806, -66.9036],
  ["la guaira", 10.599, -66.9346],
  ["valencia", 10.162, -68.0077],
  ["maracay", 10.2469, -67.5958],
  ["barquisimeto", 10.0678, -69.3467],
  ["maracaibo", 10.6427, -71.6125],
  ["cumana", 10.4635, -64.1775],
  ["puerto la cruz", 10.2138, -64.6328],
  ["barcelona", 10.1363, -64.6862],
  ["ciudad bolivar", 8.1292, -63.5409],
  ["maturin", 9.7457, -63.1832],
  ["san cristobal", 7.7669, -72.225],
  ["merida", 8.5897, -71.1561],
  ["punto fijo", 11.7167, -70.1833],
  ["coro", 11.4045, -69.6734],
  ["san felix", 8.3436, -62.641],
  ["puerto ordaz", 8.2989, -62.7193],
  ["porlamar", 10.957, -63.8491],
  ["guarenas", 10.4703, -66.6167],
  ["guatire", 10.474, -66.5427],
  ["los teques", 10.3445, -67.0433],
];

export function trimText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[dato privado removido]")
    .replace(/\+\d{1,3}[\s.-]*(?:\d[\s.-]*){7,14}\d/gu, "[dato privado removido]")
    .replace(/(?:\+?58[\s.-]*)?(?:0?4(?:12|14|16|24|26)|2\d{2})[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/gu, "[dato privado removido]")
    .replace(/\b(?:V|E|J|G)?[\s.-]?\d{6,9}\b/giu, "[dato privado removido]");
}

function normalizeLocationText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function inferApproximateCoordinates(...parts) {
  const haystack = normalizeLocationText(parts.join(" "));
  const match = approximateLocations.find(([name]) => haystack.includes(name));
  return match ? { lat: match[1], lng: match[2] } : { lat: null, lng: null };
}

export function parseOptionalCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function coordinatesToLegacyPosition(lat, lng) {
  const numericLat = Number(lat);
  const numericLng = Number(lng);
  if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) {
    return { x: Math.floor(18 + Math.random() * 64), y: Math.floor(20 + Math.random() * 58) };
  }
  return {
    x: Math.max(12, Math.min(88, Math.round(((numericLng + 73.5) / 14.5) * 76 + 12))),
    y: Math.max(14, Math.min(84, Math.round(((13.2 - numericLat) / 8.8) * 70 + 14))),
  };
}

export function trustKey(item) {
  if (item?.trustLevel) return item.trustLevel;
  if (item?.source && (item.status === "Confirmado" || item.status === "Abierto")) return "verified_origin";
  if (item?.source) return "external_pending";
  if (item?.status === "Confirmado" || item?.status === "Abierto") return "community_confirmed";
  if (item?.status === "Resuelto") return "resolved";
  return "community_pending";
}

export function mergeReports(...groups) {
  const merged = new Map();
  groups.flat().forEach((report) => {
    if (report?.id && !merged.has(report.id)) {
      merged.set(report.id, report);
    }
  });
  return Array.from(merged.values());
}

export function typeClass(value) {
  return String(value ?? "").replace("/", "-").replace(/\s+/g, "-");
}

export function typeInitial(value) {
  const initials = {
    Agua: "A",
    Comida: "C",
    Medicina: "+",
    Refugio: "R",
    Traslado: "T",
    "Energia/senal": "E",
  };
  return initials[value] || String(value || "?").charAt(0);
}

const internationalCountryPatterns = [
  ["Argentina", /\bargentina\b/iu],
  ["Brasil", /\bbrasil\b|\bbrazil\b/iu],
  ["Chile", /\bchile\b/iu],
  ["Colombia", /\bcolombia\b/iu],
  ["Ecuador", /\becuador\b/iu],
  ["Espana", /\bespana\b|\bespaña\b|\bspain\b/iu],
  ["Estados Unidos", /\bestados unidos\b|\busa\b|\bmiami\b|\bflorida\b|\bunited states\b/iu],
  ["Mexico", /\bmexico\b|\bméxico\b/iu],
  ["Panama", /\bpanama\b|\bpanamá\b/iu],
  ["Peru", /\bperu\b|\bperú\b/iu],
  ["Uruguay", /\buruguay\b/iu],
];

export function detectInternationalAidPoint(point) {
  const haystack = `${point?.name || ""} ${point?.area || ""} ${point?.service || ""} ${point?.source || ""}`;
  const match = internationalCountryPatterns.find(([, pattern]) => pattern.test(haystack));
  return match ? match[0] : null;
}

export function loadLocalReports() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

export function saveLocalReports(reports) {
  localStorage.setItem(storageKey, JSON.stringify(reports.slice(0, 50)));
}
