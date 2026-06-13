/**
 * Fill missing dates in a daily series (last N days inclusive).
 * @param {{ date: string, count: number }[]} series
 * @param {number} days
 */
export function fillDailySeries(series, days = 30) {
  const map = new Map(series.map((p) => [p.date, p.count]));
  const result = [];
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}

export const CHART_COLORS = [
  "#2563EB",
  "#0F172A",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#64748B",
];
