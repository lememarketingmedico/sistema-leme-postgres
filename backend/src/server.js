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
const realtimeClients = new Set();

function broadcastRealtime(entity, action, registro_id = '', extra = {}) {
  const payload = {
    ok: true,
    type: 'data_changed',
    entity,
    action,
    registro_id: String(registro_id || ''),
    at: new Date().toISOString(),
    ...extra
  };

  const message = `event: leme-data\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of realtimeClients) {
    try {
      client.write(message);
    } catch {
      realtimeClients.delete(client);
    }
  }
}

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
function unwrapBody(body = {}, keys = []) {
  for (const key of keys) {
    if (body && body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) {
      return body[key];
    }
  }
  return body || {};
}
function bodyRegistroId(body = {}, keys = []) {
  for (const key of ['registro_id', 'id']) {
    if (body?.[key]) return String(body[key]);
  }
  for (const key of keys) {
    if (body?.[key]?.registro_id || body?.[key]?.id) return String(body[key].registro_id || body[key].id);
  }
  return '';
}

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


async function upsertPromptTemplate(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO prompt_templates (registro_id,nome,formato,status,ordem,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (registro_id) DO UPDATE SET nome=$2,formato=$3,status=$4,ordem=$5,data=$6,updated_at=$8`, [
      registroId,
      record.nome || record.titulo || 'Prompt sem nome',
      record.formato || record.tipo_post || 'Todos',
      record.status || 'Ativo',
      Number(record.ordem || 0),
      record,
      record.created_at,
      record.updated_at
    ]);
  return record;
}


async function upsertFinanceBox(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO finance_boxes (registro_id,nome,categoria,tipo,cliente_id,percentual,meta_valor,status,ordem,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (registro_id) DO UPDATE SET nome=$2,categoria=$3,tipo=$4,cliente_id=$5,percentual=$6,meta_valor=$7,status=$8,ordem=$9,data=$10,updated_at=$12`, [
      registroId,
      record.nome || record.titulo || 'Caixinha sem nome',
      record.categoria || 'interno',
      record.tipo || 'geral',
      record.cliente_id || '',
      Number(record.percentual || 0),
      Number(record.meta_valor || 0),
      record.status || 'Ativo',
      Number(record.ordem || 0),
      record,
      record.created_at,
      record.updated_at
    ]);
  return record;
}

async function upsertFinanceMovement(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.valor = Number(record.valor || 0);
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO finance_movements (registro_id,box_id,cliente_id,tipo,valor,descricao,mes_referencia,data_movimento,origem,status,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (registro_id) DO UPDATE SET box_id=$2,cliente_id=$3,tipo=$4,valor=$5,descricao=$6,mes_referencia=$7,data_movimento=$8,origem=$9,status=$10,data=$11,updated_at=$13`, [
      registroId,
      record.box_id || '',
      record.cliente_id || '',
      record.tipo || 'entrada',
      record.valor,
      record.descricao || '',
      record.mes_referencia || record.month || '',
      dateOnly(record.data_movimento || record.data || nowIso()),
      record.origem || '',
      record.status || 'Confirmado',
      record,
      record.created_at,
      record.updated_at
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

app.get('/api/realtime', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  realtimeClients.add(res);
  res.write(`event: leme-data\ndata: ${JSON.stringify({ ok: true, type: 'connected', at: new Date().toISOString() })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: keepalive ${Date.now()}\n\n`);
    } catch {
      clearInterval(keepAlive);
      realtimeClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    realtimeClients.delete(res);
  });
});

app.post('/webhook/listar-colaboradores', async (_req, res) => res.json(ok({ data: await listTable('colaboradores') })));
app.post('/webhook/listar-clientes', async (_req, res) => res.json(ok({ data: await listTable('clientes') })));
app.post('/webhook/listar-publicacoes', async (_req, res) => res.json(ok({ data: await listTable('publicacoes') })));
app.post('/webhook/listar-eventos', async (_req, res) => res.json(ok({ data: await listTable('eventos') })));
app.post('/webhook/listar-trafego-pago', async (_req, res) => res.json(ok({ data: await listTable('trafego_pago') })));
app.post('/webhook/listar-prompts', async (_req, res) => res.json(ok({ data: await listTable('prompt_templates') })));
app.post('/webhook/listar-caixinhas', async (_req, res) => res.json(ok({ data: await listTable('finance_boxes') })));
app.post('/webhook/listar-movimentacoes-financeiras', async (_req, res) => res.json(ok({ data: await listTable('finance_movements') })));
app.post('/webhook/crm-listar-prospects', async (_req, res) => res.json(ok({ data: await listTable('crm_prospects') })));
app.post('/webhook/crm-listar-acoes', async (_req, res) => res.json(ok({ data: await listTable('crm_acoes') })));

app.get('/api/sync', async (_req, res) => res.json(ok({
  colaboradores: await listTable('colaboradores'),
  clientes: await listTable('clientes'),
  publicacoes: await listTable('publicacoes'),
  eventos: await listTable('eventos'),
  trafego_pago: await listTable('trafego_pago'),
  prompt_templates: await listTable('prompt_templates'),
  prompts: await listTable('prompt_templates'),
  finance_boxes: await listTable('finance_boxes'),
  finance_movements: await listTable('finance_movements'),
  crm_prospects: await listTable('crm_prospects'),
  crm_acoes: await listTable('crm_acoes')
})));

app.post('/webhook/criar-colaborador', async (req, res) => {
  const record = await upsertColaborador(unwrapBody(req.body, ['colaborador', 'collaborator']));
  broadcastRealtime('colaboradores', 'created', record.registro_id);
  res.json(ok({ action: 'created', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/atualizar-colaborador', async (req, res) => {
  const payload = unwrapBody(req.body, ['colaborador', 'collaborator']);
  const registroId = bodyRegistroId(req.body, ['colaborador', 'collaborator']) || payload.registro_id || payload.id;
  if (!registroId) fail('registro_id obrigatório para atualizar colaborador');
  const record = await upsertColaborador({ ...payload, id: registroId, registro_id: registroId });
  broadcastRealtime('colaboradores', 'updated', record.registro_id);
  res.json(ok({ action: 'updated', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/deletar-colaborador', async (req, res) => {
  const registroId = bodyRegistroId(req.body, ['colaborador', 'collaborator']);
  if (!registroId) fail('registro_id obrigatório para excluir colaborador');

  const linked = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM clientes WHERE responsavel_id = $1 OR data->>'responsavel_id' = $1) AS clientes,
      (SELECT COUNT(*)::int FROM publicacoes WHERE responsavel_id = $1 OR data->>'responsavel_id' = $1) AS publicacoes,
      (SELECT COUNT(*)::int FROM eventos WHERE colaborador_id = $1 OR data->>'colaborador_id' = $1) AS eventos
  `, [registroId]);
  const counts = linked.rows[0] || {};
  if ((counts.clientes || 0) || (counts.publicacoes || 0) || (counts.eventos || 0)) {
    return res.status(409).json(ok({
      ok: false,
      error: 'Este colaborador possui clientes, publicações ou eventos vinculados. Reatribua antes de excluir.',
      linked: counts
    }));
  }

  await query('DELETE FROM colaboradores WHERE registro_id = $1', [registroId]);
  broadcastRealtime('colaboradores', 'deleted', registroId);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});
app.post('/webhook/criar-cliente', async (req, res) => {
  const record = await upsertCliente(unwrapBody(req.body, ['cliente', 'client']));
  broadcastRealtime('clientes', 'created', record.registro_id);

  const automation = triggerN8nAsync('criar-cliente-drive-calendario', {
    action: 'create_client_drive_calendar',
    source: 'sistema_leme_postgres',
    triggered_at: nowIso(),
    client: record,
    cliente: record,
    registro_id: record.registro_id,
    instruction: 'Criar a pasta principal do cliente no Drive, criar subpastas, criar mês atual e próximo mês, criar pastas de datas e inserir as publicações no Sistema LEME.'
  }, 'N8N_CLIENT_WEBHOOK_URL');

  res.json(ok({
    action: 'created',
    registro_id: record.registro_id,
    data: record,
    automation
  }));
});
app.post('/webhook/atualizar-cliente', async (req, res) => {
  const payload = unwrapBody(req.body, ['cliente', 'client']);
  const registroId = bodyRegistroId(req.body, ['cliente', 'client']) || payload.registro_id || payload.id;
  if (!registroId) fail('registro_id obrigatório para atualizar cliente');
  const record = await upsertCliente({ ...payload, id: registroId, registro_id: registroId });
  broadcastRealtime('clientes', 'updated', record.registro_id);
  res.json(ok({ action: 'updated', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/deletar-cliente', async (req, res) => {
  const registroId = bodyRegistroId(req.body, ['cliente', 'client']);
  if (!registroId) fail('registro_id obrigatório para excluir cliente');

  const deletePublicacoes =
    req.body.delete_publicacoes === true ||
    req.body.deletePublications === true ||
    req.body.cascade_publicacoes === true ||
    req.body.cascadePublications === true;

  const linked = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM publicacoes WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS publicacoes,
      (SELECT COUNT(*)::int FROM eventos WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS eventos,
      (SELECT COUNT(*)::int FROM trafego_pago WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS trafego
  `, [registroId]);
  const counts = linked.rows[0] || {};

  if ((counts.eventos || 0) || (counts.trafego || 0)) {
    return res.status(409).json(ok({
      ok: false,
      error: 'Este cliente possui eventos ou tráfego vinculados. Remova ou reatribua esses registros antes de excluir.',
      linked: counts
    }));
  }

  if ((counts.publicacoes || 0) && !deletePublicacoes) {
    return res.status(409).json(ok({
      ok: false,
      error: 'Este cliente possui publicações vinculadas. Confirme a exclusão das publicações junto com o cliente.',
      linked: counts,
      can_delete_with_publicacoes: true
    }));
  }

  let deletedPublicacoes = [];
  if (deletePublicacoes) {
    const deleted = await query(
      `DELETE FROM publicacoes
       WHERE cliente_id = $1 OR data->>'cliente_id' = $1
       RETURNING registro_id`,
      [registroId]
    );
    deletedPublicacoes = deleted.rows.map(row => row.registro_id).filter(Boolean);
    if (deletedPublicacoes.length) {
      broadcastRealtime('publicacoes', 'bulk_deleted', registroId);
    }
  }

  await query('DELETE FROM clientes WHERE registro_id = $1', [registroId]);
  broadcastRealtime('clientes', 'deleted', registroId);
  res.json(ok({
    action: 'deleted',
    registro_id: registroId,
    deleted_publicacoes: deletedPublicacoes.length,
    deleted_publicacao_ids: deletedPublicacoes
  }));
});
app.post('/webhook/criar-publicacao', async (req, res) => {
  const record = await upsertPublicacao(req.body.publicacao || req.body.post || req.body);
  broadcastRealtime('publicacoes', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id }));
});
app.post('/webhook/atualizar-publicacao', async (req, res) => {
  const record = await upsertPublicacao(req.body.publicacao || req.body.post || req.body);
  broadcastRealtime('publicacoes', 'updated', record.registro_id);
  res.json(ok({ action: 'updated', registro_id: record.registro_id }));
});
app.post('/webhook/deletar-publicacao', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.publicacao?.registro_id || req.body.publicacao?.id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório');
  await query('DELETE FROM publicacoes WHERE registro_id = $1', [registroId]);
  broadcastRealtime('publicacoes', 'deleted', registroId);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});

app.post('/webhook/deletar-publicacoes', async (req, res) => {
  const rawIds =
    req.body.registro_ids ||
    req.body.publicacao_ids ||
    req.body.ids ||
    req.body.publicacoes?.map?.(item => item.registro_id || item.id) ||
    [];

  const registroIds = [...new Set(
    (Array.isArray(rawIds) ? rawIds : [rawIds])
      .map(id => String(id || '').trim())
      .filter(Boolean)
  )];

  if (!registroIds.length) fail('registro_ids obrigatório');

  const deleted = await query(
    'DELETE FROM publicacoes WHERE registro_id = ANY($1::text[]) RETURNING registro_id',
    [registroIds]
  );

  const deletedIds = deleted.rows.map(row => row.registro_id).filter(Boolean);
  if (deletedIds.length) {
    broadcastRealtime('publicacoes', 'bulk_deleted', deletedIds.join(','));
  }

  res.json(ok({
    action: 'bulk_deleted',
    deleted_count: deletedIds.length,
    registro_ids: deletedIds
  }));
});

app.post('/webhook/criar-evento', async (req, res) => {
  const record = await upsertEvento(req.body.evento || req.body.event || req.body);
  broadcastRealtime('eventos', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id }));
});
app.post('/webhook/salvar-trafego-pago', async (req, res) => {
  const record = await upsertTrafego(req.body.trafego || req.body.record || req.body);
  broadcastRealtime('trafego_pago', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id }));
});


app.post('/webhook/criar-prompt', async (req, res) => {
  const record = await upsertPromptTemplate(req.body.prompt_template || req.body.prompt || req.body);
  broadcastRealtime('prompt_templates', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/atualizar-prompt', async (req, res) => {
  const payload = req.body.prompt_template || req.body.prompt || req.body;
  const registroId = String(req.body.registro_id || payload.registro_id || payload.id || '');
  if (!registroId) fail('registro_id obrigatório para atualizar prompt');
  const record = await upsertPromptTemplate({ ...payload, id: registroId, registro_id: registroId });
  broadcastRealtime('prompt_templates', 'updated', record.registro_id);
  res.json(ok({ action: 'updated', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/deletar-prompt', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.prompt_template?.registro_id || req.body.prompt_template?.id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório para excluir prompt');
  await query('DELETE FROM prompt_templates WHERE registro_id = $1', [registroId]);
  broadcastRealtime('prompt_templates', 'deleted', registroId);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});



app.post('/webhook/salvar-caixinha', async (req, res) => {
  const record = await upsertFinanceBox(req.body.caixinha || req.body.box || req.body.finance_box || req.body);
  broadcastRealtime('finance_boxes', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/deletar-caixinha', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.caixinha?.registro_id || req.body.caixinha?.id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório para excluir caixinha');
  const linked = await query(`SELECT COUNT(*)::int AS movimentos FROM finance_movements WHERE box_id = $1 OR data->>'box_id' = $1`, [registroId]);
  const count = linked.rows?.[0]?.movimentos || 0;
  if (count > 0 && req.body.delete_movements !== true) {
    return res.status(409).json(ok({ ok: false, error: 'Esta caixinha possui movimentações. Confirme a exclusão junto com as movimentações.', linked: { movimentos: count }, can_delete_with_movements: true }));
  }
  if (count > 0) {
    await query(`DELETE FROM finance_movements WHERE box_id = $1 OR data->>'box_id' = $1`, [registroId]);
    broadcastRealtime('finance_movements', 'bulk_deleted', registroId);
  }
  await query('DELETE FROM finance_boxes WHERE registro_id = $1', [registroId]);
  broadcastRealtime('finance_boxes', 'deleted', registroId);
  res.json(ok({ action: 'deleted', registro_id: registroId, deleted_movements: count }));
});
app.post('/webhook/salvar-movimentacao-financeira', async (req, res) => {
  const record = await upsertFinanceMovement(req.body.movimentacao || req.body.movement || req.body.finance_movement || req.body);
  broadcastRealtime('finance_movements', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/deletar-movimentacao-financeira', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.movimentacao?.registro_id || req.body.movimentacao?.id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório para excluir movimentação');
  await query('DELETE FROM finance_movements WHERE registro_id = $1', [registroId]);
  broadcastRealtime('finance_movements', 'deleted', registroId);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});

app.post('/webhook/crm-criar-prospect', async (req, res) => {
  const record = await upsertCrmProspect(req.body.prospect || req.body.crm_prospect || req.body);
  broadcastRealtime('crm_prospects', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id }));
});
app.post('/webhook/crm-atualizar-prospect', async (req, res) => {
  const record = await upsertCrmProspect(req.body.prospect || req.body.crm_prospect || req.body);
  broadcastRealtime('crm_prospects', 'updated', record.registro_id);
  res.json(ok({ action: 'updated', registro_id: record.registro_id }));
});
app.post('/webhook/crm-deletar-prospect', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.prospect_id || req.body.prospect?.registro_id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório');
  await query('DELETE FROM crm_acoes WHERE prospect_id = $1', [registroId]);
  await query('DELETE FROM crm_prospects WHERE registro_id = $1', [registroId]);
  broadcastRealtime('crm_prospects', 'deleted', registroId);
  broadcastRealtime('crm_acoes', 'deleted_by_prospect', registroId);
  res.json(ok({ action: 'deleted', registro_id: registroId }));
});
app.post('/webhook/crm-criar-acao', async (req, res) => {
  const record = await upsertCrmAction(req.body.crm_action || req.body.action_record || req.body);
  broadcastRealtime('crm_acoes', 'upserted', record.registro_id, { prospect_id: record.prospect_id || '' });
  if (record.prospect_id) broadcastRealtime('crm_prospects', 'updated', record.prospect_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id }));
});
app.post('/webhook/crm-atualizar-acao', async (req, res) => {
  const record = await upsertCrmAction(req.body.crm_action || req.body.action_record || req.body);
  broadcastRealtime('crm_acoes', 'updated', record.registro_id, { prospect_id: record.prospect_id || '' });
  if (record.prospect_id) broadcastRealtime('crm_prospects', 'updated', record.prospect_id);
  res.json(ok({ action: 'updated', registro_id: record.registro_id }));
});
app.post('/webhook/crm-deletar-acao', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.id || req.body.crm_action?.registro_id || '');
  if (!registroId) fail('registro_id obrigatório');
  await query('DELETE FROM crm_acoes WHERE registro_id = $1', [registroId]);
  broadcastRealtime('crm_acoes', 'deleted', registroId);
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
  broadcastRealtime('clientes', 'upserted', clienteId);
  if (prospectId) broadcastRealtime('crm_prospects', 'converted', prospectId, { cliente_id: clienteId });
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

function triggerN8nAsync(kind, payload, fallbackEnv) {
  const url = process.env[fallbackEnv];
  if (!url) {
    query('INSERT INTO automacao_logs (tipo,payload,resposta,ok) VALUES ($1,$2,$3,$4)', [
      kind,
      payload,
      { ok: false, skipped: true, error: `Variável ${fallbackEnv} não configurada no backend.` },
      false
    ]).catch(() => {});
    return { triggered: false, skipped: true, error: `Variável ${fallbackEnv} não configurada.` };
  }

  setTimeout(async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.N8N_API_KEY || ''
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({ status: response.status }));
      const out = { ok: response.ok && data?.ok !== false, ...data };
      await query('INSERT INTO automacao_logs (tipo,payload,resposta,ok) VALUES ($1,$2,$3,$4)', [kind, payload, out, out.ok]);
    } catch (error) {
      await query('INSERT INTO automacao_logs (tipo,payload,resposta,ok) VALUES ($1,$2,$3,$4)', [
        kind,
        payload,
        { ok: false, error: error.message },
        false
      ]).catch(() => {});
    }
  }, 0);

  return { triggered: true, env: fallbackEnv };
}

app.post('/webhook/webhook-drive', async (req, res) => {
  const out = await forwardToN8n('drive', req.body, 'N8N_DRIVE_WEBHOOK_URL');
  const postId = req.body.post?.registro_id || req.body.post?.id || req.body.publicacao?.registro_id || '';
  const url = out.drive_folder_url || out.banco_google || out.url || '';
  if (out.ok && postId && url) {
    const found = await query('SELECT data FROM publicacoes WHERE registro_id = $1', [postId]);
    if (found.rows[0]) {
      await upsertPublicacao({ ...found.rows[0].data, drive_folder_url: url });
      broadcastRealtime('publicacoes', 'updated', postId);
    }
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
  if (result.rowCount) broadcastRealtime('publicacoes', 'bulk_updated', '', { updated: result.rowCount });
  res.json(ok({ updated: result.rowCount, range: { inicio: start.toISOString().slice(0,10), fim: end.toISOString().slice(0,10) } }));
});

app.use(express.static(ROOT_DIR));
app.get('*', async (_req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Erro interno' });
});

async function repairCrudWrapperRows() {
  const clientWrappers = await query(`SELECT registro_id, data FROM clientes WHERE data ? 'client'`);
  for (const row of clientWrappers.rows) {
    const client = row.data?.client;
    const targetId = String(client?.registro_id || client?.id || '');
    if (client && targetId) {
      await upsertCliente({ ...client, id: targetId, registro_id: targetId, updated_at: nowIso() });
      if (row.registro_id !== targetId) await query('DELETE FROM clientes WHERE registro_id = $1', [row.registro_id]);
    }
  }

  const collaboratorWrappers = await query(`SELECT registro_id, data FROM colaboradores WHERE data ? 'collaborator'`);
  for (const row of collaboratorWrappers.rows) {
    const collaborator = row.data?.collaborator;
    const targetId = String(collaborator?.registro_id || collaborator?.id || '');
    if (collaborator && targetId) {
      await upsertColaborador({ ...collaborator, id: targetId, registro_id: targetId, updated_at: nowIso() });
      if (row.registro_id !== targetId) await query('DELETE FROM colaboradores WHERE registro_id = $1', [row.registro_id]);
    }
  }
}

async function seedIfEmpty() {
  const count = await query('SELECT COUNT(*)::int AS count FROM colaboradores');
  if (count.rows[0].count === 0) {
    await upsertColaborador({ registro_id: 'matheus', id: 'matheus', nome: 'Matheus', usuario: 'Matheus', senha: 'Leme123', cargo: 'Direção / Produção', cor: '#163f63', status: 'Ativo' });
    await upsertColaborador({ registro_id: 'luis', id: 'luis', nome: 'Luis', usuario: 'Luis', senha: 'Leme123', cargo: 'Direção / Produção', cor: '#4d95c6', status: 'Ativo' });
  }

  const promptCount = await query('SELECT COUNT(*)::int AS count FROM prompt_templates');
  if (promptCount.rows[0].count === 0) {
    await upsertPromptTemplate({
      registro_id: 'prompt-reels-medico',
      id: 'prompt-reels-medico',
      nome: 'Roteiro de Reels',
      formato: 'Reels',
      status: 'Ativo',
      ordem: 1,
      conteudo: 'Atue como social media e copywriter especialista em marketing médico. Crie um roteiro para Reels para {{nome_cliente}}.\n\nCliente: {{nome_cliente}}\nEspecialidade: {{especialidade}}\nTema/título: {{titulo}}\nFormato: {{formato}}\nData prevista: {{data_publicacao}}\n\nEstrutura: gancho inicial forte, desenvolvimento claro e CTA sutil. Use linguagem humana, estratégica e sem tom robótico.'
    });
    await upsertPromptTemplate({
      registro_id: 'prompt-carrossel-medico',
      id: 'prompt-carrossel-medico',
      nome: 'Carrossel médico',
      formato: 'Carrossel',
      status: 'Ativo',
      ordem: 2,
      conteudo: 'Atue como social media e copywriter especialista em marketing médico. Crie um carrossel para Instagram para {{nome_cliente}}.\n\nCliente: {{nome_cliente}}\nEspecialidade: {{especialidade}}\nTema: {{titulo}}\nFormato: {{formato}}\n\nCrie um conteúdo pronto para publicação, humano, estratégico e criativo. Evite linguagem genérica e tom robótico.'
    });
    await upsertPromptTemplate({
      registro_id: 'prompt-legenda-post-unico',
      id: 'prompt-legenda-post-unico',
      nome: 'Legenda de post único',
      formato: 'Post único',
      status: 'Ativo',
      ordem: 3,
      conteudo: 'Atue como copywriter especialista em marketing médico. Crie uma legenda para Instagram para {{nome_cliente}}.\n\nCliente: {{nome_cliente}}\nEspecialidade: {{especialidade}}\nTema do post: {{titulo}}\nFormato: {{formato}}\n\nA legenda deve ter gancho forte, desenvolvimento humano, conexão com a realidade do paciente e CTA sutil.'
    });
  }
}

await runMigrations();
await repairCrudWrapperRows();
await seedIfEmpty();
app.listen(PORT, () => console.log(`Sistema LEME v83 rodando na porta ${PORT} com tempo real ativo e CRUD revisado`));
