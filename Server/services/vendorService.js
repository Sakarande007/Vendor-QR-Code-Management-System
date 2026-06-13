import { getConnection } from "../config/db.js";
import { query } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditHelper.js";
import {
  generateUsername,
  generateVendorPassword,
} from "../utils/credentialGenerator.js";
import {
  getPasswordPolicyMessage,
  hashPassword,
  meetsPasswordPolicy,
} from "../utils/password.js";
import { queueVendorWelcomeEmail } from "./emailService.js";
import {
  buildCursorPage,
  keysetWhereClauseByKey,
  parsePaginationQuery,
  sqlInlineLimit,
} from "../utils/pagination.js";
import {
  getUserIdsByVendorCode,
  invalidateSessionsForUsers,
} from "./sessionService.js";

/**
 * @param {object} row
 * @returns {object}
 */
export function formatVendor(row) {
  return {
    vendorCode: row.vendor_code,
    vendorCodeSap: row.vendor_code_sap ?? row.vendor_code,
    vendorName: row.vendor_name,
    address: row.address,
    gstNo: row.gst_no,
    contactPerson: row.contact_person,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userCount: row.user_count !== undefined ? Number(row.user_count) : undefined,
  };
}

/**
 * @param {object} filters
 * @param {string} [filters.status]
 * @param {string} [filters.search]
 * @returns {{ where: string, params: unknown[] }}
 */
function buildVendorFilters(filters) {
  const clauses = [];
  const params = [];

  if (filters.status) {
    clauses.push("v.status = ?");
    params.push(filters.status);
  }

  if (filters.search) {
    clauses.push("(v.vendor_name LIKE ? OR v.vendor_code LIKE ?)");
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
 * @param {object} queryParams
 */
export async function listVendors(queryParams) {
  const { limit, cursor } = parsePaginationQuery({
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor,
  });

  const filters = buildVendorFilters({
    status: queryParams.status,
    search: queryParams.search,
  });

  const keyset = keysetWhereClauseByKey(cursor, "vendor_code", "v");
  const allClauses = [...filters.clauses];
  if (keyset.clause) {
    allClauses.push(keyset.clause.replace(/^AND\s+/, ""));
  }
  const whereSql = buildWhereSql(allClauses);

  const countSql = `SELECT COUNT(*) AS total FROM vendors v ${whereSql}`;
  const [countRows] = await query(countSql, [...filters.params, ...keyset.params]);
  const totalCount = Number(countRows[0]?.total ?? 0);

  const listSql = `
    SELECT v.vendor_code, v.vendor_code_sap, v.vendor_name, v.address, v.gst_no, v.contact_person,
           v.email, v.phone, v.status, v.created_at, v.updated_at,
           (SELECT COUNT(*) FROM users u WHERE u.vendor_code = v.vendor_code) AS user_count
    FROM vendors v
    ${whereSql}
    ORDER BY v.created_at DESC, v.vendor_code DESC
    LIMIT ${sqlInlineLimit(limit, true)}`;

  const [rows] = await query(listSql, [...filters.params, ...keyset.params]);

  const page = buildCursorPage(rows, limit, (row) => ({
    id: row.vendor_code,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));

  return {
    vendors: page.data.map(formatVendor),
    totalCount,
    pagination: page.pagination,
  };
}

/**
 * @param {string} vendorCode
 */
export async function getVendorByCode(vendorCode) {
  const [rows] = await query(
    `SELECT v.vendor_code, v.vendor_name, v.address, v.gst_no, v.contact_person,
            v.email, v.phone, v.status, v.created_at, v.updated_at,
            COUNT(u.user_id) AS user_count
     FROM vendors v
     LEFT JOIN users u ON u.vendor_code = v.vendor_code
     WHERE v.vendor_code = ?
     GROUP BY v.vendor_code`,
    [vendorCode]
  );

  if (!rows.length) {
    throw ApiError.notFound("Vendor not found");
  }

  return formatVendor(rows[0]);
}

const CREDENTIALS_NOTE =
  "Share these credentials with vendor. Password must be changed on first login.";

/**
 * @param {object} data
 * @param {string} data.vendorCodeSap
 * @param {string} data.vendorName
 * @param {string} data.email
 * @param {object} audit
 */
export async function createVendor(data, audit) {
  const vendorCode = String(data.vendorCodeSap).trim();
  const email = data.email.trim().toLowerCase();
  const username = generateUsername(vendorCode);
  const plainPassword =
    data.password && String(data.password).trim()
      ? String(data.password).trim()
      : generateVendorPassword();

  if (!meetsPasswordPolicy(plainPassword)) {
    throw ApiError.unprocessable(getPasswordPolicyMessage());
  }

  const passwordHash = await hashPassword(plainPassword);

  const [existingCode] = await query(
    `SELECT vendor_code FROM vendors
     WHERE vendor_code = ? OR vendor_code_sap = ?
     LIMIT 1`,
    [vendorCode, vendorCode]
  );
  if (existingCode.length) {
    throw ApiError.badRequest("SAP vendor code already exists");
  }

  const [existingUserEmail] = await query(
    `SELECT user_id FROM users WHERE LOWER(email) = ? LIMIT 1`,
    [email]
  );
  if (existingUserEmail.length) {
    throw ApiError.badRequest("Email is already registered to a user");
  }

  const [existingVendorEmail] = await query(
    `SELECT vendor_code FROM vendors WHERE LOWER(email) = ? LIMIT 1`,
    [email]
  );
  if (existingVendorEmail.length) {
    throw ApiError.badRequest("Email is already registered to a vendor");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO vendors
        (vendor_code, vendor_code_sap, vendor_name, address, gst_no, contact_person,
         email, phone, status, first_login, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        vendorCode,
        vendorCode,
        data.vendorName,
        data.address ?? null,
        data.gstNo ?? null,
        data.contactPerson ?? null,
        email,
        data.phone ?? null,
        data.status ?? "active",
        audit.actorUserId ?? null,
      ]
    );

    const [userResult] = await conn.execute(
      `INSERT INTO users
        (vendor_code, email, password_hash, role, status, must_change_password)
       VALUES (?, ?, ?, 'vendor', 'active', 1)`,
      [vendorCode, email, passwordHash]
    );

    const userId = Number(userResult.insertId);

    await conn.execute(
      `INSERT INTO vendor_credentials_log (vendor_code, user_id, generated_by)
       VALUES (?, ?, ?)`,
      [vendorCode, userId, audit.actorUserId]
    );

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "VENDOR_CREATE",
      entityType: "vendor",
      entityId: vendorCode,
      oldValues: null,
      newValues: {
        vendorCodeSap: vendorCode,
        vendorName: data.vendorName,
        email,
        status: data.status ?? "active",
        userId,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    queueVendorWelcomeEmail(email, data.vendorName, username, plainPassword);

    return {
      vendorCode,
      vendorName: data.vendorName,
      email,
      loginCredentials: {
        username,
        temporaryPassword: plainPassword,
        note: CREDENTIALS_NOTE,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Admin resets vendor portal password (or creates portal user if missing).
 * @param {string} vendorCode
 * @param {{ password?: string }} data
 * @param {object} audit
 */
export async function resetVendorPassword(vendorCode, data, audit) {
  const vendor = await getVendorByCode(vendorCode);
  const plainPassword =
    data.password && String(data.password).trim()
      ? String(data.password).trim()
      : generateVendorPassword();

  if (!meetsPasswordPolicy(plainPassword)) {
    throw ApiError.unprocessable(getPasswordPolicyMessage());
  }

  const passwordHash = await hashPassword(plainPassword);
  const username = generateUsername(vendor.vendorCodeSap ?? vendorCode);

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [users] = await conn.execute(
      `SELECT user_id FROM users WHERE vendor_code = ? AND role = 'vendor' LIMIT 1`,
      [vendorCode]
    );

    let userId;

    if (!users.length) {
      const [userResult] = await conn.execute(
        `INSERT INTO users
          (vendor_code, email, password_hash, role, status, must_change_password)
         VALUES (?, ?, ?, 'vendor', 'active', 1)`,
        [vendorCode, vendor.email.toLowerCase(), passwordHash]
      );
      userId = Number(userResult.insertId);

      await conn.execute(
        `INSERT INTO vendor_credentials_log (vendor_code, user_id, generated_by)
         VALUES (?, ?, ?)`,
        [vendorCode, userId, audit.actorUserId]
      );
    } else {
      userId = Number(users[0].user_id);
      await conn.execute(
        `UPDATE users
         SET password_hash = ?, must_change_password = 1, password_changed_at = NULL,
             status = 'active', updated_at = NOW(3)
         WHERE user_id = ?`,
        [passwordHash, userId]
      );
      await invalidateSessionsForUsers(conn, [userId]);
    }

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "VENDOR_PASSWORD_RESET",
      entityType: "vendor",
      entityId: vendorCode,
      oldValues: null,
      newValues: { userId },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    queueVendorWelcomeEmail(vendor.email, vendor.vendorName, username, plainPassword);

    return {
      vendorCode,
      vendorName: vendor.vendorName,
      email: vendor.email,
      loginCredentials: {
        username,
        temporaryPassword: plainPassword,
        note: CREDENTIALS_NOTE,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @param {string} vendorCode
 * @param {object} updates
 * @param {object} audit
 */
export async function updateVendor(vendorCode, updates, audit) {
  const existing = await getVendorByCode(vendorCode);

  if (updates.email) {
    const [dup] = await query(
      `SELECT vendor_code FROM vendors WHERE LOWER(email) = ? AND vendor_code != ? LIMIT 1`,
      [updates.email.toLowerCase(), vendorCode]
    );
    if (dup.length) {
      throw ApiError.badRequest("Email is already in use");
    }
  }

  const fieldMap = {
    vendorName: "vendor_name",
    address: "address",
    gstNo: "gst_no",
    contactPerson: "contact_person",
    email: "email",
    phone: "phone",
  };

  const setClauses = [];
  const params = [];

  for (const [key, column] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${column} = ?`);
      params.push(key === "email" ? updates[key].toLowerCase() : updates[key]);
    }
  }

  if (!setClauses.length) {
    throw ApiError.badRequest("No valid fields to update");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE vendors SET ${setClauses.join(", ")} WHERE vendor_code = ?`,
      [...params, vendorCode]
    );

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "VENDOR_UPDATE",
      entityType: "vendor",
      entityId: vendorCode,
      oldValues: existing,
      newValues: updates,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    return getVendorByCode(vendorCode);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @param {string} vendorCode
 * @param {'active'|'inactive'} status
 * @param {object} audit
 */
export async function toggleVendorStatus(vendorCode, status, audit) {
  const existing = await getVendorByCode(vendorCode);

  if (existing.status === status) {
    return existing;
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(`UPDATE vendors SET status = ? WHERE vendor_code = ?`, [
      status,
      vendorCode,
    ]);

    if (status === "inactive") {
      await conn.execute(
        `UPDATE users SET status = 'inactive' WHERE vendor_code = ?`,
        [vendorCode]
      );

      const userIds = await getUserIdsByVendorCode(conn, vendorCode);
      await invalidateSessionsForUsers(conn, userIds);
    }

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "VENDOR_STATUS_TOGGLE",
      entityType: "vendor",
      entityId: vendorCode,
      oldValues: { status: existing.status },
      newValues: { status },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();

    return getVendorByCode(vendorCode);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
