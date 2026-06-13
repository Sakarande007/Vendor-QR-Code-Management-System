import { query } from "../config/db.js";

/**
 * Ends all refresh-token sessions for the given user IDs (forces re-login).
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number[]} userIds
 */
export async function invalidateSessionsForUsers(conn, userIds) {
  if (!userIds.length) {
    return;
  }

  const placeholders = userIds.map(() => "?").join(", ");
  await conn.execute(
    `DELETE FROM refresh_tokens WHERE user_id IN (${placeholders})`,
    userIds
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} vendorCode
 * @returns {Promise<number[]>}
 */
export async function getUserIdsByVendorCode(conn, vendorCode) {
  const [rows] = await conn.execute(
    `SELECT user_id FROM users WHERE vendor_code = ?`,
    [vendorCode]
  );
  return rows.map((r) => r.user_id);
}

/**
 * @param {number} userId
 */
export async function invalidateSessionsForUser(userId) {
  await query(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
}
