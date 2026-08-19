import 'dotenv/config';
import fs from 'node:fs/promises';
import { runMigrations, query, closePool } from '../src/db.js';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run import:json -- caminho/arquivo.json');
  process.exit(1);
}
const raw = JSON.parse(await fs.readFile(file, 'utf8'));
await runMigrations();
const idFrom = r => String(r?.registro_id || r?.id || crypto.randomUUID());
async function upsert(table, r) {
  const id = idFrom(r); r.id = id; r.registro_id = id; r.updated_at = r.updated_at || new Date().toISOString(); r.created_at = r.created_at || r.updated_at;
  await query(`INSERT INTO ${table} (registro_id, data, created_at, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (registro_id) DO UPDATE SET data=$2, updated_at=$4`, [id, r, r.created_at, r.updated_at]);
}
for (const r of raw.collaborators || raw.colaboradores || []) await upsert('colaboradores', r);
for (const r of raw.clients || raw.clientes || []) await upsert('clientes', r);
for (const r of raw.posts || raw.publicacoes || []) await upsert('publicacoes', r);
for (const r of raw.events || raw.eventos || []) await upsert('eventos', r);
for (const r of raw.crm_prospects || []) await upsert('crm_prospects', r);
for (const r of raw.crm_acoes || raw.crm_actions || []) await upsert('crm_acoes', r);
console.log('Importação concluída.');
await closePool();
