import { getConnection } from "../config/db.js";
import { query } from "../config/db.js";
import { ApiError } from "../utils/ApiError.js";
import { writeAuditLog } from "../utils/auditHelper.js";
import {
  buildCursorPage,
  keysetWhereClauseByKey,
  parsePaginationQuery,
  sqlInlineLimit,
} from "../utils/pagination.js";
import { bulkMaterialRowSchema } from "../validators/masterValidators.js";
import {
  MASTER_CACHE_TTL,
  buildMasterCacheKey,
  cacheAside,
  invalidateMasterCache,
  invalidatePlantRelatedCaches,
} from "./masterCacheService.js";

/**
 * @param {object} row
 */
export function formatPlant(row) {
  return {
    plantCode: row.plant_code,
    plantName: row.plant_name,
    companyCode: row.company_code,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * @param {object} row
 */
export function formatStorageLocation(row) {
  return {
    id: row.id,
    plantCode: row.plant_code,
    storageLocationCode: row.storage_location_code,
    description: row.description,
    createdAt: row.created_at,
  };
}

/**
 * @param {object} row
 */
export function formatMaterial(row) {
  return {
    materialCode: row.material_code,
    materialDescription: row.material_description,
    uom: row.uom,
    unitPrice: Number(row.unit_price ?? 0),
    materialType: row.material_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Plants ───────────────────────────────────────────────────────────────────

export async function getActivePlants() {
  const cacheKey = buildMasterCacheKey("plants", { list: "active" });

  return cacheAside(
    cacheKey,
    async () => {
      const [rows] = await query(
        `SELECT plant_code, plant_name, company_code, status, created_at
         FROM plants WHERE status = 'active'
         ORDER BY plant_name ASC`
      );
      return rows.map(formatPlant);
    },
    MASTER_CACHE_TTL.plants
  );
}

/**
 * @param {object} data
 * @param {object} audit
 */
export async function createPlant(data, audit) {
  const [existing] = await query(
    `SELECT plant_code FROM plants WHERE plant_code = ? LIMIT 1`,
    [data.plantCode]
  );
  if (existing.length) {
    throw ApiError.badRequest("Plant code already exists");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO plants (plant_code, plant_name, company_code, status) VALUES (?, ?, ?, ?)`,
      [data.plantCode, data.plantName, data.companyCode, data.status ?? "active"]
    );
    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_PLANT_CREATE",
      entityType: "plant",
      entityId: data.plantCode,
      oldValues: null,
      newValues: data,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await invalidatePlantRelatedCaches();
  return getPlantByCode(data.plantCode);
}

/**
 * @param {string} plantCode
 */
export async function getPlantByCode(plantCode) {
  const [rows] = await query(
    `SELECT plant_code, plant_name, company_code, status, created_at
     FROM plants WHERE plant_code = ? LIMIT 1`,
    [plantCode]
  );
  if (!rows.length) {
    throw ApiError.notFound("Plant not found");
  }
  return formatPlant(rows[0]);
}

/**
 * @param {string} plantCode
 * @param {object} updates
 * @param {object} audit
 */
export async function updatePlant(plantCode, updates, audit) {
  const existing = await getPlantByCode(plantCode);

  const fieldMap = {
    plantName: "plant_name",
    companyCode: "company_code",
    status: "status",
  };

  const setClauses = [];
  const params = [];

  for (const [key, col] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${col} = ?`);
      params.push(updates[key]);
    }
  }

  if (!setClauses.length) {
    throw ApiError.badRequest("No valid fields to update");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE plants SET ${setClauses.join(", ")} WHERE plant_code = ?`,
      [...params, plantCode]
    );
    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_PLANT_UPDATE",
      entityType: "plant",
      entityId: plantCode,
      oldValues: existing,
      newValues: updates,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await invalidatePlantRelatedCaches();
  return getPlantByCode(plantCode);
}

/**
 * Soft-delete plant (status = inactive).
 * @param {string} plantCode
 * @param {object} audit
 */
export async function softDeletePlant(plantCode, audit) {
  const existing = await getPlantByCode(plantCode);

  if (existing.status === "inactive") {
    return existing;
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE plants SET status = 'inactive' WHERE plant_code = ?`, [
      plantCode,
    ]);
    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_PLANT_DELETE",
      entityType: "plant",
      entityId: plantCode,
      oldValues: existing,
      newValues: { status: "inactive" },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await invalidatePlantRelatedCaches();
  return getPlantByCode(plantCode);
}

// ─── Storage locations ────────────────────────────────────────────────────────

/**
 * @param {string} plantCode
 */
export async function getStorageLocationsByPlant(plantCode) {
  const [plant] = await query(
    `SELECT plant_code FROM plants WHERE plant_code = ? AND status = 'active' LIMIT 1`,
    [plantCode]
  );
  if (!plant.length) {
    throw ApiError.notFound("Active plant not found");
  }

  const cacheKey = buildMasterCacheKey("storage_locations", { plantCode });

  return cacheAside(
    cacheKey,
    async () => {
      const [rows] = await query(
        `SELECT id, plant_code, storage_location_code, description, created_at
         FROM storage_locations
         WHERE plant_code = ?
         ORDER BY storage_location_code ASC`,
        [plantCode]
      );
      return rows.map(formatStorageLocation);
    },
    MASTER_CACHE_TTL.storage_locations
  );
}

/**
 * @param {object} data
 * @param {object} audit
 */
export async function createStorageLocation(data, audit) {
  const [plant] = await query(
    `SELECT plant_code FROM plants WHERE plant_code = ? AND status = 'active' LIMIT 1`,
    [data.plantCode]
  );
  if (!plant.length) {
    throw ApiError.badRequest("Active plant not found");
  }

  const [dup] = await query(
    `SELECT id FROM storage_locations
     WHERE plant_code = ? AND storage_location_code = ? LIMIT 1`,
    [data.plantCode, data.storageLocationCode]
  );
  if (dup.length) {
    throw ApiError.badRequest("Storage location code already exists for this plant");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO storage_locations (plant_code, storage_location_code, description)
       VALUES (?, ?, ?)`,
      [data.plantCode, data.storageLocationCode, data.description ?? null]
    );
    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_STORAGE_CREATE",
      entityType: "storage_location",
      entityId: String(result.insertId),
      oldValues: null,
      newValues: data,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await conn.commit();

    await invalidateMasterCache("storage_locations");

    return getStorageLocationById(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @param {number} id
 */
export async function getStorageLocationById(id) {
  const [rows] = await query(
    `SELECT id, plant_code, storage_location_code, description, created_at
     FROM storage_locations WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) {
    throw ApiError.notFound("Storage location not found");
  }
  return formatStorageLocation(rows[0]);
}

/**
 * @param {number} id
 * @param {object} updates
 * @param {object} audit
 */
export async function updateStorageLocation(id, updates, audit) {
  const existing = await getStorageLocationById(id);

  if (updates.storageLocationCode) {
    const [dup] = await query(
      `SELECT id FROM storage_locations
       WHERE plant_code = ? AND storage_location_code = ? AND id != ? LIMIT 1`,
      [existing.plantCode, updates.storageLocationCode, id]
    );
    if (dup.length) {
      throw ApiError.badRequest("Storage location code already exists for this plant");
    }
  }

  const setClauses = [];
  const params = [];

  if (updates.description !== undefined) {
    setClauses.push("description = ?");
    params.push(updates.description);
  }
  if (updates.storageLocationCode !== undefined) {
    setClauses.push("storage_location_code = ?");
    params.push(updates.storageLocationCode);
  }

  if (!setClauses.length) {
    throw ApiError.badRequest("No valid fields to update");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE storage_locations SET ${setClauses.join(", ")} WHERE id = ?`,
      [...params, id]
    );
    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_STORAGE_UPDATE",
      entityType: "storage_location",
      entityId: String(id),
      oldValues: existing,
      newValues: updates,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await invalidateMasterCache("storage_locations");
  return getStorageLocationById(id);
}

// ─── Materials ────────────────────────────────────────────────────────────────

/**
 * @param {object} queryParams
 */
export async function listMaterials(queryParams) {
  const cacheParams = {
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor ?? null,
    search: queryParams.search ?? null,
    status: queryParams.status,
    schemaVersion: 2,
  };

  const cacheKey = buildMasterCacheKey("materials", cacheParams);

  return cacheAside(
    cacheKey,
    async () => fetchMaterialsFromDb(queryParams),
    MASTER_CACHE_TTL.materials
  );
}

/**
 * @param {object} queryParams
 */
async function fetchMaterialsFromDb(queryParams) {
  const { limit, cursor } = parsePaginationQuery({
    pageSize: queryParams.pageSize,
    cursor: queryParams.cursor,
  });

  const clauses = [];
  const params = [];

  if (queryParams.status) {
    clauses.push("m.status = ?");
    params.push(queryParams.status);
  }

  if (queryParams.search) {
    clauses.push("(m.material_code LIKE ? OR m.material_description LIKE ?)");
    const term = `%${queryParams.search}%`;
    params.push(term, term);
  }

  const keyset = keysetWhereClauseByKey(cursor, "material_code", "m");
  if (keyset.clause) {
    clauses.push(keyset.clause.replace(/^AND\s+/, ""));
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const countSql = `SELECT COUNT(*) AS total FROM materials m ${whereSql}`;
  const [countRows] = await query(countSql, [...params, ...keyset.params]);
  const totalCount = Number(countRows[0]?.total ?? 0);

  const listSql = `
    SELECT material_code, material_description, uom, unit_price, material_type, status, created_at, updated_at
    FROM materials m
    ${whereSql}
    ORDER BY m.created_at DESC, m.material_code DESC
    LIMIT ${sqlInlineLimit(limit, true)}`;

  const [rows] = await query(listSql, [...params, ...keyset.params]);

  const page = buildCursorPage(rows, limit, (row) => ({
    id: row.material_code,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));

  return {
    materials: page.data.map(formatMaterial),
    totalCount,
    pagination: page.pagination,
  };
}

/**
 * @param {string} materialCode
 */
export async function getMaterialByCode(materialCode) {
  const [rows] = await query(
    `SELECT material_code, material_description, uom, unit_price, material_type, status, created_at, updated_at
     FROM materials WHERE material_code = ? LIMIT 1`,
    [materialCode]
  );
  if (!rows.length) {
    throw ApiError.notFound("Material not found");
  }
  return formatMaterial(rows[0]);
}

/**
 * @param {object} data
 * @param {object} audit
 */
export async function createMaterial(data, audit) {
  const [existing] = await query(
    `SELECT material_code FROM materials WHERE material_code = ? LIMIT 1`,
    [data.materialCode]
  );
  if (existing.length) {
    throw ApiError.badRequest("Material code already exists");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO materials (material_code, material_description, uom, unit_price, material_type, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.materialCode,
        data.materialDescription,
        data.uom,
        data.unitPrice ?? 0,
        data.materialType ?? null,
        data.status ?? "active",
      ]
    );
    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_MATERIAL_CREATE",
      entityType: "material",
      entityId: data.materialCode,
      oldValues: null,
      newValues: data,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await invalidateMasterCache("materials");
  return getMaterialByCode(data.materialCode);
}

/**
 * @param {string} materialCode
 * @param {object} updates
 * @param {object} audit
 */
export async function updateMaterial(materialCode, updates, audit) {
  const existing = await getMaterialByCode(materialCode);

  const fieldMap = {
    materialDescription: "material_description",
    uom: "uom",
    unitPrice: "unit_price",
    materialType: "material_type",
    status: "status",
  };

  const setClauses = [];
  const params = [];

  for (const [key, col] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      setClauses.push(`${col} = ?`);
      params.push(updates[key]);
    }
  }

  if (!setClauses.length) {
    throw ApiError.badRequest("No valid fields to update");
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE materials SET ${setClauses.join(", ")} WHERE material_code = ?`,
      [...params, materialCode]
    );
    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_MATERIAL_UPDATE",
      entityType: "material",
      entityId: materialCode,
      oldValues: existing,
      newValues: updates,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await invalidateMasterCache("materials");
  return getMaterialByCode(materialCode);
}

/**
 * Validates all rows, then batch upserts in a single transaction.
 * @param {unknown[]} rows
 * @param {object} audit
 * @returns {Promise<{ total: number, inserted: number, updated: number, errors: Array<{ row: number, field: string, message: string }> }>}
 */
export async function bulkImportMaterials(rows, audit) {
  if (rows.length > 1000) {
    throw ApiError.badRequest("Maximum 1000 records per batch");
  }

  /** @type {Array<{ row: number, field: string, message: string }>} */
  const errors = [];
  const validRows = [];

  rows.forEach((row, index) => {
    const result = bulkMaterialRowSchema.safeParse(row);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        errors.push({
          row: index + 1,
          field: issue.path.join(".") || "_root",
          message: issue.message,
        });
      });
    } else {
      validRows.push(result.data);
    }
  });

  const codeSeen = new Set();
  validRows.forEach((row, index) => {
    if (codeSeen.has(row.materialCode)) {
      errors.push({
        row: index + 1,
        field: "materialCode",
        message: "Duplicate material code in batch",
      });
    }
    codeSeen.add(row.materialCode);
  });

  if (errors.length > 0) {
    return {
      total: rows.length,
      inserted: 0,
      updated: 0,
      errors,
    };
  }

  const codes = validRows.map((r) => r.materialCode);
  const [existingRows] = await query(
    `SELECT material_code FROM materials WHERE material_code IN (${codes.map(() => "?").join(",")})`,
    codes
  );
  const existingBefore = new Set(existingRows.map((r) => r.material_code));

  let inserted = 0;
  let updated = 0;
  validRows.forEach((r) => {
    if (existingBefore.has(r.materialCode)) {
      updated += 1;
    } else {
      inserted += 1;
    }
  });

  const conn = await getConnection();

  try {
    await conn.beginTransaction();

    const chunkSize = 100;
    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      const valuePlaceholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const flatParams = chunk.flatMap((r) => [
        r.materialCode,
        r.materialDescription,
        r.uom,
        r.unitPrice ?? 0,
        r.materialType ?? null,
        r.status ?? "active",
      ]);

      await conn.execute(
        `INSERT INTO materials (material_code, material_description, uom, unit_price, material_type, status)
         VALUES ${valuePlaceholders}
         ON DUPLICATE KEY UPDATE
           material_description = VALUES(material_description),
           uom = VALUES(uom),
           unit_price = VALUES(unit_price),
           material_type = VALUES(material_type),
           status = VALUES(status),
           updated_at = NOW(3)`,
        flatParams
      );
    }

    await writeAuditLog(conn, {
      actorUserId: audit.actorUserId,
      action: "MASTER_MATERIAL_BULK_IMPORT",
      entityType: "material",
      entityId: "bulk",
      oldValues: null,
      newValues: { total: validRows.length, inserted, updated },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await invalidateMasterCache("materials");

  return {
    total: rows.length,
    inserted,
    updated,
    errors: [],
  };
}
