/**
 * Runs SQL migrations from this directory in filename order.
 * Tracks applied files in migrations_log and skips already-run migrations.
 *
 * Usage (from project root or Server):
 *   node Server/migrations/run_migration.js
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MIGRATIONS_DIR = __dirname;

/**
 * Strip line comments and split into executable statements.
 * @param {string} sql
 * @returns {string[]}
 */
function parseStatements(sql) {
  const withoutComments = sql
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) {
        return "";
      }
      const inline = line.indexOf("--");
      if (inline > 0 && !line.slice(0, inline).includes("'")) {
        return line.slice(0, inline);
      }
      return line;
    })
    .join("\n");

  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} table
 * @param {string} column
 */
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

/**
 * MySQL before 8.0.29 does not support ADD COLUMN IF NOT EXISTS.
 * Expands one ALTER into per-column ALTERs, skipping columns that already exist.
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} stmt
 * @returns {Promise<string[]>}
 */
async function expandAlterIfNotExists(conn, stmt) {
  const tableMatch = stmt.match(/ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?/i);
  if (!tableMatch) {
    return [stmt];
  }

  const table = tableMatch[1];
  const body = stmt.slice(tableMatch.index + tableMatch[0].length).trim();
  const segments = body.split(/,\s*(?=ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+)/i);
  const statements = [];

  for (const segment of segments) {
    const colMatch = segment.match(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([\s\S]+)/i
    );
    if (!colMatch) {
      continue;
    }

    const colDef = colMatch[1].trim();
    const nameMatch = colDef.match(/^`?([a-zA-Z0-9_]+)`?/);
    if (!nameMatch) {
      continue;
    }

    const colName = nameMatch[1];
    if (await columnExists(conn, table, colName)) {
      console.log(`  Column exists, skip: ${table}.${colName}`);
      continue;
    }

    statements.push(`ALTER TABLE \`${table}\` ADD COLUMN ${colDef}`);
  }

  return statements;
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} stmt
 */
async function executeStatement(conn, stmt) {
  if (/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(stmt)) {
    const expanded = await expandAlterIfNotExists(conn, stmt);
    for (const expandedStmt of expanded) {
      await conn.query(expandedStmt);
    }
    return;
  }

  await conn.query(stmt);
}

/**
 * @param {import('mysql2/promise').Connection} conn
 */
async function ensureMigrationsLog(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS migrations_log (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64) NULL,
      executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uk_migrations_log_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @returns {Promise<Set<string>>}
 */
async function getAppliedMigrations(conn) {
  const [rows] = await conn.query(`SELECT filename FROM migrations_log`);
  return new Set(rows.map((r) => r.filename));
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} filename
 * @param {string} checksum
 */
async function recordMigration(conn, filename, checksum) {
  await conn.query(
    `INSERT INTO migrations_log (filename, checksum) VALUES (?, ?)`,
    [filename, checksum]
  );
}

async function main() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_USER || !DB_NAME) {
    console.error("Missing DB_USER or DB_NAME in Server/.env");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST || "localhost",
    port: Number(DB_PORT) || 3306,
    user: DB_USER,
    password: DB_PASSWORD ?? "",
    database: DB_NAME,
    multipleStatements: false,
    charset: "utf8mb4",
  });

  try {
    await conn.query("SET NAMES utf8mb4");
    await ensureMigrationsLog(conn);

    const applied = await getAppliedMigrations(conn);
    const entries = await fs.readdir(MIGRATIONS_DIR);
    const files = entries.filter((f) => f.endsWith(".sql")).sort();

    if (files.length === 0) {
      console.log("No .sql migration files found.");
      return;
    }

    let ran = 0;
    let skipped = 0;

    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`Skip (already applied): ${filename}`);
        skipped += 1;
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = await fs.readFile(filePath, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const statements = parseStatements(sql);

      console.log(`Running: ${filename} (${statements.length} statement(s))`);

      for (let i = 0; i < statements.length; i += 1) {
        const stmt = statements[i];
        try {
          await executeStatement(conn, stmt);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Failed ${filename} at statement ${i + 1}: ${message}`);
          console.error(stmt.slice(0, 500));
          process.exit(1);
        }
      }

      await recordMigration(conn, filename, checksum);
      console.log(`Applied: ${filename}`);
      ran += 1;
    }

    console.log(`Done. Applied: ${ran}, skipped: ${skipped}.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
