export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value) {
  if (!value) return "";
  const d = new Date(value).getTime();
  const diff = d - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const unit = mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat().format(n || 0);
}
