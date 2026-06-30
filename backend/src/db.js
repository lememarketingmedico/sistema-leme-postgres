import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function runMigrations() {
  const migrationPath = path.resolve(__dirname, '../migrations/001_schema.sql');
  const sql = await fs.readFile(migrationPath, 'utf8');
  await query(sql);
}

export async function closePool() {
  await pool.end();
}
