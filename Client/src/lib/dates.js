/**
 * @param {Date|string|null|undefined} value
 * @returns {string} YYYY-MM-DD for date input fields
 */
export function toInputDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** @returns {string} */
export function todayInputDate() {
  return toInputDate(new Date());
}
