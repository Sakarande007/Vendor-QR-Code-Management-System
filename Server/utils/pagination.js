/**
 * Cursor-based pagination utilities for large datasets (avoids OFFSET degradation).
 */

/**
 * @typedef {object} CursorPayload
 * @property {string|number} id
 * @property {string} [createdAt] ISO timestamp for tie-breaking
 */

/**
 * Encodes a cursor object to a URL-safe base64 string.
 * @param {CursorPayload} payload
 * @returns {string}
 */
export function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Decodes a cursor string; returns null if invalid.
 * @param {string|null|undefined} cursor
 * @returns {CursorPayload|null}
 */
export function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed?.id === undefined || parsed?.id === null) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {number} [options.pageSize=20]
 * @param {string|null} [options.cursor]
 * @param {number} [options.maxPageSize=100]
 * @returns {{ limit: number, cursor: CursorPayload|null }}
 */
export function parsePaginationQuery({ pageSize = 20, cursor = null, maxPageSize = 100 }) {
  const limit = Math.min(Math.max(1, Number(pageSize) || 20), maxPageSize);
  return {
    limit,
    cursor: decodeCursor(cursor),
  };
}

/**
 * Safe integer for inline LIMIT/OFFSET (MariaDB/XAMPP often rejects LIMIT ? in prepared statements).
 * @param {number} n
 * @param {number} max
 * @returns {number}
 */
function assertBoundedInt(n, max) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0 || v > max) {
    throw new Error("Invalid pagination bound");
  }
  return v;
}

/**
 * @param {number} limit From parsePaginationQuery
 * @param {boolean} [plusOne=false] Use limit+1 when fetching an extra row for hasMore
 * @returns {number}
 */
export function sqlInlineLimit(limit, plusOne = false) {
  const base = assertBoundedInt(limit, 100);
  if (base < 1) {
    throw new Error("Invalid pagination limit");
  }
  return plusOne ? base + 1 : base;
}

/**
 * @param {number} offset
 * @returns {number}
 */
export function sqlInlineOffset(offset) {
  return assertBoundedInt(offset, 1_000_000);
}

/**
 * Builds pagination metadata from a result set fetched with limit+1 rows.
 * @template T
 * @param {T[]} rows
 * @param {number} limit
 * @param {(row: T) => CursorPayload} getCursorFromRow
 * @returns {{ data: T[], pagination: { pageSize: number, hasMore: boolean, nextCursor: string|null } }}
 */
export function buildCursorPage(rows, limit, getCursorFromRow) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = data[data.length - 1];

  return {
    data,
    pagination: {
      pageSize: limit,
      hasMore,
      nextCursor: hasMore && lastRow ? encodeCursor(getCursorFromRow(lastRow)) : null,
    },
  };
}

/**
 * Returns SQL WHERE fragment and params for keyset pagination on (created_at, id).
 * @param {CursorPayload|null} cursor
 * @param {string} [tableAlias]
 * @returns {{ clause: string, params: unknown[] }}
 */
export function keysetWhereClause(cursor, tableAlias = "") {
  const prefix = tableAlias ? `${tableAlias}.` : "";

  if (!cursor) {
    return { clause: "", params: [] };
  }

  if (cursor.createdAt) {
    return {
      clause: `AND (${prefix}created_at < ? OR (${prefix}created_at = ? AND ${prefix}id < ?))`,
      params: [cursor.createdAt, cursor.createdAt, cursor.id],
    };
  }

  return {
    clause: `AND ${prefix}id < ?`,
    params: [cursor.id],
  };
}

/**
 * Keyset pagination for tables with a non-numeric primary key (e.g. vendor_code).
 * @param {CursorPayload|null} cursor
 * @param {string} keyColumn
 * @param {string} [tableAlias]
 * @returns {{ clause: string, params: unknown[] }}
 */
export function keysetWhereClauseByKey(cursor, keyColumn, tableAlias = "") {
  const prefix = tableAlias ? `${tableAlias}.` : "";

  if (!cursor) {
    return { clause: "", params: [] };
  }

  if (cursor.createdAt) {
    return {
      clause: `AND (${prefix}created_at < ? OR (${prefix}created_at = ? AND ${prefix}${keyColumn} < ?))`,
      params: [cursor.createdAt, cursor.createdAt, cursor.id],
    };
  }

  return {
    clause: `AND ${prefix}${keyColumn} < ?`,
    params: [cursor.id],
  };
}
