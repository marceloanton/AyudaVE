export function formatSyncDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function getFreshnessClass(lastSyncedAt) {
  if (!lastSyncedAt) return "is-unknown";
  const date = new Date(lastSyncedAt);
  if (Number.isNaN(date.getTime())) return "is-unknown";
  const hours = (Date.now() - date.getTime()) / 36e5;
  if (hours <= 2) return "is-fresh";
  if (hours <= 12) return "is-watch";
  return "is-stale";
}
