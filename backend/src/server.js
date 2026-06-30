import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { query, runMigrations } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

function nowIso() { return new Date().toISOString(); }
function idFrom(record = {}) { return String(record.registro_id || record.id || crypto.randomUUID()); }
function dateOnly(value) { return value ? String(value).slice(0, 10) : null; }
function timeOnly(value) { return value ? String(value).slice(0, 5) : ''; }
function asJson(record) { return record && typeof record === 'object' ? record : {}; }
function rowsData(rows) { return rows.map(row => ({ ...(row.data || {}), registro_id: row.registro_id, id: row.registro_id })); }
function ok(data = {}) { return { ok: true, ...data }; }
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }

async function upsertColaborador(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO colaboradores (registro_id,nome,usuario,senha,cargo,cor,status,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (registro_id) DO UPDATE SET nome=$2,usuario=$3,senha=$4,cargo=$5,cor=$6,status=$7,data=$8,updated_at=$10`, [
      registroId, record.nome || record.usuario || 'Colaborador sem nome', record.usuario || record.nome || '', record.senha || '', record.cargo || '', record.cor || '#163f63', record.status || 'Ativo', record, record.created_at, record.updated_at
    ]);
  return record;
}

async function upsertCliente(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO clientes (registro_id,nome_cliente,especialidade,cidade,telefone_doutor,instagram,responsavel_id,status,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (registro_id) DO UPDATE SET nome_cliente=$2,especialidade=$3,cidade=$4,telefone_doutor=$5,instagram=$6,responsavel_id=$7,status=$8,data=$9,updated_at=$11`, [
      registroId, record.nome_cliente || record.nome || 'Cliente sem nome', record.especialidade || '', record.cidade || '', record.telefone_doutor || record.telefone || '', record.instagram || record.conta_instagram || '', record.responsavel_id || '', record.status || 'Ativo', record, record.created_at, record.updated_at
    ]);
  return record;
}

async function upsertPublicacao(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO publicacoes (registro_id,cliente_id,responsavel_id,data_publicacao,titulo,formato,status,drive_folder_url,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (registro_id) DO UPDATE SET cliente_id=$2,responsavel_id=$3,data_publicacao=$4,titulo=$5,formato=$6,status=$7,drive_folder_url=$8,data=$9,updated_at=$11`, [
      registroId, record.cliente_id || '', record.responsavel_id || '', dateOnly(record.data_publicacao), record.titulo || 'Publicação sem título', record.formato || '', record.status || '', record.drive_folder_url || '', record, record.created_at, record.updated_at
    ]);
  return record;
}

async function upsertEvento(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  const rawDate = record.data || record.data_evento || record.data_inicio || '';
  await query(`INSERT INTO eventos (registro_id,colaborador_id,cliente_id,titulo,tipo,data_evento,hora,status,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (registro_id) DO UPDATE SET colaborador_id=$2,cliente_id=$3,titulo=$4,tipo=$5,data_evento=$6,hora=$7,status=$8,data=$9,updated_at=$11`, [
      registroId, record.colaborador_id || record.responsavel_id || '', record.cliente_id || '', record.titulo || 'Evento sem título', record.tipo || 'Outro', dateOnly(rawDate), timeOnly(record.hora || String(record.data_inicio || '').slice(11, 16)), record.status || 'Agendado', record, record.created_at, record.updated_at
    ]);
  return record;
}

async function upsertTrafego(input) {
  const record = { ...asJson(input) };
  const mes = record.mes_referencia || record.month || record.mes || '';
  const clientId = record.cliente_id || '';
  const registroId = String(record.registro_id || record.id || `${clientId}_${mes}` || crypto.randomUUID());
  record.id = registroId;
  record.registro_id = registroId;
  record.mes_referencia = mes;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO trafego_pago (registro_id,cliente_id,mes_referencia,status,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (cliente_id, mes_referencia) DO UPDATE SET registro_id=$1,status=$4,data=$5,updated_at=$7`, [
      registroId, clientId, mes, record.status || '', record, record.created_at, record.updated_at
    ]);
  return record;
}

async function upsertCrmProspect(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO crm_prospects (registro_id,nome,especialidade,cidade,whatsapp,email,responsavel_id,status_funil,temperatura,proximo_follow_up,cliente_id_convertido,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (registro_id) DO UPDATE SET nome=$2,especialidade=$3,cidade=$4,whatsapp=$5,email=$6,responsavel_id=$7,status_funil=$8,temperatura=$9,proximo_follow_up=$10,cliente_id_convertido=$11,data=$12,updated_at=$14`, [
      registroId, record.nome || 'Prospect sem nome', record.especialidade || '', record.cidade || '', record.whatsapp || '', record.email || '', record.responsavel_id || '', record.status_funil || 'Mapeado', record.temperatura || 'Morno', record.proximo_follow_up || null, record.cliente_id_convertido || '', record, record.created_at, record.updated_at
    ]);
  return record;
}

async function upsertCrmAction(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO crm_acoes (registro_id,prospect_id,tipo,titulo,data_acao,status_acao,responsavel_id,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (registro_id) DO UPDATE SET prospect_id=$2,tipo=$3,titulo=$4,data_acao=$5,status_acao=$6,responsavel_id=$7,data=$8,updated_at=$10`, [
      registroId, record.prospect_id || '', record.tipo || 'Observação', record.titulo || '', record.data_acao || null, record.status_acao || '', record.responsavel_id || '', record, record.created_at, record.updated_at
    ]);
  if (record.prospect_id) {
    await query(`UPDATE crm_prospects SET data = jsonb_set(jsonb_set(data, '{data_ultimo_contato}', to_jsonb($2::text), true), '{proximo_follow_up}', to_jsonb(COALESCE($3::text, data->>'proximo_follow_up')), true), updated_at = now() WHERE registro_id = $1`, [record.prospect_id, record.data_acao || nowIso(), record.proximo_follow_up || null]);
  }
  return record;
}

async function listTable(table) {
  const result = await query(`SELECT registro_id, data FROM ${table} ORDER BY updated_at DESC`);
  return rowsData(result.rows);
}

app.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json(ok({ service: 'sistema-leme-api', database: 'ok' }));
});

app.post('/webhook/listar-colaboradores', async (_req, res) => res.json(ok({ data: await listTable('colaboradores') })));
app.post('/webhook/listar-clientes', async (_req, res) => res.json(ok({ data: await listTable('clientes') })));
app.post('/webhook/listar-publicacoes', async (_req, res) => res.json(ok({ data: await listTable('publicacoes') })));
app.post('/webhook/listar-eventos', async (_req, res) => res.json(ok({ data: await listTable('eventos') })));
app.post('/webhook/listar-trafego-pago', async (_req, res) => res.json(ok({ data: await listTable('trafego_pago') })));
app.post('/webhook/crm-listar-prospects', async (_req, res) => res.json(ok({ data: await listTable('crm_prospects') })));
app.post('/webhook/crm-listar-acoes', async (_req, res) => res.json(ok({ data: await listTable('crm_acoes') })));

app.get('/api/sync', async (_req, res) => res.json(ok({
  colaboradores: await listTable('colaboradores'),
  clientes: await listTable('clientes'),
  publicacoes: await listTable('publicacoes'),
  eventos: await listTable('eventos'),
  trafego_pago: await listTable('trafego_pago'),
  crm_prospects: await listTable('crm_prospects'),
  crm_acoes: await listTable('crm_acoes')
})));

app.post('/webhook/criar-colaborador', async (req, res) => res.json(ok({ action: 'upserted', registro_id: (await upsertColaborador(req.body.colaborador || req.body)).registro_id })));
app.post('/webhook/criar-cliente', async (req, res) => res.json(ok({ action: 'upserted', registro_id: (await upsertCliente(req.body.cliente || req.body)).registro_id })));
app.post('/webhook/criar-publicacao', async (req, res) => res.json(ok({ action: 'upserted', registro_id: (await upsertPublicacao(req.body.publicacao || req.body.post || req.body)).registro_id })));
app.post('/webhook/atualizar-publicacao', async (req, res) => res.json(ok({ action: 'updated', registro_id: (await upsertPublicacao(req.body.publicacao || req.body.post || req.body)).registro_id })));
app.post('/webhook/deletar-publicacao', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.publicacao?.registro_id || req.body.publicacao?.id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório');
  await query('DELETE FROM publicacoes WHERE registro_id = $1', [registroId]);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});

app.post('/webhook/criar-evento', async (req, res) => res.json(ok({ action: 'upserted', registro_id: (await upsertEvento(req.body.evento || req.body.event || req.body)).registro_id })));
app.post('/webhook/salvar-trafego-pago', async (req, res) => res.json(ok({ action: 'upserted', registro_id: (await upsertTrafego(req.body.trafego || req.body.record || req.body)).registro_id })));

app.post('/webhook/crm-criar-prospect', async (req, res) => res.json(ok({ action: 'upserted', registro_id: (await upsertCrmProspect(req.body.prospect || req.body.crm_prospect || req.body)).registro_id })));
app.post('/webhook/crm-atualizar-prospect', async (req, res) => res.json(ok({ action: 'updated', registro_id: (await upsertCrmProspect(req.body.prospect || req.body.crm_prospect || req.body)).registro_id })));
app.post('/webhook/crm-deletar-prospect', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.prospect_id || req.body.prospect?.registro_id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório');
  await query('DELETE FROM crm_acoes WHERE prospect_id = $1', [registroId]);
  await query('DELETE FROM crm_prospects WHERE registro_id = $1', [registroId]);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});
app.post('/webhook/crm-criar-acao', async (req, res) => res.json(ok({ action: 'upserted', registro_id: (await upsertCrmAction(req.body.crm_action || req.body.action_record || req.body)).registro_id })));
app.post('/webhook/crm-atualizar-acao', async (req, res) => res.json(ok({ action: 'updated', registro_id: (await upsertCrmAction(req.body.crm_action || req.body.action_record || req.body)).registro_id })));
app.post('/webhook/crm-deletar-acao', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.id || req.body.crm_action?.registro_id || '');
  if (!registroId) fail('registro_id obrigatório');
  await query('DELETE FROM crm_acoes WHERE registro_id = $1', [registroId]);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});

app.post('/webhook/crm-converter-cliente', async (req, res) => {
  const prospectId = String(req.body.prospect_id || '');
  const clientPayload = { ...(req.body.client || {}) };
  let clienteId = String(req.body.existing_client_id || '');
  if (!clienteId) {
    const phone = String(clientPayload.telefone_doutor || '').replace(/\D/g, '');
    const email = String(clientPayload.email_google || clientPayload.email || '').toLowerCase();
    const insta = String(clientPayload.instagram || '').toLowerCase().replace(/^@/, '');
    const existing = await query(`SELECT registro_id, data FROM clientes WHERE regexp_replace(COALESCE(data->>'telefone_doutor',''), '\\D', '', 'g') = $1 OR lower(COALESCE(data->>'email_google', data->>'email', '')) = $2 OR lower(regexp_replace(COALESCE(data->>'instagram',''), '^@', '')) = $3 LIMIT 1`, [phone, email, insta]);
    if (existing.rows[0]) clienteId = existing.rows[0].registro_id;
  }
  if (!clienteId) {
    const client = await upsertCliente({ ...clientPayload, registro_id: clientPayload.registro_id || crypto.randomUUID() });
    clienteId = client.registro_id;
  }
  if (prospectId) {
    const result = await query('SELECT data FROM crm_prospects WHERE registro_id = $1', [prospectId]);
    if (result.rows[0]) {
      await upsertCrmProspect({ ...result.rows[0].data, status_funil: 'Fechado', cliente_id_convertido: clienteId, data_conversao: nowIso(), responsavel_id: req.body.responsavel_id || clientPayload.responsavel_id || result.rows[0].data.responsavel_id });
    }
  }
  res.json(ok({ result: req.body.existing_client_id ? 'linked_existing' : 'created_or_linked', prospect_id: prospectId, cliente_id: clienteId, status_funil: 'Fechado' }));
});

async function forwardToN8n(kind, payload, fallbackEnv) {
  const url = process.env[fallbackEnv];
  if (!url) return { ok: false, error: `Variável ${fallbackEnv} não configurada no backend.` };
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.N8N_API_KEY || '' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  const out = { ok: response.ok && data?.ok !== false, ...data };
  await query('INSERT INTO automacao_logs (tipo,payload,resposta,ok) VALUES ($1,$2,$3,$4)', [kind, payload, out, out.ok]);
  return out;
}

app.post('/webhook/webhook-drive', async (req, res) => {
  const out = await forwardToN8n('drive', req.body, 'N8N_DRIVE_WEBHOOK_URL');
  const postId = req.body.post?.registro_id || req.body.post?.id || req.body.publicacao?.registro_id || '';
  const url = out.drive_folder_url || out.banco_google || out.url || '';
  if (out.ok && postId && url) {
    const found = await query('SELECT data FROM publicacoes WHERE registro_id = $1', [postId]);
    if (found.rows[0]) await upsertPublicacao({ ...found.rows[0].data, drive_folder_url: url });
  }
  res.json(out);
});
app.post('/webhook/enviar-aprovacao', async (req, res) => res.json(await forwardToN8n('aprovacao', req.body, 'N8N_APPROVAL_WEBHOOK_URL')));
app.post('/webhook/enviar-blog', async (req, res) => res.json(await forwardToN8n('blog', req.body, 'N8N_BLOG_WEBHOOK_URL')));
app.post('/webhook/enviar-relatorio', async (req, res) => res.json(await forwardToN8n('relatorio', req.body, 'N8N_REPORT_WEBHOOK_URL')));
app.post('/webhook/crm-upload-anexo', upload.single('file'), async (req, res) => {
  if (!process.env.N8N_CRM_UPLOAD_WEBHOOK_URL) return res.json({ ok: false, error: 'N8N_CRM_UPLOAD_WEBHOOK_URL não configurada.' });
  const payload = { ...req.body, file_name: req.file?.originalname, mime_type: req.file?.mimetype, file_base64: req.file ? req.file.buffer.toString('base64') : '' };
  res.json(await forwardToN8n('crm-upload', payload, 'N8N_CRM_UPLOAD_WEBHOOK_URL'));
});

app.post('/api/jobs/proxima-semana-em-andamento', async (req, res) => {
  if (process.env.N8N_API_KEY && req.headers['x-api-key'] !== process.env.N8N_API_KEY) return res.status(401).json({ ok: false, error: 'x-api-key inválida.' });
  const today = new Date();
  const day = today.getDay();
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const start = new Date(today); start.setDate(today.getDate() + daysUntilSunday); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  const result = await query(`UPDATE publicacoes SET status='Em andamento', data=jsonb_set(data, '{status}', to_jsonb('Em andamento'::text), true), updated_at=now() WHERE data_publicacao BETWEEN $1 AND $2 AND COALESCE(status,'') <> 'Publicado'`, [start.toISOString().slice(0,10), end.toISOString().slice(0,10)]);
  res.json(ok({ updated: result.rowCount, range: { inicio: start.toISOString().slice(0,10), fim: end.toISOString().slice(0,10) } }));
});

app.use(express.static(ROOT_DIR));
app.get('*', async (_req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Erro interno' });
});

async function seedIfEmpty() {
  const count = await query('SELECT COUNT(*)::int AS count FROM colaboradores');
  if (count.rows[0].count === 0) {
    await upsertColaborador({ registro_id: 'matheus', id: 'matheus', nome: 'Matheus', usuario: 'Matheus', senha: 'Leme123', cargo: 'Direção / Produção', cor: '#163f63', status: 'Ativo' });
    await upsertColaborador({ registro_id: 'luis', id: 'luis', nome: 'Luis', usuario: 'Luis', senha: 'Leme123', cargo: 'Direção / Produção', cor: '#4d95c6', status: 'Ativo' });
  }
}

await runMigrations();
await seedIfEmpty();
app.listen(PORT, () => console.log(`Sistema LEME v77 rodando na porta ${PORT}`));
