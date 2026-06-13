import { getConnection } from "../config/db.js";
import { query } from "../config/db.js";
import { registerVendorUser, sanitizeUser } from "./authService.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditHelper.js";
import {
  buildCursorPage,
  keysetWhereClauseByKey,
  parsePaginationQuery,
  sqlInlineLimit,
} from "../utils/pagination.js";
import { isAdmin } from "../utils/accessControl.js";
import { formatVendor } from "./vendorService.js";

/**
 * @param {object} filters
 */
function buildUserFilters(filters) {
  const clauses = [];
  const params = [];

  if (filters.status) {
    clauses.push("u.status = ?");
    params.push(filters.status);
  }

  if (filters.role) {
    clauses.push("u.role = ?");
    params.push(filters.role);
  }

  if (filters.vendorCode) {
    clauses.push("u.vendor_code = ?");
    params.push(filters.vendorCode);
  }

  if (filters.search) {
    clauses.push("(u.email LIKE ? OR u.vendor_code LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  return { clauses, params };
}

/**
 * @param {string[]} clauses
 * @returns {string}
 */
function buildWhereSql(clauses) {
  if (!clauses.length) {
    return "";
  }
  return `WHERE ${clauses.join(" AND ")}`;
}

/**
 * @param {number} userId
 */
export async function getUserById(userId) {
  const [rows] = await query(
    `SELECT user_id, vendor_code, email, role, status, last_login, created_at, updated_at
     FROM users WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  if (!rows.length) {
    throw ApiError.notFound("User not found");
  }

  return rows[0];
}

/**
 * @param {import('express').Request} reqUser
 */
export async function getProfile(reqUser) {
  const row = await getUserById(reqUser.userId);
  const profile = sanitizeUser(row);

  if (row.vendor_code) {
    const [vendors] = await query(
      `SELECT vendor_code, vendor_name, address, gst_no, contact_person, email, phone, status, created_at, updated_at
       FROM vendors WHERE vendor_code = ? LIMIT 1`,
      [row.vendor_code]
    );

    if (vendors.length) {
      profile.vendor = formatVendor(vendors[0]);
    }
  }

  return profile;
}

/**
 * @param {import('express').Request} req
 * @param {object} updates
 */
export async function updateMyProfile(req, updates) {
  const user = req.user;
  const row = await getUserById(user.userId);
  const audit = {
    actorUserId: user.userId,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    if (updates.email) {
      const [dupRows] = await conn.execute(
        `SELECT user_id FROM users WHERE LOWER(email) = ? AND user_id != ? LIMIT 1`,
        [updates.email.toLowerCase(), user.userId]
      );
      if (dupRows.length > 0) {
        throw ApiError.badRequest("Email is already in use");
      }

      await conn.execute(`UPDATE users SET email = ? WHERE user_id = ?`, [
        updates.email.toLowerCase(),
        user.userId,
      ]);
    }

    if (row.vendor_code && (updates.contactPerson !== undefined || updates.phone !== undefined)) {
      const vendorSets = [];
      const vendorParams = [];

      if (updates.contactPerson !== undefined) {
        vendorSets.push("contact_person = ?");
        vendorParams.push(updates.contactPerson);
      }
      if (updates.phone !== undefined) {
        vendorSets.push("phone = ?");
        vendorParams.push(updates.phone);
      }

      if (vendorSets.length) {
        await conn.execute(
          `UPDATE vendors SET ${vendorSets.join(", ")} WHERE vendor_code = ?`,
          [...vendorParams, row.vendor_code]
        );
      }
    } else if (!isAdmin(user) && (updates.contactPerson !== undefined || updates.phone !== undefined)) {
      throw ApiError.badRequest("Contact fields apply only to vendor accounts");
    }

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "USER_PROFILE_UPDATE",
      entityType: "user",
      entityId: String(user.userId),
      oldValues: sanitizeUser(row),
      newValues: updates,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    return getProfile(user);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @param {object} queryParams
 */
export async function listUsers(queryParams) {
  const { limit, cursor } = parsePaginationQuery({
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor,
  });

  const filters = buildUserFilters({
    status: queryParams.status,
    role: queryParams.role,
    vendorCode: queryParams.vendorCode,
    search: queryParams.search,
  });

  const keyset = keysetWhereClauseByKey(cursor, "user_id", "u");
  const allClauses = [...filters.clauses];
  if (keyset.clause) {
    allClauses.push(keyset.clause.replace(/^AND\s+/, ""));
  }
  const whereSql = buildWhereSql(allClauses);

  const countSql = `SELECT COUNT(*) AS total FROM users u ${whereSql}`;
  const [countRows] = await query(countSql, [...filters.params, ...keyset.params]);
  const totalCount = Number(countRows[0]?.total ?? 0);

  const listSql = `
    SELECT u.user_id, u.vendor_code, u.email, u.role, u.status, u.last_login, u.created_at, u.updated_at
    FROM users u
    ${whereSql}
    ORDER BY u.created_at DESC, u.user_id DESC
    LIMIT ${sqlInlineLimit(limit, true)}`;

  const [rows] = await query(listSql, [...filters.params, ...keyset.params]);

  const page = buildCursorPage(rows, limit, (row) => ({
    id: row.user_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));

  return {
    users: page.data.map(sanitizeUser),
    totalCount,
    pagination: page.pagination,
  };
}

/**
 * @param {object} data
 * @param {object} audit
 */
export async function createUser(data, audit) {
  if (data.role !== "vendor") {
    throw ApiError.badRequest("Only vendor users can be created through this endpoint");
  }

  const user = await registerVendorUser({
    email: data.email,
    vendorCode: data.vendorCode,
    password: data.password,
  });

  await writeAuditLog(null, {
    actorUserId: audit.actorUserId,
    action: "USER_CREATE",
    entityType: "user",
    entityId: String(user.userId),
    oldValues: null,
    newValues: { email: user.email, vendorCode: user.vendorCode, role: user.role },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  });

  return user;
}

/**
 * @param {number} userId
 * @param {object} updates
 * @param {object} audit
 */
export async function updateUser(userId, updates, audit) {
  const row = await getUserById(userId);
  const oldSnapshot = sanitizeUser(row);

  const setClauses = [];
  const params = [];

  if (updates.role !== undefined) {
    if (updates.role === "vendor" && !row.vendor_code) {
      throw ApiError.badRequest("Vendor role requires a vendor_code on the account");
    }
    if (updates.role !== "vendor" && row.vendor_code) {
      throw ApiError.badRequest(
        "Remove vendor association before changing to an administrative role"
      );
    }
    setClauses.push("role = ?");
    params.push(updates.role);
  }

  if (updates.status !== undefined) {
    setClauses.push("status = ?");
    params.push(updates.status);
  }

  if (!setClauses.length) {
    throw ApiError.badRequest("No valid fields to update");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE users SET ${setClauses.join(", ")} WHERE user_id = ?`,
      [...params, userId]
    );

    if (updates.status === "inactive") {
      await conn.execute(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
    }

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "USER_UPDATE",
      entityType: "user",
      entityId: String(userId),
      oldValues: oldSnapshot,
      newValues: updates,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    return sanitizeUser(await getUserById(userId));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Soft-delete user (status = inactive) and invalidate sessions.
 * @param {number} userId
 * @param {object} audit
 */
export async function deleteUser(userId, audit) {
  const row = await getUserById(userId);
  const oldSnapshot = sanitizeUser(row);

  if (row.status === "inactive") {
    return oldSnapshot;
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(`UPDATE users SET status = 'inactive' WHERE user_id = ?`, [userId]);
    await conn.execute(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "USER_SOFT_DELETE",
      entityType: "user",
      entityId: String(userId),
      oldValues: oldSnapshot,
      newValues: { status: "inactive" },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    return sanitizeUser(await getUserById(userId));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
