import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { query, runMigrations, pool } from './db.js';
import { registerSocialFeed } from './social-feed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const app = express();

for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  const original = app[method].bind(app);
  app[method] = (...args) => {
    const wrapped = args.map(arg => {
      if (typeof arg !== 'function') return arg;
      return (req, res, next) => Promise.resolve(arg(req, res, next)).catch(next);
    });
    return original(...wrapped);
  };
}

const PORT = Number(process.env.PORT || 3000);
const realtimeClients = new Set();
const DEFAULT_N8N_CHAT_WEBHOOK_URL = 'https://n8n.adati.app.br/webhook/chat-ia-leme-teste';
const DEFAULT_N8N_ANALYTICS_REPORT_WEBHOOK = 'https://n8n.adati.app.br/webhook/leme-analytics-report';
const SYSTEM_TIME_ZONE = 'America/Sao_Paulo';
const ANALYTICS_API_PREFIX = '/wp-json/leme/v1/analytics';

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

app.use(rateLimit({ windowMs: 60_000, max: 600, keyPrefix: 'all' }));

app.post('/api/login', rateLimit({ windowMs: 10 * 60_000, max: 15, keyPrefix: 'login' }), async (req, res) => {
  const usuario = normalizeLogin(req.body.usuario || req.body.user || req.body.email || '');
  const senha = String(req.body.senha || req.body.password || '');
  if (!usuario || !senha) return res.status(400).json({ ok: false, error: 'Informe usuário e senha.' });

  const found = await query(
    `SELECT registro_id, nome, usuario, senha, senha_hash, status, data
     FROM colaboradores
     WHERE lower(usuario) = $1 OR lower(nome) = $1 OR lower(COALESCE(data->>'email','')) = $1
     LIMIT 1`,
    [usuario]
  );

  const row = found.rows[0];
  if (!row || String(row.status || row.data?.status || 'Ativo') !== 'Ativo') {
    return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
  }

  const data = row.data || {};
  const storedHash = data.senha_hash || data.password_hash || row.senha_hash || '';
  const storedPlain = data.senha || row.senha || '';
  const valid = verifyPassword(senha, storedHash || storedPlain);
  if (!valid) return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });

  if (!storedHash && storedPlain) {
    await upsertColaborador({ ...data, id: row.registro_id, registro_id: row.registro_id, senha });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sessionTokenHash(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * Number(process.env.SESSION_DAYS || 30));
  await query(
    'INSERT INTO user_sessions (token_hash, colaborador_id, usuario, expires_at) VALUES ($1,$2,$3,$4)',
    [tokenHash, row.registro_id, row.usuario || data.usuario || data.nome || '', expiresAt.toISOString()]
  );

  await query('DELETE FROM user_sessions WHERE expires_at < now() OR revoked_at IS NOT NULL').catch(() => {});

  res.json(ok({
    token,
    expires_at: expiresAt.toISOString(),
    colaborador: sanitizeColaborador({ ...data, id: row.registro_id, registro_id: row.registro_id, nome: row.nome || data.nome, usuario: row.usuario || data.usuario, status: row.status || data.status || 'Ativo' })
  }));
});

// O Google retorna para esta rota fora de /api. Assim, o callback OAuth não
// depende do token da sessão do SPA, enquanto o state de uso único protege a
// vinculação da conta.
app.get('/google-business-callback', googleBusinessOAuthCallbackHandler);
// Compatibilidade com a URI usada no antigo Local Radar.
app.get('/api/google/callback', googleBusinessOAuthCallbackHandler);

app.use(['/api', '/webhook'], (req, res, next) => Promise.resolve(requireAuth(req, res, next)).catch(next));

registerSocialFeed(app,{
  query,pool,getClientRow,getClientIntegration,normalizeSiteUrl,encryptIntegrationSecret,decryptIntegrationSecret,
  maskIntegrationSecret,normalizeSubmittedIntegrationSecret,fetchWithTimeout,broadcastRealtime
});

app.post('/api/logout', async (req, res) => {
  const token = extractSessionToken(req);
  if (token) await query('UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1', [sessionTokenHash(token)]);
  res.json(ok({ action: 'logout' }));
});

function nowIso() { return new Date().toISOString(); }
function idFrom(record = {}) { return String(record.registro_id || record.id || crypto.randomUUID()); }
function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}
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

function integrationEncryptionKey() {
  const material = String(
    process.env.CLIENT_INTEGRATION_ENCRYPTION_KEY ||
    process.env.TOKEN_ENCRYPTION_SECRET ||
    process.env.N8N_LEME_SECRET ||
    process.env.N8N_API_KEY ||
    ''
  ).trim();
  if (!material) fail('Configure CLIENT_INTEGRATION_ENCRYPTION_KEY no backend.', 503);
  return crypto.createHash('sha256').update(material).digest();
}

function encryptIntegrationSecret(value = '') {
  const plain = String(value || '').trim();
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', integrationEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

function decryptIntegrationSecret(value = '') {
  const encoded = String(value || '').trim();
  if (!encoded) return '';
  if (!encoded.startsWith('v1:')) return encoded;
  try {
    const [, ivText, tagText, bodyText] = encoded.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', integrationEncryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(bodyText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    fail('Não foi possível abrir uma credencial da integração. Confira a chave de criptografia do backend.', 503);
  }
}

function maskIntegrationSecret(value = '') {
  const secret = String(value || '');
  if (!secret) return '';
  if (secret.length <= 8) return `${secret.slice(0, 2)}••••${secret.slice(-2)}`;
  const prefix = secret.startsWith('leme_sk_') ? 'leme_sk_' : secret.slice(0, 4);
  return `${prefix}••••••••••••${secret.slice(-4)}`;
}

function normalizeSubmittedIntegrationSecret(value = '') {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';
  // A interface exibe a credencial mascarada. Nunca trate essa máscara como uma Key nova.
  if (/[\u2022\u25cf]/u.test(candidate) || /\*{4,}/.test(candidate)) return '';
  return candidate;
}

function normalizeSiteUrl(value = '') {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail('Informe uma URL de site válida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) fail('A URL do site precisa usar HTTP ou HTTPS.');
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') fail('Em produção, a URL do site precisa usar HTTPS.');
  if (parsed.username || parsed.password) fail('A URL do site não pode conter usuário ou senha.');
  const hostname = parsed.hostname.toLowerCase();
  const ipv6 = hostname.replace(/^\[|\]$/g, '');
  const privateHost = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') ||
    ipv6 === '::' || ipv6 === '::1' || /^f[cd][0-9a-f:]*$/i.test(ipv6) || /^fe[89ab][0-9a-f:]*$/i.test(ipv6) || /^::ffff:/i.test(ipv6) ||
    /^0\./.test(hostname) || /^10\./.test(hostname) || /^127\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || /^100\.(6[4-9]|[789]\d|1[01]\d|12[0-7])\./.test(hostname) ||
    /^198\.(1[89])\./.test(hostname) || /^(22[4-9]|23\d|24\d|25[0-5])\./.test(hostname);
  if (privateHost) fail('A URL do site não pode apontar para um endereço interno.');
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/wp-admin\/?$/i, '').replace(/\/+$/, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'sim', 'yes', 'ativo', 'on'].includes(String(value).toLowerCase());
}

function saoPauloParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYSTEM_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((out, item) => ({ ...out, [item.type]: item.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

function isoDateFromUtc(date) {
  return date.toISOString().slice(0, 10);
}

function shiftIsoDate(value, days) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return isoDateFromUtc(date);
}

function validateAnalyticsPeriod(startValue, endValue, maxDays = 370) {
  const startDate = dateOnly(startValue);
  const endDate = dateOnly(endValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) {
    fail('Informe a data inicial e a data final do relatório.');
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || isoDateFromUtc(start) !== startDate || isoDateFromUtc(end) !== endDate || start > end) {
    fail('O período informado é inválido.');
  }
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > maxDays) fail(`O período máximo é de ${maxDays} dias.`);
  return { startDate, endDate, days };
}

function previousClosedMonth(reference = new Date()) {
  const local = saoPauloParts(reference);
  const start = new Date(Date.UTC(local.year, local.month - 2, 1));
  const end = new Date(Date.UTC(local.year, local.month - 1, 0));
  return { startDate: isoDateFromUtc(start), endDate: isoDateFromUtc(end), periodKey: isoDateFromUtc(start).slice(0, 7) };
}

function analyticsPeriodKey(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const expectedEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  if (start.getUTCDate() === 1 && endDate === isoDateFromUtc(expectedEnd)) return startDate.slice(0, 7);
  return `${startDate}_${endDate}`;
}

async function getClientRow(clientId) {
  const found = await query('SELECT registro_id, nome_cliente, data FROM clientes WHERE registro_id = $1 LIMIT 1', [String(clientId || '')]);
  if (!found.rows[0]) fail('Cliente não encontrado.', 404);
  return {
    ...(found.rows[0].data || {}),
    id: found.rows[0].registro_id,
    registro_id: found.rows[0].registro_id,
    nome_cliente: found.rows[0].nome_cliente || found.rows[0].data?.nome_cliente || 'Cliente'
  };
}

async function getClientIntegration(clientId, required = false) {
  const found = await query('SELECT * FROM client_integrations WHERE client_id = $1 LIMIT 1', [String(clientId || '')]);
  if (!found.rows[0] && required) fail('LEME Analytics ainda não está conectado para este cliente.', 409);
  return found.rows[0] || null;
}

function nextReportSendAt(integration) {
  if (!integration?.report_automation_enabled) return null;
  const local = saoPauloParts();
  const day = Math.min(28, Math.max(1, Number(integration.report_day || 5)));
  const time = String(integration.report_time || '09:00').slice(0, 5);
  let year = local.year;
  let month = local.month;
  const candidateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (candidateKey < local.date || (candidateKey === local.date && time <= local.time)) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time}:00-03:00`;
}

function publicClientIntegration(integration) {
  const row = integration || {};
  const permalink = decryptIntegrationSecret(row.permalink_key_encrypted || '');
  const analytics = decryptIntegrationSecret(row.analytics_key_encrypted || '');
  return {
    client_id: row.client_id || '',
    site_url: row.site_url || '',
    has_permalink_key: Boolean(permalink),
    permalink_key_masked: maskIntegrationSecret(permalink),
    has_analytics_key: Boolean(analytics),
    analytics_key_masked: maskIntegrationSecret(analytics),
    report_automation_enabled: Boolean(row.report_automation_enabled),
    report_day: Number(row.report_day || 5),
    report_time: String(row.report_time || '09:00').slice(0, 5),
    analytics_status: row.analytics_status || (analytics ? 'unchecked' : 'not_configured'),
    analytics_status_checked_at: row.analytics_status_checked_at || null,
    analytics_status_message: row.analytics_status_message || '',
    last_report_status: row.last_report_status || '',
    last_report_sent_at: row.last_report_sent_at || null,
    last_report_error: row.last_report_error || '',
    next_report_send_at: nextReportSendAt(row)
  };
}

function normalizeLogin(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function passwordHash(password = '') {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password = '', stored = '') {
  const candidate = String(password || '');
  const value = String(stored || '');
  if (!value) return false;
  if (!value.startsWith('scrypt$')) return candidate === value;
  const [, salt, expectedHex] = value.split('$');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(candidate, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sessionTokenHash(token = '') {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function extractSessionToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-session-token'] || req.query?.token || '').trim();
}

function sanitizeColaborador(record = {}) {
  const clean = { ...asJson(record) };
  delete clean.senha;
  delete clean.password;
  delete clean.senha_hash;
  delete clean.password_hash;
  return clean;
}

function sanitizeRows(table, rows) {
  const data = rowsData(rows);
  if (table === 'colaboradores') return data.map(sanitizeColaborador);
  return data;
}

function isN8nApiKey(req) {
  const configured = String(process.env.N8N_API_KEY || '').trim();
  const received = String(req.headers['x-api-key'] || req.query?.api_key || '').trim();
  return Boolean(configured && received && configured === received);
}

function safeSecretEqual(received = '', configured = '') {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(configured || ''));
  return Boolean(left.length && right.length && left.length === right.length && crypto.timingSafeEqual(left, right));
}

function isLemeN8nSecret(req) {
  const configured = String(process.env.N8N_LEME_SECRET || '').trim();
  const received = String(req.headers['x-leme-n8n-key'] || '').trim();
  return safeSecretEqual(received, configured);
}

async function requireAuth(req, res, next) {
  if (req.path === '/login') return next();
  if (String(req.originalUrl || '').startsWith('/api/automations/site-analytics') && isLemeN8nSecret(req)) {
    req.auth = { type: 'n8n_analytics', colaborador_id: 'n8n' };
    return next();
  }
  if (isN8nApiKey(req)) {
    req.auth = { type: 'api_key', colaborador_id: 'n8n' };
    return next();
  }

  const token = extractSessionToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Sessão obrigatória. Faça login novamente.' });

  const tokenHash = sessionTokenHash(token);
  const found = await query(
    `SELECT token_hash, colaborador_id, usuario FROM user_sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );

  if (!found.rows[0]) return res.status(401).json({ ok: false, error: 'Sessão expirada. Faça login novamente.' });

  req.auth = { type: 'session', colaborador_id: found.rows[0].colaborador_id, usuario: found.rows[0].usuario };
  query('UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = $1', [tokenHash]).catch(() => {});
  return next();
}

const requestBuckets = new Map();
function rateLimit({ windowMs = 60000, max = 300, keyPrefix = 'general' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const bucket = requestBuckets.get(key) || { start: now, count: 0 };
    if (now - bucket.start > windowMs) {
      bucket.start = now;
      bucket.count = 0;
    }
    bucket.count += 1;
    requestBuckets.set(key, bucket);
    if (bucket.count > max) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' });
    return next();
  };
}

async function upsertColaborador(input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  const existing = await query('SELECT data, senha_hash, senha FROM colaboradores WHERE registro_id = $1 LIMIT 1', [registroId]).catch(() => ({ rows: [] }));
  const existingData = existing.rows?.[0]?.data || {};
  const existingHash = existingData.senha_hash || existingData.password_hash || existing.rows?.[0]?.senha_hash || '';
  const existingPlain = existingData.senha || existing.rows?.[0]?.senha || '';
  let senhaHash = record.senha_hash || record.password_hash || existingHash || '';
  if (record.senha || record.password) senhaHash = passwordHash(record.senha || record.password);
  if (!senhaHash && existingPlain) senhaHash = passwordHash(existingPlain);

  delete record.senha;
  delete record.password;
  record.senha_hash = senhaHash;
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await query(`INSERT INTO colaboradores (registro_id,nome,usuario,senha,senha_hash,cargo,cor,status,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (registro_id) DO UPDATE SET nome=$2,usuario=$3,senha=$4,senha_hash=$5,cargo=$6,cor=$7,status=$8,data=$9,updated_at=$11`, [
      registroId,
      record.nome || record.usuario || 'Colaborador sem nome',
      record.usuario || record.nome || '',
      '',
      senhaHash,
      record.cargo || '',
      record.cor || '#163f63',
      record.status || 'Ativo',
      record,
      record.created_at,
      record.updated_at
    ]);
  return sanitizeColaborador(record);
}

async function upsertCliente(input) {
  const record = { ...asJson(input) };
  for (const secretField of [
    'permalinkKey', 'permalink_key', 'analyticsKey', 'analytics_key',
    'lemeApiKey', 'leme_api_key', 'permalink_key_encrypted', 'analytics_key_encrypted'
  ]) delete record[secretField];
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

async function upsertLemeProfile(input) {
  const record = { ...asJson(input) };
  const registroId = 'leme';
  record.id = registroId;
  record.registro_id = registroId;
  record.nome = record.nome || 'LEME';
  record.status = 'Ativo';
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;

  await query(`INSERT INTO leme_profile (registro_id,nome,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (registro_id) DO UPDATE SET nome=$2,data=$3,updated_at=$5`, [
      registroId,
      record.nome,
      record,
      record.created_at,
      record.updated_at
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

async function upsertEvento(input, db = null) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  const execute = db?.query ? db.query.bind(db) : query;
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  const rawDate = record.data || record.data_evento || record.data_inicio || '';
  await execute(`INSERT INTO eventos (registro_id,colaborador_id,cliente_id,titulo,tipo,data_evento,hora,status,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (registro_id) DO UPDATE SET colaborador_id=$2,cliente_id=$3,titulo=$4,tipo=$5,data_evento=$6,hora=$7,status=$8,data=$9,updated_at=$11`, [
      registroId, record.colaborador_id || record.responsavel_id || '', record.cliente_id || '', record.titulo || 'Evento sem título', record.tipo || 'Outro', dateOnly(rawDate), timeOnly(record.hora || String(record.data_inicio || '').slice(11, 16)), record.status || 'Agendado', record, record.created_at, record.updated_at
    ]);
  return record;
}

function normalizeRecordingReminders(value) {
  let items = value;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = items.split(',');
    }
  }
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map(item => Number(item)).filter(item => [15, 10, 7].includes(item)))];
}

function addDaysToDateString(value, amount) {
  const date = dateOnly(value);
  const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const target = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  target.setUTCDate(target.getUTCDate() + Number(amount || 0));
  return target.toISOString().slice(0, 10);
}

function daysBetweenDateStrings(futureValue, currentValue) {
  const future = dateOnly(futureValue);
  const current = dateOnly(currentValue);
  const futureMatch = String(future || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const currentMatch = String(current || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!futureMatch || !currentMatch) return null;
  const futureTime = Date.UTC(Number(futureMatch[1]), Number(futureMatch[2]) - 1, Number(futureMatch[3]));
  const currentTime = Date.UTC(Number(currentMatch[1]), Number(currentMatch[2]) - 1, Number(currentMatch[3]));
  return Math.round((futureTime - currentTime) / 86400000);
}

async function upsertGravacao(input, db = null) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  const execute = db?.query ? db.query.bind(db) : query;
  record.id = registroId;
  record.registro_id = registroId;
  record.cliente_id = String(record.cliente_id || record.client_id || '').trim();
  record.responsavel_id = String(record.responsavel_id || record.colaborador_id || '').trim();
  record.data_gravacao = dateOnly(record.data_gravacao || record.data || record.data_evento);
  record.hora = timeOnly(record.hora);
  record.videos_gravados = Math.max(0, Number.parseInt(record.videos_gravados || record.quantidade_videos || 0, 10) || 0);
  record.status = String(record.status || 'Prevista');
  record.evento_id = String(record.evento_id || '').trim();
  record.avisos_enviados = normalizeRecordingReminders(record.avisos_enviados);
  record.observacoes = String(record.observacoes || '');
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;

  if (!record.cliente_id) fail('cliente_id obrigatório para salvar gravação');

  await execute(`INSERT INTO gravacoes (registro_id,cliente_id,responsavel_id,data_gravacao,hora,videos_gravados,status,evento_id,avisos_enviados,observacoes,data,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (registro_id) DO UPDATE SET cliente_id=$2,responsavel_id=$3,data_gravacao=$4,hora=$5,videos_gravados=$6,status=$7,evento_id=$8,avisos_enviados=$9,observacoes=$10,data=$11,updated_at=$13`, [
      registroId,
      record.cliente_id,
      record.responsavel_id,
      record.data_gravacao,
      record.hora,
      record.videos_gravados,
      record.status,
      record.evento_id,
      JSON.stringify(record.avisos_enviados),
      record.observacoes,
      record,
      record.created_at,
      record.updated_at
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

function parseMoneyServer(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function getClientCollaboratorSplitsServer(cliente = {}) {
  const raw = cliente.finance_collaborator_splits || cliente.repasses_colaboradores || cliente.colaborador_repasses || cliente.divisao_colaboradores || {};
  if (Array.isArray(raw)) {
    return raw.reduce((acc, item) => {
      const id = String(item.colaborador_id || item.collaborator_id || item.id || '').trim();
      if (id) acc[id] = parseMoneyServer(item.valor || item.value || item.repasse || 0);
      return acc;
    }, {});
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).reduce((acc, [id, value]) => {
      const canonicalId = String(id || '').trim();
      if (canonicalId) acc[canonicalId] = parseMoneyServer(value);
      return acc;
    }, {});
  }
  return {};
}

function financeDefaultBoxes() {
  const now = nowIso();
  return [
    { id: 'finance_box_imposto', registro_id: 'finance_box_imposto', nome: 'Imposto', categoria: 'interno', tipo: 'imposto', percentual: 6, meta_valor: 0, status: 'Ativo', ordem: 1, created_at: now, updated_at: now },
    { id: 'finance_box_trafego_leme', registro_id: 'finance_box_trafego_leme', nome: 'Tráfego pago da LEME', categoria: 'interno', tipo: 'trafego_leme', percentual: 5, meta_valor: 0, status: 'Ativo', ordem: 2, created_at: now, updated_at: now },
    { id: 'finance_box_salarios', registro_id: 'finance_box_salarios', nome: 'Salários da equipe', categoria: 'interno', tipo: 'salarios', percentual: 0, meta_valor: 0, status: 'Ativo', ordem: 3, created_at: now, updated_at: now },
    { id: 'finance_box_saldo', registro_id: 'finance_box_saldo', nome: 'Saldo livre', categoria: 'interno', tipo: 'saldo', percentual: 0, meta_valor: 0, status: 'Ativo', ordem: 4, created_at: now, updated_at: now },
    { id: 'finance_box_mensalidades', registro_id: 'finance_box_mensalidades', nome: 'Mensalidades', categoria: 'interno', tipo: 'mensalidades', percentual: 0, meta_valor: 0, status: 'Ativo', ordem: 5, created_at: now, updated_at: now }
  ];
}

const PROTECTED_FINANCE_BOX_IDS = new Set(financeDefaultBoxes().map(box => box.registro_id));

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function txUpsertFinanceBox(client, input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await client.query(`INSERT INTO finance_boxes (registro_id,nome,categoria,tipo,cliente_id,percentual,meta_valor,status,ordem,data,created_at,updated_at)
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

async function txUpsertFinanceMovement(client, input) {
  const record = { ...asJson(input) };
  const registroId = idFrom(record);
  record.id = registroId;
  record.registro_id = registroId;
  record.valor = Number(record.valor || 0);
  record.updated_at = record.updated_at || nowIso();
  record.created_at = record.created_at || record.updated_at;
  await client.query(`INSERT INTO finance_movements (registro_id,box_id,cliente_id,tipo,valor,descricao,mes_referencia,data_movimento,origem,status,data,created_at,updated_at)
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

async function ensureFinanceDefaultBoxes(client) {
  for (const box of financeDefaultBoxes()) await txUpsertFinanceBox(client, box);
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
  return sanitizeRows(table, result.rows);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapWordPressAnalyticsPayload(payload) {
  if (payload && payload.success === true && payload.data !== undefined) return payload.data;
  if (payload && payload.data !== undefined && Object.keys(payload).length === 1) return payload.data;
  return payload;
}

async function requestWordPressAnalytics(integration, endpoint, params = {}) {
  const siteUrl = normalizeSiteUrl(integration?.site_url || '');
  const analyticsKey = decryptIntegrationSecret(integration?.analytics_key_encrypted || '');
  if (!siteUrl || !analyticsKey) fail('LEME Analytics ainda não está conectado para este cliente.', 409);

  const analyticsPath = `${ANALYTICS_API_PREFIX}/${String(endpoint || '').replace(/^\/+/, '')}`;
  const prettyUrl = new URL(`${siteUrl}${analyticsPath}`);
  const fallbackUrl = new URL(`${siteUrl}/`);
  fallbackUrl.searchParams.set('rest_route', analyticsPath.replace(/^\/wp-json/, ''));
  const urls = [prettyUrl, fallbackUrl];
  urls.forEach((url) => Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }));

  let response;
  let payload = {};
  let connectionError;
  for (let index = 0; index < urls.length; index += 1) {
    try {
      const candidate = await fetchWithTimeout(urls[index], {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-LEME-KEY': analyticsKey,
          'User-Agent': 'Sistema-LEME/107.3'
        }
      });
      const candidatePayload = await candidate.json().catch(() => ({}));
      if (candidate.status === 404 && index === 0) continue;
      response = candidate;
      payload = candidatePayload;
      break;
    } catch (error) {
      connectionError = error;
    }
  }
  if (!response) {
    const error = connectionError;
    const message = error?.name === 'AbortError'
      ? 'O site demorou para responder.'
      : 'Não foi possível acessar o site do cliente.';
    const out = new Error(message);
    out.status = 502;
    out.code = 'analytics_connection_failed';
    throw out;
  }

  if (!response.ok) {
    const out = new Error(
      response.status === 401 || response.status === 403
        ? 'A API Key do LEME Analytics é inválida.'
        : response.status === 404
          ? 'O plugin LEME Analytics não foi encontrado no site.'
          : payload?.message || payload?.error || `O site respondeu com erro ${response.status}.`
    );
    // 422 diferencia uma Key WordPress inválida de uma sessão expirada do Sistema LEME.
    out.status = response.status === 401 || response.status === 403 ? 422 : 502;
    out.code = response.status === 401 || response.status === 403
      ? 'analytics_key_invalid'
      : response.status === 404
        ? 'analytics_plugin_not_found'
        : 'analytics_connection_failed';
    throw out;
  }
  return unwrapWordPressAnalyticsPayload(payload);
}

function analyticsItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function fetchAnalyticsBundle(integration, startDate, endDate) {
  const common = { start_date: startDate, end_date: endDate };
  const [summary, timelineRaw, pagesRaw, citiesRaw, statesRaw, sourcesRaw, devicesRaw] = await Promise.all([
    requestWordPressAnalytics(integration, 'summary', common),
    requestWordPressAnalytics(integration, 'timeline', common),
    requestWordPressAnalytics(integration, 'pages', { ...common, page: 1, per_page: 100, orderby: 'views', order: 'desc' }),
    requestWordPressAnalytics(integration, 'cities', { ...common, page: 1, per_page: 100 }),
    requestWordPressAnalytics(integration, 'states', common),
    requestWordPressAnalytics(integration, 'sources', common),
    requestWordPressAnalytics(integration, 'devices', common)
  ]);
  return {
    period: { start_date: startDate, end_date: endDate, key: analyticsPeriodKey(startDate, endDate) },
    summary: summary || {},
    timeline: analyticsItems(timelineRaw),
    pages: analyticsItems(pagesRaw),
    pages_pagination: pagesRaw?.pagination || null,
    cities: analyticsItems(citiesRaw),
    cities_pagination: citiesRaw?.pagination || null,
    states: analyticsItems(statesRaw),
    sources: analyticsItems(sourcesRaw),
    devices: analyticsItems(devicesRaw),
    generated_at: nowIso()
  };
}

async function analyticsBundleForReport(clientId, integration, startDate, endDate) {
  const closed = endDate < saoPauloParts().date;
  if (closed) {
    const existing = await query(
      `SELECT data FROM analytics_snapshots
       WHERE client_id = $1 AND start_date = $2 AND end_date = $3 AND is_closed = true
       LIMIT 1`,
      [clientId, startDate, endDate]
    );
    if (existing.rows[0]?.data) return { ...existing.rows[0].data, snapshot: true };
  }

  const bundle = await fetchAnalyticsBundle(integration, startDate, endDate);
  if (closed) {
    await query(
      `INSERT INTO analytics_snapshots (client_id,period_key,start_date,end_date,is_closed,data,updated_at)
       VALUES ($1,$2,$3,$4,true,$5,now())
       ON CONFLICT (client_id,start_date,end_date)
       DO UPDATE SET period_key=$2,is_closed=true,data=$5,updated_at=now()`,
      [clientId, analyticsPeriodKey(startDate, endDate), startDate, endDate, bundle]
    );
  }
  return bundle;
}

function deliveryPublic(row) {
  return {
    id: row.id,
    client_id: row.client_id,
    start_date: dateOnly(row.start_date),
    end_date: dateOnly(row.end_date),
    trigger_type: row.trigger_type,
    delivery_mode: row.delivery_mode,
    requested_by: row.requested_by,
    status: row.status,
    n8n_execution_id: row.n8n_execution_id,
    error_code: row.error_code,
    error_message: row.error_message,
    file_reference: row.file_reference,
    sent_at: row.sent_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function createAnalyticsDelivery({
  clientId, startDate, endDate, triggerType = 'manual', deliveryMode = 'whatsapp',
  recipientType = 'leme_group', recipient = '', requestedBy = '', dedupeKey = null
}) {
  const result = await query(
    `INSERT INTO analytics_report_deliveries
      (client_id,start_date,end_date,trigger_type,delivery_mode,recipient_type,recipient,requested_by,status,dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING *`,
    [clientId, startDate, endDate, triggerType, deliveryMode, recipientType, recipient, requestedBy, dedupeKey]
  );
  if (result.rows[0]) return { created: true, delivery: result.rows[0] };
  if (dedupeKey) {
    const existing = await query('SELECT * FROM analytics_report_deliveries WHERE dedupe_key = $1 LIMIT 1', [dedupeKey]);
    return { created: false, delivery: existing.rows[0] || null };
  }
  return { created: false, delivery: null };
}

async function updateAnalyticsDelivery(deliveryId, patch = {}) {
  const status = String(patch.status || '').trim();
  const allowedStatuses = ['pending', 'processing', 'sent', 'failed'];
  if (!allowedStatuses.includes(status)) fail('Status de relatório inválido.');
  const result = await query(
    `UPDATE analytics_report_deliveries SET
       status=CASE WHEN status IN ('sent','failed') AND $2 IN ('pending','processing') THEN status ELSE $2 END,
       n8n_execution_id=COALESCE(NULLIF($3,''),n8n_execution_id),
       error_code=CASE WHEN status IN ('sent','failed') AND $2 IN ('pending','processing') THEN error_code ELSE $4 END,
       error_message=CASE WHEN status IN ('sent','failed') AND $2 IN ('pending','processing') THEN error_message ELSE $5 END,
       file_reference=COALESCE(NULLIF($6,''),file_reference),
       sent_at=CASE WHEN $2='sent' THEN COALESCE(sent_at,now()) ELSE sent_at END,
       updated_at=now()
     WHERE id=$1 RETURNING *`,
    [deliveryId, status, String(patch.n8n_execution_id || ''), String(patch.error_code || ''), String(patch.error_message || ''), String(patch.file_reference || '')]
  );
  if (!result.rows[0]) fail('Execução de relatório não encontrada.', 404);
  const delivery = result.rows[0];
  const effectiveStatus = delivery.status;
  await query(
    `UPDATE client_integrations SET
       last_report_status=$2,
       last_report_sent_at=CASE WHEN $2='sent' THEN now() ELSE last_report_sent_at END,
       last_report_error=$3,
       updated_at=now()
     WHERE client_id=$1`,
    [delivery.client_id, effectiveStatus, effectiveStatus === 'failed' ? String(delivery.error_message || '') : '']
  );
  broadcastRealtime('analytics_report_deliveries', 'updated', String(delivery.id), { client_id: delivery.client_id, status: effectiveStatus });
  return delivery;
}

async function callAnalyticsN8n(delivery) {
  const url = String(process.env.N8N_ANALYTICS_REPORT_WEBHOOK || DEFAULT_N8N_ANALYTICS_REPORT_WEBHOOK).trim();
  const secret = String(process.env.N8N_LEME_SECRET || '').trim();
  if (!secret) fail('Configure N8N_LEME_SECRET no backend.', 503);
  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LEME-N8N-KEY': secret },
      body: JSON.stringify({
        action: 'send_site_analytics_report',
        trigger: delivery.trigger_type,
        delivery_id: String(delivery.id),
        client_id: delivery.client_id,
        start_date: dateOnly(delivery.start_date),
        end_date: dateOnly(delivery.end_date),
        requested_by: delivery.requested_by
      })
    }, 10000);
  } catch (error) {
    await updateAnalyticsDelivery(delivery.id, { status: 'failed', error_code: 'n8n_unavailable', error_message: 'O n8n não respondeu ao pedido.' });
    throw Object.assign(new Error('O n8n não respondeu ao pedido.'), { status: 502 });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    const message = result?.error || result?.message || `O n8n respondeu ${response.status}.`;
    await updateAnalyticsDelivery(delivery.id, { status: 'failed', error_code: 'n8n_rejected', error_message: message });
    fail(message, 502);
  }
  return updateAnalyticsDelivery(delivery.id, { status: 'processing', n8n_execution_id: result.execution_id || '' });
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
app.post('/webhook/listar-informacoes-leme', async (_req, res) => res.json(ok({ data: await listTable('leme_profile') })));
app.post('/webhook/listar-publicacoes', async (_req, res) => res.json(ok({ data: await listTable('publicacoes') })));
app.post('/webhook/listar-eventos', async (_req, res) => res.json(ok({ data: await listTable('eventos') })));
app.post('/webhook/listar-gravacoes', async (_req, res) => res.json(ok({ data: await listTable('gravacoes') })));
app.post('/webhook/listar-trafego-pago', async (_req, res) => res.json(ok({ data: await listTable('trafego_pago') })));
app.post('/webhook/listar-prompts', async (_req, res) => res.json(ok({ data: await listTable('prompt_templates') })));
app.post('/webhook/listar-caixinhas', async (_req, res) => res.json(ok({ data: await listTable('finance_boxes') })));
app.post('/webhook/listar-movimentacoes-financeiras', async (_req, res) => res.json(ok({ data: await listTable('finance_movements') })));
app.post('/webhook/crm-listar-prospects', async (_req, res) => res.json(ok({ data: await listTable('crm_prospects') })));
app.post('/webhook/crm-listar-acoes', async (_req, res) => res.json(ok({ data: await listTable('crm_acoes') })));

app.get('/api/sync', async (_req, res) => res.json(ok({
  colaboradores: await listTable('colaboradores'),
  clientes: await listTable('clientes'),
  leme_profile: await listTable('leme_profile'),
  publicacoes: await listTable('publicacoes'),
  eventos: await listTable('eventos'),
  gravacoes: await listTable('gravacoes'),
  trafego_pago: await listTable('trafego_pago'),
  prompt_templates: await listTable('prompt_templates'),
  prompts: await listTable('prompt_templates'),
  finance_boxes: await listTable('finance_boxes'),
  finance_movements: await listTable('finance_movements'),
  crm_prospects: await listTable('crm_prospects'),
  crm_acoes: await listTable('crm_acoes')
})));


app.get('/api/system-health', async (_req, res) => {
  const dbSize = await query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho, pg_database_size(current_database()) AS bytes`);
  const tables = await query(`
    SELECT
      relname AS tabela,
      n_live_tup::int AS linhas,
      pg_total_relation_size(relid) AS bytes,
      pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
  `);
  const sessions = await query(`SELECT COUNT(*)::int AS ativas FROM user_sessions WHERE revoked_at IS NULL AND expires_at > now()`);
  res.json(ok({
    version: '107.3.2',
    banco: dbSize.rows[0],
    tabelas: tables.rows,
    sessoes_ativas: sessions.rows[0]?.ativas || 0,
    at: nowIso()
  }));
});

app.get('/api/clients/:clientId/integrations/site', async (req, res) => {
  await getClientRow(req.params.clientId);
  const integration = await getClientIntegration(req.params.clientId, false);
  res.json(ok({ integration: publicClientIntegration(integration) }));
});

app.put('/api/clients/:clientId/integrations/site', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  await getClientRow(clientId);
  const existing = await getClientIntegration(clientId, false);
  const body = asJson(req.body);
  const siteUrl = normalizeSiteUrl(body.site_url ?? body.siteUrl ?? existing?.site_url ?? '');
  const reportDay = Math.min(28, Math.max(1, Number(body.report_day ?? body.reportDay ?? existing?.report_day ?? 5) || 5));
  const reportTime = String(body.report_time ?? body.reportTime ?? existing?.report_time ?? '09:00').slice(0, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reportTime)) fail('Informe um horário válido.');

  let permalinkEncrypted = existing?.permalink_key_encrypted || '';
  let analyticsEncrypted = existing?.analytics_key_encrypted || '';
  const permalinkKey = normalizeSubmittedIntegrationSecret(body.permalink_key ?? body.permalinkKey ?? '');
  const analyticsKey = normalizeSubmittedIntegrationSecret(body.analytics_key ?? body.analyticsKey ?? '');
  if (permalinkKey) permalinkEncrypted = encryptIntegrationSecret(permalinkKey);
  if (analyticsKey) analyticsEncrypted = encryptIntegrationSecret(analyticsKey);
  if (body.clear_permalink_key === true) permalinkEncrypted = '';
  if (body.clear_analytics_key === true) analyticsEncrypted = '';
  const changedAnalyticsConnection = Boolean(analyticsKey) || body.clear_analytics_key === true || siteUrl !== (existing?.site_url || '');

  const saved = await query(
    `INSERT INTO client_integrations
      (client_id,site_url,permalink_key_encrypted,analytics_key_encrypted,report_automation_enabled,report_day,report_time,report_recipient_type,report_recipient_custom,analytics_status,analytics_status_message,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'',now())
     ON CONFLICT (client_id) DO UPDATE SET
       site_url=$2,
       permalink_key_encrypted=$3,
       analytics_key_encrypted=$4,
       report_automation_enabled=$5,
       report_day=$6,
       report_time=$7,
       report_recipient_type=$8,
       report_recipient_custom=$9,
       analytics_status=CASE WHEN $11 THEN $10 ELSE client_integrations.analytics_status END,
       analytics_status_message=CASE WHEN $11 THEN '' ELSE client_integrations.analytics_status_message END,
       updated_at=now()
     RETURNING *`,
    [
      clientId,
      siteUrl,
      permalinkEncrypted,
      analyticsEncrypted,
      booleanValue(body.report_automation_enabled ?? body.reportAutomationEnabled, existing?.report_automation_enabled || false),
      reportDay,
      reportTime,
      'leme_group',
      '',
      analyticsEncrypted && siteUrl ? 'unchecked' : 'not_configured',
      changedAnalyticsConnection
    ]
  );
  broadcastRealtime('client_integrations', 'updated', clientId);
  res.json(ok({ integration: publicClientIntegration(saved.rows[0]) }));
});

app.post('/api/clients/:clientId/site-analytics/test', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  await getClientRow(clientId);
  const integration = await getClientIntegration(clientId, true);
  try {
    const status = await requestWordPressAnalytics(integration, 'status');
    const statusMessage = status?.collecting === false ? 'Plugin conectado, mas a coleta está pausada no WordPress.' : '';
    const updated = await query(
      `UPDATE client_integrations SET analytics_status='connected',analytics_status_checked_at=now(),analytics_status_message=$2,updated_at=now()
       WHERE client_id=$1 RETURNING *`,
      [clientId, statusMessage]
    );
    res.json(ok({ status, integration: publicClientIntegration(updated.rows[0]) }));
  } catch (error) {
    const status = error.code === 'analytics_key_invalid'
      ? 'invalid_key'
      : error.code === 'analytics_plugin_not_found'
        ? 'plugin_not_found'
        : 'site_unavailable';
    const updated = await query(
      `UPDATE client_integrations SET analytics_status=$2,analytics_status_checked_at=now(),analytics_status_message=$3,updated_at=now()
       WHERE client_id=$1 RETURNING *`,
      [clientId, status, String(error.message || 'Falha na conexão').slice(0, 500)]
    );
    return res.status(error.status || 502).json({ ok: false, error: error.message, code: error.code || 'analytics_connection_failed', integration: publicClientIntegration(updated.rows[0]) });
  }
});

app.get('/api/clients/:clientId/site-analytics/dashboard', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  const client = await getClientRow(clientId);
  const integration = await getClientIntegration(clientId, true);
  const { startDate, endDate } = validateAnalyticsPeriod(req.query.start_date, req.query.end_date);
  const data = await fetchAnalyticsBundle(integration, startDate, endDate);
  res.json(ok({ client: { id: clientId, nome_cliente: client.nome_cliente }, integration: publicClientIntegration(integration), data }));
});

app.get('/api/clients/:clientId/site-analytics/page-details', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  await getClientRow(clientId);
  const integration = await getClientIntegration(clientId, true);
  const { startDate, endDate } = validateAnalyticsPeriod(req.query.start_date, req.query.end_date);
  const pathValue = String(req.query.path || '').trim();
  if (!pathValue) fail('Informe a página que deseja consultar.');
  const data = await requestWordPressAnalytics(integration, 'page', { start_date: startDate, end_date: endDate, path: pathValue });
  res.json(ok({ data }));
});

app.get('/api/clients/:clientId/site-analytics/city-details', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  await getClientRow(clientId);
  const integration = await getClientIntegration(clientId, true);
  const { startDate, endDate } = validateAnalyticsPeriod(req.query.start_date, req.query.end_date);
  const city = String(req.query.city || '').trim();
  if (!city) fail('Informe a cidade que deseja consultar.');
  const data = await requestWordPressAnalytics(integration, 'city', {
    start_date: startDate,
    end_date: endDate,
    city,
    state: String(req.query.state || '').trim()
  });
  res.json(ok({ data }));
});

app.get('/api/clients/:clientId/site-analytics/reports', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  await getClientRow(clientId);
  const result = await query(
    `SELECT * FROM analytics_report_deliveries WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [clientId]
  );
  res.json(ok({ reports: result.rows.map(deliveryPublic) }));
});

app.post('/api/clients/:clientId/site-analytics/reports/request', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  await getClientRow(clientId);
  await getClientIntegration(clientId, true);
  const { startDate, endDate } = validateAnalyticsPeriod(req.body.start_date, req.body.end_date);
  const requestedBy = String(req.auth?.usuario || req.auth?.colaborador_id || 'sistema');
  const created = await createAnalyticsDelivery({
    clientId,
    startDate,
    endDate,
    triggerType: 'manual',
    deliveryMode: 'whatsapp',
    recipientType: 'leme_group',
    recipient: '',
    requestedBy
  });
  const delivery = await callAnalyticsN8n(created.delivery);
  res.status(202).json(ok({ message: 'Relatório sendo processado.', delivery: deliveryPublic(delivery) }));
});

app.post('/api/clients/:clientId/site-analytics/reports/:deliveryId/resend', async (req, res) => {
  const clientId = String(req.params.clientId || '');
  await getClientRow(clientId);
  await getClientIntegration(clientId, true);
  const source = await query('SELECT * FROM analytics_report_deliveries WHERE id=$1 AND client_id=$2 LIMIT 1', [req.params.deliveryId, clientId]);
  if (!source.rows[0]) fail('Relatório anterior não encontrado.', 404);
  const previous = source.rows[0];
  const created = await createAnalyticsDelivery({
    clientId,
    startDate: dateOnly(previous.start_date),
    endDate: dateOnly(previous.end_date),
    triggerType: 'manual',
    deliveryMode: 'whatsapp',
    recipientType: 'leme_group',
    recipient: '',
    requestedBy: String(req.auth?.usuario || req.auth?.colaborador_id || 'sistema')
  });
  const delivery = await callAnalyticsN8n(created.delivery);
  res.status(202).json(ok({ message: 'Novo envio sendo processado.', delivery: deliveryPublic(delivery) }));
});

app.get('/api/automations/site-analytics/due-reports', async (_req, res) => {
  const local = saoPauloParts();
  const period = previousClosedMonth();
  const eligible = await query(
    `SELECT i.*
     FROM client_integrations i
     JOIN clientes c ON c.registro_id=i.client_id
     WHERE i.report_automation_enabled=true
       AND i.report_day=$1
       AND i.report_time <= $2::time
       AND c.status='Ativo'
     ORDER BY c.nome_cliente`,
    [local.day, local.time]
  );
  const reports = [];
  for (const row of eligible.rows) {
    const dedupeKey = `scheduled:${row.client_id}:${period.periodKey}`;
    const created = await createAnalyticsDelivery({
      clientId: row.client_id,
      startDate: period.startDate,
      endDate: period.endDate,
      triggerType: 'scheduled',
      deliveryMode: 'whatsapp',
      recipientType: 'leme_group',
      recipient: '',
      requestedBy: 'n8n_schedule',
      dedupeKey
    });
    if (!created.created) continue;
    reports.push({
      delivery_id: String(created.delivery.id),
      client_id: row.client_id,
      start_date: period.startDate,
      end_date: period.endDate,
      trigger: 'scheduled'
    });
  }
  res.json(ok({ date: local.date, time: local.time, reports }));
});

app.get('/api/automations/site-analytics/report-context', async (req, res) => {
  const deliveryId = String(req.query.delivery_id || '');
  if (!deliveryId) fail('delivery_id obrigatório.');
  const found = await query('SELECT * FROM analytics_report_deliveries WHERE id=$1 LIMIT 1', [deliveryId]);
  if (!found.rows[0]) fail('Execução de relatório não encontrada.', 404);
  const delivery = found.rows[0];
  const client = await getClientRow(delivery.client_id);
  const integration = await getClientIntegration(delivery.client_id, true);
  const { startDate, endDate } = validateAnalyticsPeriod(delivery.start_date, delivery.end_date);
  const data = await analyticsBundleForReport(delivery.client_id, integration, startDate, endDate);
  await updateAnalyticsDelivery(delivery.id, { status: 'processing', n8n_execution_id: String(req.query.execution_id || '') });
  res.json(ok({
    delivery: deliveryPublic(delivery),
    client: {
      id: delivery.client_id,
      nome_cliente: client.nome_cliente,
      site_url: integration.site_url,
      drive_folder_id: client.drive_folder_id || client.banco_google || '',
      logo_url: client.logo_url || ''
    },
    report_data: data
  }));
});

app.post('/api/automations/site-analytics/report-status', async (req, res) => {
  const deliveryId = String(req.body.delivery_id || '');
  if (!deliveryId) fail('delivery_id obrigatório.');
  const delivery = await updateAnalyticsDelivery(deliveryId, {
    status: req.body.status,
    n8n_execution_id: String(req.body.n8n_execution_id || ''),
    error_code: String(req.body.error_code || ''),
    error_message: String(req.body.error_message || '').slice(0, 1000),
    file_reference: String(req.body.file_reference || '').slice(0, 2000)
  });
  res.json(ok({ delivery: deliveryPublic(delivery) }));
});

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
      (SELECT COUNT(*)::int FROM eventos WHERE colaborador_id = $1 OR data->>'colaborador_id' = $1) AS eventos,
      (SELECT COUNT(*)::int FROM gravacoes WHERE responsavel_id = $1 OR data->>'responsavel_id' = $1) AS gravacoes
  `, [registroId]);
  const counts = linked.rows[0] || {};
  if ((counts.clientes || 0) || (counts.publicacoes || 0) || (counts.eventos || 0) || (counts.gravacoes || 0)) {
    return res.status(409).json(ok({
      ok: false,
      error: 'Este colaborador possui clientes, publicações, eventos ou gravações vinculados. Reatribua antes de excluir.',
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
app.post('/webhook/salvar-informacoes-leme', async (req, res) => {
  const payload = unwrapBody(req.body, ['leme', 'perfil', 'profile']);
  const record = await upsertLemeProfile(payload);
  broadcastRealtime('leme_profile', 'updated', record.registro_id);
  res.json(ok({ action: 'saved', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/deletar-cliente', async (req, res) => {
  const registroId = bodyRegistroId(req.body, ['cliente', 'client']);
  if (!registroId) fail('registro_id obrigatório para excluir cliente');

  const cascadeAll = req.body.cascade_all === true || req.body.cascadeAll === true || req.body.delete_all_linked === true;
  const deletePublicacoes = cascadeAll || req.body.delete_publicacoes === true || req.body.deletePublications === true || req.body.cascade_publicacoes === true || req.body.cascadePublications === true;
  const deleteEventos = cascadeAll || req.body.delete_eventos === true || req.body.deleteEvents === true;
  const deleteTrafego = cascadeAll || req.body.delete_trafego === true || req.body.deleteTraffic === true;
  const deleteFinanceiro = cascadeAll || req.body.delete_financeiro === true || req.body.deleteFinance === true;
  const deleteGravacoes = cascadeAll || req.body.delete_gravacoes === true || req.body.deleteRecordings === true;

  const linked = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM publicacoes WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS publicacoes,
      (SELECT COUNT(*)::int FROM eventos WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS eventos,
      (SELECT COUNT(*)::int FROM trafego_pago WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS trafego,
      (SELECT COUNT(*)::int FROM finance_movements WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS financeiro,
      (SELECT COUNT(*)::int FROM gravacoes WHERE cliente_id = $1 OR data->>'cliente_id' = $1) AS gravacoes
  `, [registroId]);
  const counts = linked.rows[0] || {};

  if (((counts.publicacoes || 0) && !deletePublicacoes) || ((counts.eventos || 0) && !deleteEventos) || ((counts.trafego || 0) && !deleteTrafego) || ((counts.financeiro || 0) && !deleteFinanceiro) || ((counts.gravacoes || 0) && !deleteGravacoes)) {
    return res.status(409).json(ok({
      ok: false,
      error: 'Este cliente possui registros vinculados. Confirme se deseja excluir tudo junto com o cliente.',
      linked: counts,
      can_delete_with_linked: true
    }));
  }

  const result = await withTransaction(async (db) => {
    const out = { publicacoes: [], eventos: [], trafego: [], financeiro: [], gravacoes: [] };

    if (deletePublicacoes) {
      const deleted = await db.query(`DELETE FROM publicacoes WHERE cliente_id = $1 OR data->>'cliente_id' = $1 RETURNING registro_id`, [registroId]);
      out.publicacoes = deleted.rows.map(row => row.registro_id).filter(Boolean);
    }

    if (deleteEventos) {
      const deleted = await db.query(`DELETE FROM eventos WHERE cliente_id = $1 OR data->>'cliente_id' = $1 RETURNING registro_id`, [registroId]);
      out.eventos = deleted.rows.map(row => row.registro_id).filter(Boolean);
    }

    if (deleteTrafego) {
      const deleted = await db.query(`DELETE FROM trafego_pago WHERE cliente_id = $1 OR data->>'cliente_id' = $1 RETURNING registro_id`, [registroId]);
      out.trafego = deleted.rows.map(row => row.registro_id).filter(Boolean);
    }

    if (deleteFinanceiro) {
      const deleted = await db.query(`DELETE FROM finance_movements WHERE cliente_id = $1 OR data->>'cliente_id' = $1 RETURNING registro_id`, [registroId]);
      out.financeiro = deleted.rows.map(row => row.registro_id).filter(Boolean);
    }

    if (deleteGravacoes) {
      const deleted = await db.query(`DELETE FROM gravacoes WHERE cliente_id = $1 OR data->>'cliente_id' = $1 RETURNING registro_id`, [registroId]);
      out.gravacoes = deleted.rows.map(row => row.registro_id).filter(Boolean);
    }

    await db.query('DELETE FROM finance_boxes WHERE cliente_id = $1 AND registro_id NOT IN ($2,$3,$4,$5,$6)', [
      registroId,
      'finance_box_imposto',
      'finance_box_trafego_leme',
      'finance_box_salarios',
      'finance_box_saldo',
      'finance_box_mensalidades'
    ]);

    await db.query('DELETE FROM analytics_report_deliveries WHERE client_id = $1', [registroId]);
    await db.query('DELETE FROM analytics_snapshots WHERE client_id = $1', [registroId]);
    await db.query('DELETE FROM client_integrations WHERE client_id = $1', [registroId]);

    await db.query('DELETE FROM clientes WHERE registro_id = $1', [registroId]);
    return out;
  });

  if (result.publicacoes.length) broadcastRealtime('publicacoes', 'bulk_deleted', registroId);
  if (result.eventos.length) broadcastRealtime('eventos', 'bulk_deleted', registroId);
  if (result.trafego.length) broadcastRealtime('trafego_pago', 'bulk_deleted', registroId);
  if (result.financeiro.length) broadcastRealtime('finance_movements', 'bulk_deleted', registroId);
  if (result.gravacoes.length) broadcastRealtime('gravacoes', 'bulk_deleted', registroId);
  broadcastRealtime('clientes', 'deleted', registroId);
  res.json(ok({
    action: 'deleted',
    registro_id: registroId,
    deleted_publicacoes: result.publicacoes.length,
    deleted_eventos: result.eventos.length,
    deleted_trafego: result.trafego.length,
    deleted_financeiro: result.financeiro.length,
    deleted_gravacoes: result.gravacoes.length,
    deleted_ids: result
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
  const payload = req.body.evento || req.body.event || req.body;
  const linkedRecordingId = String(payload.gravacao_id || '').trim();
  const record = await upsertEvento({
    ...payload,
    ...(linkedRecordingId ? { titulo: 'Gravação', tipo: 'Gravação' } : {})
  });

  let gravacao = null;
  if (linkedRecordingId) {
    const found = await query('SELECT registro_id, data FROM gravacoes WHERE registro_id = $1 LIMIT 1', [linkedRecordingId]);
    if (found.rows[0]) {
      const existing = { ...(found.rows[0].data || {}), id: linkedRecordingId, registro_id: linkedRecordingId };
      gravacao = await upsertGravacao({
        ...existing,
        responsavel_id: record.colaborador_id || record.responsavel_id || existing.responsavel_id || '',
        cliente_id: record.cliente_id || existing.cliente_id || '',
        data_gravacao: record.data || record.data_evento || existing.data_gravacao,
        hora: record.hora || existing.hora || '',
        status: 'Agendada',
        evento_id: record.registro_id,
        updated_at: nowIso()
      });
      broadcastRealtime('gravacoes', 'schedule_updated', gravacao.registro_id);
    }
  }

  broadcastRealtime('eventos', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id, data: record, gravacao }));
});

app.post('/webhook/deletar-evento', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.evento?.registro_id || req.body.evento?.id || req.body.event?.registro_id || req.body.event?.id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório para excluir evento');

  const result = await withTransaction(async (db) => {
    const linked = await db.query('SELECT registro_id, data FROM gravacoes WHERE evento_id = $1 OR data->>\'evento_id\' = $1 LIMIT 1', [registroId]);
    let gravacao = null;
    if (linked.rows[0]) {
      const recordingId = linked.rows[0].registro_id;
      const existing = { ...(linked.rows[0].data || {}), id: recordingId, registro_id: recordingId };
      gravacao = await upsertGravacao({
        ...existing,
        data_gravacao: existing.data_prevista_original || existing.data_gravacao,
        hora: '',
        status: 'Prevista',
        evento_id: '',
        avisos_enviados: [],
        updated_at: nowIso()
      }, db);
    }
    await db.query('DELETE FROM eventos WHERE registro_id = $1', [registroId]);
    return { gravacao };
  });

  if (result.gravacao) broadcastRealtime('gravacoes', 'unscheduled', result.gravacao.registro_id);
  broadcastRealtime('eventos', 'deleted', registroId);
  res.json(ok({ action: 'deleted', registro_id: registroId, gravacao: result.gravacao }));
});

app.post('/webhook/salvar-gravacao', async (req, res) => {
  const record = await upsertGravacao(unwrapBody(req.body, ['gravacao', 'recording']));
  broadcastRealtime('gravacoes', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id, data: record }));
});

app.post('/webhook/agendar-gravacao', async (req, res) => {
  const payload = unwrapBody(req.body, ['gravacao', 'recording']);
  const registroId = bodyRegistroId(req.body, ['gravacao', 'recording']) || payload.registro_id || payload.id || crypto.randomUUID();
  const dataGravacao = dateOnly(payload.data_gravacao || req.body.data_gravacao || payload.data);
  const hora = timeOnly(payload.hora || req.body.hora);
  const clienteId = String(payload.cliente_id || req.body.cliente_id || '').trim();
  const responsavelId = String(payload.responsavel_id || payload.colaborador_id || req.body.responsavel_id || req.body.colaborador_id || '').trim();

  if (!clienteId) fail('Selecione o cliente da gravação.');
  if (!responsavelId) fail('Selecione o colaborador responsável.');
  if (!dataGravacao) fail('Informe a data da gravação.');
  if (!hora) fail('Informe o horário da gravação.');

  const result = await withTransaction(async (db) => {
    const existingResult = await db.query('SELECT registro_id, data FROM gravacoes WHERE registro_id = $1 LIMIT 1', [registroId]);
    const existing = existingResult.rows[0]
      ? { ...(existingResult.rows[0].data || {}), id: registroId, registro_id: registroId }
      : {};

    const eventoId = String(payload.evento_id || existing.evento_id || `gravacao-evento-${registroId}`);
    const gravacao = await upsertGravacao({
      ...existing,
      ...payload,
      id: registroId,
      registro_id: registroId,
      cliente_id: clienteId,
      responsavel_id: responsavelId,
      data_gravacao: dataGravacao,
      hora,
      status: 'Agendada',
      evento_id: eventoId,
      data_prevista_original: existing.data_prevista_original || (existing.status === 'Prevista' ? existing.data_gravacao : ''),
      updated_at: nowIso()
    }, db);

    const evento = await upsertEvento({
      id: eventoId,
      registro_id: eventoId,
      colaborador_id: responsavelId,
      responsavel_id: responsavelId,
      cliente_id: clienteId,
      titulo: 'Gravação',
      tipo: 'Gravação',
      data: dataGravacao,
      data_evento: dataGravacao,
      hora,
      status: 'Agendado',
      observacoes: gravacao.observacoes || '',
      descricao: gravacao.observacoes || '',
      gravacao_id: registroId,
      data_inicio: `${dataGravacao}T${hora}:00`,
      data_fim: `${dataGravacao}T${hora}:00`,
      updated_at: nowIso()
    }, db);

    return { gravacao, evento };
  });

  broadcastRealtime('gravacoes', 'scheduled', result.gravacao.registro_id);
  broadcastRealtime('eventos', 'upserted', result.evento.registro_id);
  res.json(ok({
    action: 'scheduled',
    registro_id: result.gravacao.registro_id,
    data: result.gravacao,
    evento: result.evento
  }));
});

app.post('/webhook/concluir-gravacao', async (req, res) => {
  const payload = unwrapBody(req.body, ['gravacao', 'recording']);
  const registroId = bodyRegistroId(req.body, ['gravacao', 'recording']) || payload.registro_id || payload.id || crypto.randomUUID();
  const dataGravacao = dateOnly(payload.data_gravacao || req.body.data_gravacao || nowIso());
  const videosGravados = Number.parseInt(payload.videos_gravados || payload.quantidade_videos || req.body.videos_gravados || 0, 10);

  if (!Number.isFinite(videosGravados) || videosGravados < 1) {
    fail('Informe quantos vídeos foram gravados (mínimo 1).');
  }

  const result = await withTransaction(async (db) => {
    const existingResult = await db.query('SELECT registro_id, data FROM gravacoes WHERE registro_id = $1 LIMIT 1', [registroId]);
    const existing = existingResult.rows[0]
      ? { ...(existingResult.rows[0].data || {}), id: registroId, registro_id: registroId }
      : {};
    const clienteId = String(payload.cliente_id || existing.cliente_id || req.body.cliente_id || '').trim();
    const responsavelId = String(payload.responsavel_id || existing.responsavel_id || req.body.responsavel_id || '').trim();

    if (!clienteId) fail('Selecione o cliente da gravação.');

    const concluida = await upsertGravacao({
      ...existing,
      ...payload,
      id: registroId,
      registro_id: registroId,
      cliente_id: clienteId,
      responsavel_id: responsavelId,
      data_gravacao: dataGravacao,
      videos_gravados: videosGravados,
      status: 'Concluída',
      concluida_em: nowIso(),
      updated_at: nowIso()
    }, db);

    let evento = null;
    if (concluida.evento_id) {
      const eventResult = await db.query('SELECT registro_id, data FROM eventos WHERE registro_id = $1 LIMIT 1', [concluida.evento_id]);
      if (eventResult.rows[0]) {
        const previousEvent = { ...(eventResult.rows[0].data || {}), id: concluida.evento_id, registro_id: concluida.evento_id };
        evento = await upsertEvento({
          ...previousEvent,
          status: 'Realizado',
          updated_at: nowIso()
        }, db);
      }
    }

    const futureScheduled = await db.query(`
      SELECT registro_id, data
      FROM gravacoes
      WHERE cliente_id = $1
        AND status = 'Agendada'
        AND data_gravacao >= $2
        AND registro_id <> $3
      ORDER BY data_gravacao ASC, hora ASC
      LIMIT 1
    `, [clienteId, dataGravacao, registroId]);

    let proximaGravacao = futureScheduled.rows[0]
      ? { ...(futureScheduled.rows[0].data || {}), id: futureScheduled.rows[0].registro_id, registro_id: futureScheduled.rows[0].registro_id }
      : null;

    if (!proximaGravacao) {
      const proximaData = addDaysToDateString(dataGravacao, videosGravados * 7);
      const proximaId = `gravacao-prevista-${clienteId}-${proximaData}`;

      await db.query(`
        DELETE FROM gravacoes
        WHERE cliente_id = $1
          AND status = 'Prevista'
          AND registro_id <> $2
      `, [clienteId, proximaId]);

      proximaGravacao = await upsertGravacao({
        id: proximaId,
        registro_id: proximaId,
        cliente_id: clienteId,
        responsavel_id: responsavelId,
        data_gravacao: proximaData,
        hora: '',
        videos_gravados: 0,
        videos_base: videosGravados,
        data_ultima_gravacao: dataGravacao,
        ultima_gravacao_id: registroId,
        status: 'Prevista',
        evento_id: '',
        avisos_enviados: [],
        observacoes: '',
        created_at: nowIso(),
        updated_at: nowIso()
      }, db);
    }

    return { concluida, proximaGravacao, evento };
  });

  broadcastRealtime('gravacoes', 'completed', result.concluida.registro_id);
  if (result.evento) broadcastRealtime('eventos', 'updated', result.evento.registro_id);
  res.json(ok({
    action: 'completed',
    registro_id: result.concluida.registro_id,
    data: result.concluida,
    proxima_gravacao: result.proximaGravacao,
    evento: result.evento
  }));
});

app.post('/webhook/deletar-gravacao', async (req, res) => {
  const registroId = bodyRegistroId(req.body, ['gravacao', 'recording']);
  if (!registroId) fail('registro_id obrigatório para excluir gravação');

  const result = await withTransaction(async (db) => {
    const found = await db.query('SELECT evento_id, data FROM gravacoes WHERE registro_id = $1 LIMIT 1', [registroId]);
    const eventoId = String(found.rows[0]?.evento_id || found.rows[0]?.data?.evento_id || '');
    await db.query('DELETE FROM gravacoes WHERE registro_id = $1', [registroId]);
    if (eventoId) await db.query('DELETE FROM eventos WHERE registro_id = $1', [eventoId]);
    return { eventoId };
  });

  broadcastRealtime('gravacoes', 'deleted', registroId);
  if (result.eventoId) broadcastRealtime('eventos', 'deleted', result.eventoId);
  res.json(ok({ action: 'deleted', registro_id: registroId, evento_id: result.eventoId }));
});

app.post('/webhook/avisos-gravacoes', async (_req, res) => {
  const today = nowIso().slice(0, 10);
  const [recordings, clients, collaborators] = await Promise.all([
    listTable('gravacoes'),
    listTable('clientes'),
    listTable('colaboradores')
  ]);
  const clientMap = new Map(clients.map(client => [String(client.registro_id || client.id || ''), client]));
  const collaboratorMap = new Map(collaborators.map(collaborator => [String(collaborator.registro_id || collaborator.id || ''), collaborator]));
  const scheduledClients = new Set(
    recordings
      .filter(item => item.status === 'Agendada' && String(item.data_gravacao || '') >= today)
      .map(item => String(item.cliente_id || ''))
  );

  const completedByClient = new Map();
  recordings
    .filter(item => item.status === 'Concluída' && item.data_gravacao)
    .sort((a, b) => String(b.data_gravacao).localeCompare(String(a.data_gravacao)))
    .forEach(item => {
      const clientId = String(item.cliente_id || '');
      if (clientId && !completedByClient.has(clientId)) completedByClient.set(clientId, item);
    });

  const avisos = recordings
    .filter(item => item.status === 'Prevista' && item.data_gravacao)
    .map(item => {
      const clienteId = String(item.cliente_id || '');
      const cliente = clientMap.get(clienteId);
      const diasRestantes = daysBetweenDateStrings(item.data_gravacao, today);
      const enviados = normalizeRecordingReminders(item.avisos_enviados);
      const ultima = completedByClient.get(clienteId);
      const responsavelId = String(item.responsavel_id || cliente?.responsavel_id || '');
      const responsavel = collaboratorMap.get(responsavelId);
      const diasDesdeUltima = ultima?.data_gravacao
        ? Math.max(0, -Number(daysBetweenDateStrings(ultima.data_gravacao, today) || 0))
        : 0;
      const videosRestantes = ultima
        ? Math.max(0, Number(ultima.videos_gravados || 0) - Math.floor(diasDesdeUltima / 7))
        : 0;
      const limiarAviso = [7, 10, 15].find(limiar =>
        diasRestantes !== null &&
        diasRestantes >= 0 &&
        diasRestantes <= limiar &&
        !enviados.includes(limiar)
      );

      return {
        aviso_id: `${item.registro_id}:${diasRestantes}`,
        gravacao_id: item.registro_id,
        registro_id: item.registro_id,
        cliente_id: clienteId,
        cliente_nome: cliente?.nome_cliente || cliente?.nome || 'Cliente sem nome',
        responsavel_id: responsavelId,
        responsavel_nome: responsavel?.nome || 'Equipe LEME',
        responsavel_telefone: responsavel?.telefone || responsavel?.whatsapp || '',
        dias_restantes: diasRestantes,
        limiar_aviso: limiarAviso || null,
        data_prevista: item.data_gravacao,
        ultima_gravacao: ultima?.data_gravacao || item.data_ultima_gravacao || '',
        videos_gravados_ultima: Number(ultima?.videos_gravados || item.videos_base || 0),
        videos_restantes_estimados: videosRestantes,
        avisos_enviados: enviados
      };
    })
    .filter(item => {
      const cliente = clientMap.get(item.cliente_id);
      return cliente &&
        String(cliente.status || 'Ativo') === 'Ativo' &&
        !scheduledClients.has(item.cliente_id) &&
        item.limiar_aviso !== null;
    })
    .sort((a, b) => a.dias_restantes - b.dias_restantes || a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR'));

  res.json(ok({
    data_referencia: today,
    total: avisos.length,
    avisos
  }));
});

app.post('/webhook/marcar-aviso-gravacao', async (req, res) => {
  const registroId = String(req.body.gravacao_id || req.body.registro_id || req.body.id || '').trim();
  const dias = Number(req.body.limiar_aviso || req.body.dias_restantes || req.body.dias || req.body.threshold);
  if (!registroId) fail('gravacao_id obrigatório');
  if (![15, 10, 7].includes(dias)) fail('O aviso deve ser de 15, 10 ou 7 dias.');

  const found = await query('SELECT registro_id, data, avisos_enviados FROM gravacoes WHERE registro_id = $1 LIMIT 1', [registroId]);
  if (!found.rows[0]) fail('Gravação não encontrada.', 404);

  const existing = {
    ...(found.rows[0].data || {}),
    id: registroId,
    registro_id: registroId
  };
  const avisosEnviados = normalizeRecordingReminders(existing.avisos_enviados || found.rows[0].avisos_enviados);
  [15, 10, 7]
    .filter(limiar => limiar >= dias)
    .forEach(limiar => {
      if (!avisosEnviados.includes(limiar)) avisosEnviados.push(limiar);
    });
  const record = await upsertGravacao({
    ...existing,
    avisos_enviados: avisosEnviados,
    ultimo_aviso_enviado_em: nowIso(),
    updated_at: nowIso()
  });

  broadcastRealtime('gravacoes', 'reminder_sent', registroId);
  res.json(ok({ action: 'reminder_sent', registro_id: registroId, dias_restantes: dias, data: record }));
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




app.post('/webhook/registrar-pagamento-cliente', async (req, res) => {
  const clienteId = String(req.body.cliente_id || req.body.client_id || req.body.client?.registro_id || req.body.client?.id || req.body.cliente?.registro_id || req.body.cliente?.id || '').trim();
  const mesReferencia = String(req.body.mes_referencia || req.body.month || req.body.monthKey || '').trim() || nowIso().slice(0, 7);
  if (!clienteId) fail('cliente_id obrigatório para registrar pagamento');

  const result = await withTransaction(async (db) => {
    await ensureFinanceDefaultBoxes(db);

    const clientResult = await db.query('SELECT registro_id, data FROM clientes WHERE registro_id = $1 LIMIT 1', [clienteId]);
    const row = clientResult.rows[0];
    if (!row) fail('Cliente não encontrado', 404);

    const cliente = { ...(row.data || {}), id: row.registro_id, registro_id: row.registro_id };
    const valorMensal = parseMoneyServer(cliente.valor_mensal || cliente.mensalidade || cliente.valor || cliente.valor_pagamento || req.body.valor_mensal || 0);
    if (!valorMensal) fail('Informe o valor mensal do cliente antes de registrar o pagamento.');

    const valorTrafego = parseMoneyServer(cliente.valor_trafego || cliente.trafego_pago || cliente.verba_trafego || 0);
    const dataPagamento = String(req.body.data_pagamento || req.body.payment_date || nowIso().slice(0, 10)).slice(0, 10);
    const dataVencimento = String(req.body.data_vencimento || req.body.due_date || '').slice(0, 10);
    const pagamentoAtrasado = req.body.pagamento_atrasado === true || req.body.late_payment === true || String(req.body.pagamento_atrasado || '').toLowerCase() === 'true';
    const observacaoPagamento = String(req.body.observacao_pagamento || req.body.observacao || '').trim();
    const movimentos = [];

    movimentos.push({
      id: `pagamento_cliente__${mesReferencia}__${clienteId}`,
      registro_id: `pagamento_cliente__${mesReferencia}__${clienteId}`,
      box_id: 'finance_box_saldo',
      cliente_id: clienteId,
      tipo: 'ajuste',
      valor: 0,
      descricao: `Pagamento registrado - ${cliente.nome_cliente || 'Cliente'}`,
      mes_referencia: mesReferencia,
      data_movimento: dataPagamento,
      data_pagamento: dataPagamento,
      data_vencimento: dataVencimento,
      pagamento_atrasado: pagamentoAtrasado,
      observacao_pagamento: observacaoPagamento,
      origem: 'pagamento_cliente_marker',
      status: pagamentoAtrasado ? 'Confirmado - atrasado' : 'Confirmado'
    });

    let allocated = 0;
    const colaboradorSplits = getClientCollaboratorSplitsServer(cliente);
    const collaboratorIds = Object.keys(colaboradorSplits).filter(id => parseMoneyServer(colaboradorSplits[id]) > 0);
    const collaboratorMap = new Map();

    if (collaboratorIds.length) {
      const collaboratorRows = await db.query('SELECT registro_id, nome, data FROM colaboradores WHERE registro_id = ANY($1::text[])', [collaboratorIds]);
      collaboratorRows.rows.forEach(col => collaboratorMap.set(String(col.registro_id), { ...(col.data || {}), id: col.registro_id, registro_id: col.registro_id, nome: col.nome || col.data?.nome }));
    }

    for (const collaboratorId of collaboratorIds) {
      const valor = parseMoneyServer(colaboradorSplits[collaboratorId]);
      if (valor <= 0) continue;
      const colaborador = collaboratorMap.get(String(collaboratorId)) || { nome: 'Colaborador' };
      const repasseBox = {
        id: `finance_box_repasse_colaborador_${collaboratorId}`,
        registro_id: `finance_box_repasse_colaborador_${collaboratorId}`,
        nome: `Repasse - ${colaborador.nome || 'Colaborador'}`,
        categoria: 'colaborador',
        tipo: 'repasse_colaborador',
        cliente_id: '',
        colaborador_id: collaboratorId,
        percentual: 0,
        meta_valor: 0,
        status: 'Ativo',
        ordem: 60
      };
      await txUpsertFinanceBox(db, repasseBox);
      allocated += valor;
      movimentos.push({
        id: `entrada_repasse_colaborador__${mesReferencia}__${clienteId}__${collaboratorId}`,
        registro_id: `entrada_repasse_colaborador__${mesReferencia}__${clienteId}__${collaboratorId}`,
        box_id: repasseBox.registro_id,
        cliente_id: clienteId,
        colaborador_id: collaboratorId,
        tipo: 'entrada',
        valor,
        descricao: `Repasse ${colaborador.nome || 'Colaborador'} - ${cliente.nome_cliente || 'Cliente'}`,
        mes_referencia: mesReferencia,
        data_movimento: dataPagamento,
        data_pagamento: dataPagamento,
        data_vencimento: dataVencimento,
        pagamento_atrasado: pagamentoAtrasado,
        observacao_pagamento: observacaoPagamento,
        origem: 'pagamento_cliente',
        status: pagamentoAtrasado ? 'Confirmado - atrasado' : 'Confirmado'
      });
    }

    if (valorTrafego > 0) {
      const trafficBox = {
        id: `finance_box_trafego_cliente_${clienteId}`,
        registro_id: `finance_box_trafego_cliente_${clienteId}`,
        nome: `Tráfego - ${cliente.nome_cliente || 'Cliente'}`,
        categoria: 'cliente',
        tipo: 'trafego_cliente',
        cliente_id: clienteId,
        percentual: 0,
        meta_valor: valorTrafego,
        status: 'Ativo',
        ordem: 100
      };
      await txUpsertFinanceBox(db, trafficBox);
      allocated += valorTrafego;
      movimentos.push({
        id: `entrada_trafego_cliente__${mesReferencia}__${clienteId}`,
        registro_id: `entrada_trafego_cliente__${mesReferencia}__${clienteId}`,
        box_id: trafficBox.registro_id,
        cliente_id: clienteId,
        tipo: 'entrada',
        valor: valorTrafego,
        descricao: `Reserva de tráfego do cliente - ${cliente.nome_cliente || 'Cliente'}`,
        mes_referencia: mesReferencia,
        data_movimento: dataPagamento,
        data_pagamento: dataPagamento,
        data_vencimento: dataVencimento,
        pagamento_atrasado: pagamentoAtrasado,
        observacao_pagamento: observacaoPagamento,
        origem: 'pagamento_cliente',
        status: pagamentoAtrasado ? 'Confirmado - atrasado' : 'Confirmado'
      });
    }

    if (allocated > valorMensal) {
      fail(`A soma de repasses dos colaboradores + tráfego (${allocated.toFixed(2)}) ultrapassa o valor mensal do cliente (${valorMensal.toFixed(2)}).`);
    }

    const restanteBase = Math.max(0, valorMensal - allocated);
    const internalRows = await db.query(`SELECT registro_id, data FROM finance_boxes
      WHERE COALESCE(data->>'categoria', categoria) = 'interno'
        AND COALESCE(data->>'status', status, 'Ativo') = 'Ativo'
      ORDER BY ordem ASC, nome ASC`);

    let internalAllocated = 0;
    for (const boxRow of internalRows.rows) {
      const box = { ...(boxRow.data || {}), id: boxRow.registro_id, registro_id: boxRow.registro_id };
      if (['mensalidades', 'saldo', 'salarios'].includes(String(box.tipo || ''))) continue;
      const percentual = Number(box.percentual || 0);
      if (percentual <= 0) continue;
      const available = Math.max(0, restanteBase - internalAllocated);
      if (!available) break;
      const valorCalculado = Math.max(0, restanteBase * percentual / 100);
      const valor = Math.min(available, valorCalculado);
      if (!valor) continue;
      internalAllocated += valor;
      movimentos.push({
        id: `entrada_percentual__${mesReferencia}__${clienteId}__${box.registro_id}`,
        registro_id: `entrada_percentual__${mesReferencia}__${clienteId}__${box.registro_id}`,
        box_id: box.registro_id,
        cliente_id: clienteId,
        tipo: 'entrada',
        valor,
        descricao: `${box.nome || 'Caixinha'} - ${cliente.nome_cliente || 'Cliente'} (${percentual}% do restante)`,
        mes_referencia: mesReferencia,
        data_movimento: dataPagamento,
        data_pagamento: dataPagamento,
        data_vencimento: dataVencimento,
        pagamento_atrasado: pagamentoAtrasado,
        observacao_pagamento: observacaoPagamento,
        origem: 'pagamento_cliente',
        status: pagamentoAtrasado ? 'Confirmado - atrasado' : 'Confirmado'
      });
    }

    const restanteSaldo = Math.max(0, restanteBase - internalAllocated);
    if (restanteSaldo > 0) {
      movimentos.push({
        id: `entrada_saldo__${mesReferencia}__${clienteId}`,
        registro_id: `entrada_saldo__${mesReferencia}__${clienteId}`,
        box_id: 'finance_box_saldo',
        cliente_id: clienteId,
        tipo: 'entrada',
        valor: restanteSaldo,
        descricao: `Saldo livre restante - ${cliente.nome_cliente || 'Cliente'}`,
        mes_referencia: mesReferencia,
        data_movimento: dataPagamento,
        data_pagamento: dataPagamento,
        data_vencimento: dataVencimento,
        pagamento_atrasado: pagamentoAtrasado,
        observacao_pagamento: observacaoPagamento,
        origem: 'pagamento_cliente',
        status: pagamentoAtrasado ? 'Confirmado - atrasado' : 'Confirmado'
      });
    }

    const saved = [];
    for (const movement of movimentos) saved.push(await txUpsertFinanceMovement(db, movement));
    return {
      cliente,
      movements: saved,
      valor_mensal: valorMensal,
      valor_trafego: valorTrafego,
      repasses_colaboradores: colaboradorSplits,
      total_repasses_colaboradores: allocated - valorTrafego,
      base_caixinhas_internas: restanteBase,
      saldo_restante: restanteSaldo,
      data_pagamento: dataPagamento,
      data_vencimento: dataVencimento,
      pagamento_atrasado: pagamentoAtrasado
    };
  });

  broadcastRealtime('finance_boxes', 'upserted', clienteId);
  broadcastRealtime('finance_movements', 'payment_registered', clienteId);
  res.json(ok({ action: 'payment_registered', ...result }));
});

app.post('/webhook/desfazer-pagamento-cliente', async (req, res) => {
  const clienteId = String(req.body.cliente_id || req.body.client_id || req.body.client?.registro_id || req.body.client?.id || '').trim();
  const mesReferencia = String(req.body.mes_referencia || req.body.month || req.body.monthKey || '').trim() || nowIso().slice(0, 7);
  if (!clienteId) fail('cliente_id obrigatório para desfazer pagamento');

  const deleted = await withTransaction(async (db) => {
    const result = await db.query(`DELETE FROM finance_movements
      WHERE mes_referencia = $1
        AND cliente_id = $2
        AND origem IN ('pagamento_cliente', 'pagamento_cliente_marker')
      RETURNING registro_id`, [mesReferencia, clienteId]);
    return result.rows.map(row => row.registro_id).filter(Boolean);
  });

  broadcastRealtime('finance_movements', 'payment_removed', clienteId);
  res.json(ok({ action: 'payment_removed', deleted_count: deleted.length, registro_ids: deleted }));
});

app.post('/webhook/salvar-caixinha', async (req, res) => {
  const record = await upsertFinanceBox(req.body.caixinha || req.body.box || req.body.finance_box || req.body);
  broadcastRealtime('finance_boxes', 'upserted', record.registro_id);
  res.json(ok({ action: 'upserted', registro_id: record.registro_id, data: record }));
});
app.post('/webhook/deletar-caixinha', async (req, res) => {
  const registroId = String(req.body.registro_id || req.body.caixinha?.registro_id || req.body.caixinha?.id || req.body.id || '');
  if (!registroId) fail('registro_id obrigatório para excluir caixinha');
  if (PROTECTED_FINANCE_BOX_IDS.has(registroId)) {
    return res.status(409).json(ok({ ok: false, error: 'Esta é uma caixinha padrão do sistema. Ela não pode ser excluída, apenas editada.' }));
  }
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
  const url = process.env[fallbackEnv] || (fallbackEnv === 'N8N_CHAT_WEBHOOK_URL' ? DEFAULT_N8N_CHAT_WEBHOOK_URL : '');
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
app.post('/webhook/chat-ia-leme', async (req, res) => res.json(await forwardToN8n('ia-leme-chat', req.body, 'N8N_CHAT_WEBHOOK_URL')));
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


// V112.17 — Local Radar nativo do Sistema LEME.
const LOCAL_RADAR_GOOGLE_KEY = String(process.env.GOOGLE_MAPS_BACKEND_KEY || process.env.GOOGLE_PLACES_API_KEY || '').trim();
const LOCAL_RADAR_N8N_WEBHOOK_URL = String(process.env.N8N_LOCAL_RADAR_MONTHLY_WEBHOOK_URL || 'https://n8n.adati.app.br/webhook/leme-local-radar-mensal').trim();
const GBP_OAUTH_CLIENT_ID = String(process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
const GBP_OAUTH_CLIENT_SECRET = String(process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
const GBP_OAUTH_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const GBP_CORE_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_DIRECTION_REQUESTS',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_BOOKINGS',
  'BUSINESS_FOOD_ORDERS',
  'BUSINESS_FOOD_MENU_CLICKS'
];

async function ensureLocalRadarTables() {
  await query('CREATE TABLE IF NOT EXISTS local_radar_configs (client_id text PRIMARY KEY REFERENCES clientes(registro_id) ON DELETE CASCADE, place_id text NOT NULL DEFAULT \'\', address text NOT NULL DEFAULT \'\', city text NOT NULL DEFAULT \'\', profile_lat double precision, profile_lng double precision, grid_center_lat double precision, grid_center_lng double precision, grid_size integer NOT NULL DEFAULT 5, radius_km numeric(8,2) NOT NULL DEFAULT 3, keyword text NOT NULL DEFAULT \'\', monthly_enabled boolean NOT NULL DEFAULT false, monthly_day integer NOT NULL DEFAULT 5, updated_at timestamptz NOT NULL DEFAULT now())');
  await query('CREATE TABLE IF NOT EXISTS local_radar_scans (id text PRIMARY KEY, client_id text REFERENCES clientes(registro_id) ON DELETE CASCADE, source text NOT NULL DEFAULT \'client\', target_name text NOT NULL DEFAULT \'\', place_id text NOT NULL DEFAULT \'\', keyword text NOT NULL, grid_size integer NOT NULL, radius_km numeric(8,2) NOT NULL, center_lat double precision NOT NULL, center_lng double precision NOT NULL, points jsonb NOT NULL DEFAULT \'[]\'::jsonb, summary jsonb NOT NULL DEFAULT \'{}\'::jsonb, competitors jsonb NOT NULL DEFAULT \'[]\'::jsonb, created_at timestamptz NOT NULL DEFAULT now())');
  await query('CREATE TABLE IF NOT EXISTS local_radar_reports (id text PRIMARY KEY, client_id text NOT NULL REFERENCES clientes(registro_id) ON DELETE CASCADE, scan_id text NOT NULL REFERENCES local_radar_scans(id) ON DELETE CASCADE, month_key text NOT NULL DEFAULT \'\', title text NOT NULL DEFAULT \'Relatório Local Radar\', data jsonb NOT NULL DEFAULT \'{}\'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id, month_key))');
  await query("ALTER TABLE local_radar_configs ADD COLUMN IF NOT EXISTS include_competitors boolean NOT NULL DEFAULT true");
  await query("ALTER TABLE local_radar_configs ADD COLUMN IF NOT EXISTS gbp_account_name text NOT NULL DEFAULT ''");
  await query("ALTER TABLE local_radar_configs ADD COLUMN IF NOT EXISTS gbp_location_name text NOT NULL DEFAULT ''");
  await query("ALTER TABLE local_radar_configs ADD COLUMN IF NOT EXISTS gbp_location_title text NOT NULL DEFAULT ''");
  await query("CREATE TABLE IF NOT EXISTS local_radar_google_connections (id text PRIMARY KEY, account_email text NOT NULL DEFAULT '', access_token_encrypted text NOT NULL DEFAULT '', refresh_token_encrypted text NOT NULL DEFAULT '', token_expires_at timestamptz, scope text NOT NULL DEFAULT '', connected_by text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())");
  await query("CREATE TABLE IF NOT EXISTS local_radar_google_oauth_states (state_hash text PRIMARY KEY, code_verifier_encrypted text NOT NULL, return_url text NOT NULL DEFAULT '/', created_by text NOT NULL DEFAULT '', expires_at timestamptz NOT NULL, used_at timestamptz)");
  await query("CREATE TABLE IF NOT EXISTS local_radar_performance_snapshots (id text PRIMARY KEY, client_id text NOT NULL REFERENCES clientes(registro_id) ON DELETE CASCADE, location_name text NOT NULL, start_date date NOT NULL, end_date date NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id, location_name, start_date, end_date))");
  await query("CREATE TABLE IF NOT EXISTS local_radar_monthly_snapshots (id text PRIMARY KEY, client_id text NOT NULL REFERENCES clientes(registro_id) ON DELETE CASCADE, competence text NOT NULL, scan_id text REFERENCES local_radar_scans(id) ON DELETE SET NULL, keyword text NOT NULL DEFAULT '', radar jsonb NOT NULL DEFAULT '{}'::jsonb, gbp jsonb NOT NULL DEFAULT '{}'::jsonb, search_keywords jsonb NOT NULL DEFAULT '[]'::jsonb, profile jsonb NOT NULL DEFAULT '{}'::jsonb, reviews jsonb NOT NULL DEFAULT '{}'::jsonb, competitors jsonb NOT NULL DEFAULT '[]'::jsonb, comparison jsonb NOT NULL DEFAULT '{}'::jsonb, raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, generated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,competence,keyword))");
  await query("CREATE TABLE IF NOT EXISTS local_radar_monthly_intelligence (id text PRIMARY KEY, client_id text NOT NULL REFERENCES clientes(registro_id) ON DELETE CASCADE, competence text NOT NULL, keyword text NOT NULL DEFAULT '', snapshot_id text REFERENCES local_radar_monthly_snapshots(id) ON DELETE SET NULL, status text NOT NULL DEFAULT 'pending', analysis jsonb NOT NULL DEFAULT '{}'::jsonb, actions jsonb NOT NULL DEFAULT '[]'::jsonb, error text NOT NULL DEFAULT '', generated_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,competence,keyword))");
  await query('CREATE INDEX IF NOT EXISTS idx_local_radar_scans_client_created ON local_radar_scans(client_id, created_at DESC)');
  await query("CREATE TABLE IF NOT EXISTS local_radar_jobs (id text PRIMARY KEY, client_id text, source text NOT NULL DEFAULT 'client', input jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'queued', grid_size integer NOT NULL DEFAULT 5, radius_km numeric(8,2) NOT NULL DEFAULT 3, keyword text NOT NULL DEFAULT '', include_competitors boolean NOT NULL DEFAULT true, completed integer NOT NULL DEFAULT 0, total integer NOT NULL DEFAULT 0, points jsonb NOT NULL DEFAULT '[]'::jsonb, scan_id text NOT NULL DEFAULT '', error text NOT NULL DEFAULT '', started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
  await query('CREATE INDEX IF NOT EXISTS idx_local_radar_jobs_status_updated ON local_radar_jobs(status, updated_at)');
  await query('CREATE INDEX IF NOT EXISTS idx_local_radar_reports_client_created ON local_radar_reports(client_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_local_radar_performance_client_created ON local_radar_performance_snapshots(client_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_local_radar_monthly_snapshots_client_competence ON local_radar_monthly_snapshots(client_id,competence DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_local_radar_monthly_intelligence_client_competence ON local_radar_monthly_intelligence(client_id,competence DESC)');
}

function googleBusinessConfigured(){
  return Boolean(GBP_OAUTH_CLIENT_ID && GBP_OAUTH_CLIENT_SECRET);
}

function googleBusinessPublicOrigin(req){
  const configured=String(process.env.PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/$/,'');
  if(configured) return configured;
  const proto=String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host=String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host?proto+'://'+host:'';
}

function googleBusinessRedirectUri(req){
  const configured=String(process.env.GOOGLE_BUSINESS_OAUTH_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  return configured || googleBusinessPublicOrigin(req)+'/google-business-callback';
}

function googleBusinessPkceChallenge(verifier){
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function googleBusinessJson(url,options={}){
  const response=await fetch(url,options);
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=body?.error?.message || body?.error_description || body?.error || 'Erro ao consultar o Google Business Profile.';
    const error=new Error(String(message));
    error.status=response.status===401?401:502;
    error.googleStatus=response.status;
    throw error;
  }
  return body;
}

async function googleBusinessConnection(){
  await ensureLocalRadarTables();
  const found=await query("SELECT * FROM local_radar_google_connections WHERE id='leme-google-business' LIMIT 1");
  return found.rows[0]||null;
}

async function googleBusinessAccessToken(){
  const connection=await googleBusinessConnection();
  if(!connection) fail('Conecte a conta Google Business na aba Insights GBP.',409);
  let accessToken=decryptIntegrationSecret(connection.access_token_encrypted||'');
  const expiresAt=connection.token_expires_at?new Date(connection.token_expires_at).getTime():0;
  if(accessToken && expiresAt>Date.now()+60_000) return accessToken;
  const refreshToken=decryptIntegrationSecret(connection.refresh_token_encrypted||'');
  if(!refreshToken) fail('A conexão Google expirou. Conecte a conta novamente.',409);
  const params=new URLSearchParams({
    client_id:GBP_OAUTH_CLIENT_ID,
    client_secret:GBP_OAUTH_CLIENT_SECRET,
    refresh_token:refreshToken,
    grant_type:'refresh_token'
  });
  const refreshed=await googleBusinessJson('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:params
  });
  accessToken=String(refreshed.access_token||'');
  if(!accessToken) fail('O Google não devolveu um token de acesso válido.',502);
  const nextExpiry=new Date(Date.now()+Math.max(300,Number(refreshed.expires_in||3600))*1000);
  await query("UPDATE local_radar_google_connections SET access_token_encrypted=$1,token_expires_at=$2,scope=COALESCE(NULLIF($3,''),scope),updated_at=now() WHERE id='leme-google-business'",[
    encryptIntegrationSecret(accessToken),nextExpiry.toISOString(),String(refreshed.scope||'')
  ]);
  return accessToken;
}

async function googleBusinessAuthorizedJson(url,options={}){
  const token=await googleBusinessAccessToken();
  try{
    return await googleBusinessJson(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+token}});
  }catch(error){
    if(error.googleStatus!==401) throw error;
    await query("UPDATE local_radar_google_connections SET access_token_encrypted='',token_expires_at=NULL WHERE id='leme-google-business'");
    const refreshed=await googleBusinessAccessToken();
    return googleBusinessJson(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+refreshed}});
  }
}

function googleBusinessDateParts(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) fail('Informe as datas no formato AAAA-MM-DD.');
  return {year:Number(match[1]),month:Number(match[2]),day:Number(match[3])};
}

function googleBusinessDateRange(startDate,endDate){
  const start=googleBusinessDateParts(startDate),end=googleBusinessDateParts(endDate);
  const startMs=Date.UTC(start.year,start.month-1,start.day),endMs=Date.UTC(end.year,end.month-1,end.day);
  if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs>endMs) fail('O período dos insights é inválido.');
  if((endMs-startMs)/86400000>548) fail('Consulte no máximo 18 meses por relatório.');
  return {start,end};
}

function googleBusinessLocationName(value){
  const clean=String(value||'').trim().replace(/^.*?(locations\/)/,'$1');
  if(!/^locations\/[^/]+$/.test(clean)) fail('Selecione um perfil válido do Google Business.');
  return clean;
}

async function googleBusinessListLocations(){
  const token=await googleBusinessAccessToken();
  const accounts=[];
  let accountToken='';
  do{
    const url=new URL('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
    url.searchParams.set('pageSize','20');
    if(accountToken) url.searchParams.set('pageToken',accountToken);
    const body=await googleBusinessJson(url,{headers:{Authorization:'Bearer '+token}});
    accounts.push(...(body.accounts||[]));
    accountToken=String(body.nextPageToken||'');
  }while(accountToken&&accounts.length<200);

  const locations=[];
  for(const account of accounts){
    let pageToken='';
    do{
      const url=new URL('https://mybusinessbusinessinformation.googleapis.com/v1/'+account.name+'/locations');
      url.searchParams.set('readMask','name,title,storefrontAddress,phoneNumbers,websiteUri,metadata,latlng,regularHours,specialHours,moreHours,categories,serviceItems,profile,openInfo,labels');
      url.searchParams.set('pageSize','100');
      if(pageToken) url.searchParams.set('pageToken',pageToken);
      const body=await googleBusinessJson(url,{headers:{Authorization:'Bearer '+token}});
      for(const location of (body.locations||[])) locations.push({
        account_name:account.name,
        account_display_name:account.accountName||account.name,
        location_name:location.name,
        title:location.title||'Perfil sem nome',
        address:location.storefrontAddress||{},
        phone_numbers:location.phoneNumbers||{},
        website_uri:location.websiteUri||'',
        metadata:location.metadata||{},
        latlng:location.latlng||null,
        regular_hours:location.regularHours||null,
        special_hours:location.specialHours||null,
        more_hours:location.moreHours||[],
        categories:location.categories||{},
        service_items:location.serviceItems||[],
        profile:location.profile||{},
        open_info:location.openInfo||{},
        labels:location.labels||[]
      });
      pageToken=String(body.nextPageToken||'');
    }while(pageToken&&locations.length<2000);
  }
  return {accounts,locations};
}

function googleBusinessSeriesRows(raw){
  const groups=Array.isArray(raw?.multiDailyMetricTimeSeries)?raw.multiDailyMetricTimeSeries:[];
  return groups.flatMap(group=>Array.isArray(group?.dailyMetricTimeSeries)?group.dailyMetricTimeSeries:[]);
}

function googleBusinessNormalizePerformance(raw,keywords,meta){
  const totals=Object.fromEntries(GBP_CORE_METRICS.map(metric=>[metric,0]));
  const dailyByDate=new Map();
  for(const series of googleBusinessSeriesRows(raw)){
    const metric=String(series?.dailyMetric||'');
    const values=Array.isArray(series?.timeSeries?.datedValues)?series.timeSeries.datedValues:[];
    for(const item of values){
      const date=item?.date||{};
      const key=[date.year,String(date.month||0).padStart(2,'0'),String(date.day||0).padStart(2,'0')].join('-');
      const value=Number(item?.value||0)||0;
      totals[metric]=(totals[metric]||0)+value;
      if(!dailyByDate.has(key)) dailyByDate.set(key,{date:key});
      dailyByDate.get(key)[metric]=(dailyByDate.get(key)[metric]||0)+value;
    }
  }
  const impressions={
    desktop_maps:totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS||0,
    desktop_search:totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH||0,
    mobile_maps:totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS||0,
    mobile_search:totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH||0
  };
  impressions.total=impressions.desktop_maps+impressions.desktop_search+impressions.mobile_maps+impressions.mobile_search;
  const actions={
    calls:totals.CALL_CLICKS||0,
    directions:totals.BUSINESS_DIRECTION_REQUESTS||0,
    website:totals.WEBSITE_CLICKS||0,
    bookings:totals.BUSINESS_BOOKINGS||0,
    food_orders:totals.BUSINESS_FOOD_ORDERS||0,
    food_menu_clicks:totals.BUSINESS_FOOD_MENU_CLICKS||0
  };
  actions.total=Object.values(actions).reduce((sum,value)=>sum+Number(value||0),0);
  const normalizedKeywords=(keywords||[]).map(item=>({
    keyword:String(item?.searchKeyword||''),
    value:item?.insightsValue?.value!==undefined?Number(item.insightsValue.value||0):null,
    threshold:item?.insightsValue?.threshold!==undefined?Number(item.insightsValue.threshold||0):null
  })).sort((a,b)=>(b.value??b.threshold??0)-(a.value??a.threshold??0)).slice(0,30);
  return {
    available:true,
    source:'Google Business Profile Performance API',
    location_name:meta.location_name,
    location_title:meta.location_title||'',
    period:{start_date:meta.start_date,end_date:meta.end_date},
    impressions,
    actions,
    interaction_rate:impressions.total?Number((actions.total/impressions.total*100).toFixed(1)):0,
    daily:Array.from(dailyByDate.values()).sort((a,b)=>a.date.localeCompare(b.date)),
    search_keywords:normalizedKeywords,
    fetched_at:nowIso()
  };
}

async function googleBusinessFetchPerformance({clientId,locationName,startDate,endDate,locationTitle='',persist=true}){
  const location=googleBusinessLocationName(locationName);
  const range=googleBusinessDateRange(startDate,endDate);
  const url=new URL('https://businessprofileperformance.googleapis.com/v1/'+location+':fetchMultiDailyMetricsTimeSeries');
  GBP_CORE_METRICS.forEach(metric=>url.searchParams.append('dailyMetrics',metric));
  for(const [prefix,date] of [['dailyRange.start_date',range.start],['dailyRange.end_date',range.end]]){
    url.searchParams.set(prefix+'.year',String(date.year));
    url.searchParams.set(prefix+'.month',String(date.month));
    url.searchParams.set(prefix+'.day',String(date.day));
  }
  const raw=await googleBusinessAuthorizedJson(url);
  const keywords=[];
  let pageToken='';
  do{
    const kwUrl=new URL('https://businessprofileperformance.googleapis.com/v1/'+location+'/searchkeywords/impressions/monthly');
    kwUrl.searchParams.set('monthlyRange.start_month.year',String(range.start.year));
    kwUrl.searchParams.set('monthlyRange.start_month.month',String(range.start.month));
    kwUrl.searchParams.set('monthlyRange.end_month.year',String(range.end.year));
    kwUrl.searchParams.set('monthlyRange.end_month.month',String(range.end.month));
    kwUrl.searchParams.set('pageSize','100');
    if(pageToken) kwUrl.searchParams.set('pageToken',pageToken);
    try{
      const page=await googleBusinessAuthorizedJson(kwUrl);
      keywords.push(...(page.searchKeywordsCounts||[]));
      pageToken=String(page.nextPageToken||'');
    }catch(error){
      console.warn('Google Business search keywords:',error.message);
      pageToken='';
    }
  }while(pageToken&&keywords.length<500);
  const normalized=googleBusinessNormalizePerformance(raw,keywords,{location_name:location,location_title:locationTitle,start_date:startDate,end_date:endDate});
  if(persist&&clientId){
    await query("INSERT INTO local_radar_performance_snapshots (id,client_id,location_name,start_date,end_date,data,created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,now()) ON CONFLICT (client_id,location_name,start_date,end_date) DO UPDATE SET data=$6::jsonb,created_at=now()",[
      'gbp_perf_'+crypto.randomUUID(),clientId,location,startDate,endDate,JSON.stringify(normalized)
    ]);
  }
  return normalized;
}

function googleBusinessMonthRange(monthKey='',fallback=new Date()){
  const match=String(monthKey||'').match(/^(\d{4})-(\d{2})$/);
  let year,month;
  const now=new Date();
  if(match){
    year=Number(match[1]);month=Number(match[2]);
    // A automação roda no início do mês. Nesse caso, o período completo mais
    // recente é o mês anterior; evita também consultar datas futuras na API.
    if(year>now.getUTCFullYear()||(year===now.getUTCFullYear()&&month>=now.getUTCMonth()+1)){
      month-=1;
      if(month<1){month=12;year-=1;}
    }
  }else{
    const date=new Date(fallback||Date.now());
    year=date.getUTCFullYear();month=date.getUTCMonth()+1;
    if(year>now.getUTCFullYear()||(year===now.getUTCFullYear()&&month>=now.getUTCMonth()+1)){
      month-=1;
      if(month<1){month=12;year-=1;}
    }
  }
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  return {start_date:year+'-'+String(month).padStart(2,'0')+'-01',end_date:year+'-'+String(month).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0')};
}

async function googleBusinessPerformanceForClient(clientId,monthKey='',fallbackDate=''){
  await ensureLocalRadarTables();
  const config=(await query('SELECT place_id,gbp_account_name,gbp_location_name,gbp_location_title FROM local_radar_configs WHERE client_id=$1 LIMIT 1',[clientId])).rows[0];
  if(!config) return {available:false,reason:'Configuração do Local Radar não encontrada para o cliente.'};
  if(!config.gbp_location_name&&config.place_id){
    try{
      const synced=await googleBusinessListLocations();
      const match=synced.locations.find(location=>String(location?.metadata?.placeId||'')===String(config.place_id));
      if(match){
        config.gbp_account_name=match.account_name||'';
        config.gbp_location_name=match.location_name||'';
        config.gbp_location_title=match.title||'';
        await query('UPDATE local_radar_configs SET gbp_account_name=$2,gbp_location_name=$3,gbp_location_title=$4,updated_at=now() WHERE client_id=$1',[clientId,config.gbp_account_name,config.gbp_location_name,config.gbp_location_title]);
      }
    }catch(error){console.warn('Google Business auto vínculo:',error.message);}
  }
  if(!config.gbp_location_name) return {available:false,reason:'Perfil do Google Business ainda não vinculado ao cliente.'};
  const range=googleBusinessMonthRange(monthKey,fallbackDate);
  try{
    return await googleBusinessFetchPerformance({clientId,locationName:config.gbp_location_name,locationTitle:config.gbp_location_title,startDate:range.start_date,endDate:range.end_date,persist:true});
  }catch(error){
    console.warn('Google Business Performance:',error.message);
    const cached=await query('SELECT data FROM local_radar_performance_snapshots WHERE client_id=$1 AND location_name=$2 AND start_date=$3 AND end_date=$4 ORDER BY created_at DESC LIMIT 1',[clientId,config.gbp_location_name,range.start_date,range.end_date]);
    if(cached.rows[0]?.data) return {...cached.rows[0].data,stale:true,warning:'Não foi possível atualizar os insights agora; exibindo a última coleta disponível.'};
    return {available:false,reason:error.message};
  }
}

function localRadarShiftMonthKey(monthKey,offset){
  const match=String(monthKey||'').match(/^(\d{4})-(\d{2})$/);
  if(!match) return '';
  const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1+Number(offset||0),1));
  return date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0');
}

function localRadarClosedCompetenceKey(){
  const parts=saoPauloParts();
  return localRadarShiftMonthKey(String(parts.year)+'-'+String(parts.month).padStart(2,'0'),-1);
}

function localRadarExactMonthRange(monthKey){
  const match=String(monthKey||'').match(/^(\d{4})-(\d{2})$/);
  if(!match) return null;
  const year=Number(match[1]),month=Number(match[2]);
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  return {start_date:monthKey+'-01',end_date:monthKey+'-'+String(lastDay).padStart(2,'0')};
}

function localRadarResolveCompetence(monthKey=''){
  return /^\d{4}-\d{2}$/.test(String(monthKey||''))?String(monthKey):localRadarClosedCompetenceKey();
}

async function googleBusinessProfileSnapshotForClient(clientId){
  await ensureLocalRadarTables();
  const config=(await query('SELECT gbp_account_name,gbp_location_name,gbp_location_title FROM local_radar_configs WHERE client_id=$1 LIMIT 1',[clientId])).rows[0]||{};
  const locationName=String(config.gbp_location_name||'');
  if(!locationName) return {available:false,reason:'Perfil GBP não vinculado.'};
  const readMask='name,title,storefrontAddress,phoneNumbers,websiteUri,metadata,latlng,regularHours,specialHours,moreHours,categories,serviceItems,profile,openInfo,labels';
  const url=new URL('https://mybusinessbusinessinformation.googleapis.com/v1/'+googleBusinessLocationName(locationName));
  url.searchParams.set('readMask',readMask);
  try{
    const location=await googleBusinessAuthorizedJson(url);
    let attributes={};
    try{
      const attributesUrl=new URL('https://mybusinessbusinessinformation.googleapis.com/v1/'+googleBusinessLocationName(locationName)+'/attributes');
      attributesUrl.searchParams.set('attributeMask','*');
      attributes=await googleBusinessAuthorizedJson(attributesUrl);
    }catch(error){console.warn('Google Business attributes:',error.message);}
    return {
      available:true,
      source:'Google Business Profile Business Information API',
      location_name:locationName,
      account_name:String(config.gbp_account_name||''),
      title:location.title||config.gbp_location_title||'',
      address:location.storefrontAddress||{},
      phone_numbers:location.phoneNumbers||{},
      website_uri:location.websiteUri||'',
      categories:location.categories||{},
      services:Array.isArray(location.serviceItems)?location.serviceItems:[],
      description:location.profile?.description||'',
      regular_hours:location.regularHours||{},
      special_hours:location.specialHours||{},
      more_hours:Array.isArray(location.moreHours)?location.moreHours:[],
      open_info:location.openInfo||{},
      attributes:Array.isArray(attributes.attributes)?attributes.attributes:[],
      metadata:location.metadata||{},
      labels:Array.isArray(location.labels)?location.labels:[],
      fetched_at:nowIso()
    };
  }catch(error){
    console.warn('Google Business profile snapshot:',error.message);
    return {available:false,reason:error.message,location_name:locationName,title:config.gbp_location_title||''};
  }
}

function googleBusinessStarNumber(value){
  const map={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5,STAR_RATING_UNSPECIFIED:0};
  return map[String(value||'')]||Number(value||0)||0;
}

async function googleBusinessReviewsSnapshotForClient(clientId,startDate,endDate){
  await ensureLocalRadarTables();
  const config=(await query('SELECT gbp_account_name,gbp_location_name FROM local_radar_configs WHERE client_id=$1 LIMIT 1',[clientId])).rows[0]||{};
  const account=String(config.gbp_account_name||''),location=String(config.gbp_location_name||'');
  if(!account||!location) return {available:false,reason:'Conta ou perfil GBP não vinculado.'};
  const parent=account.replace(/\/$/,'')+'/'+googleBusinessLocationName(location);
  const reviews=[];
  let pageToken='',averageRating=null,totalReviewCount=null;
  try{
    do{
      const url=new URL('https://mybusiness.googleapis.com/v4/'+parent+'/reviews');
      url.searchParams.set('pageSize','50');
      url.searchParams.set('orderBy','updateTime desc');
      if(pageToken)url.searchParams.set('pageToken',pageToken);
      const page=await googleBusinessAuthorizedJson(url);
      reviews.push(...(page.reviews||[]));
      if(averageRating===null&&page.averageRating!==undefined)averageRating=Number(page.averageRating);
      if(totalReviewCount===null&&page.totalReviewCount!==undefined)totalReviewCount=Number(page.totalReviewCount);
      pageToken=String(page.nextPageToken||'');
    }while(pageToken&&reviews.length<500);
    const startMs=new Date(startDate+'T00:00:00Z').getTime(),endMs=new Date(endDate+'T23:59:59Z').getTime();
    const inPeriod=reviews.filter(review=>{const time=new Date(review.createTime||review.updateTime||0).getTime();return time>=startMs&&time<=endMs;});
    const distribution={1:0,2:0,3:0,4:0,5:0};
    reviews.forEach(review=>{const star=googleBusinessStarNumber(review.starRating);if(distribution[star]!==undefined)distribution[star]++;});
    return {
      available:true,
      source:'Google Business Profile Reviews API',
      average_rating:averageRating,
      total_review_count:totalReviewCount??reviews.length,
      new_reviews:inPeriod.length,
      unanswered_reviews:reviews.filter(review=>!review.reviewReply).length,
      star_distribution:distribution,
      sample:reviews.slice(0,20).map(review=>({
        review_id:review.reviewId||'',star_rating:googleBusinessStarNumber(review.starRating),comment:String(review.comment||'').slice(0,1200),
        create_time:review.createTime||'',update_time:review.updateTime||'',has_reply:Boolean(review.reviewReply),reply_time:review.reviewReply?.updateTime||''
      })),
      fetched_at:nowIso()
    };
  }catch(error){
    console.warn('Google Business reviews:',error.message);
    return {available:false,reason:error.message};
  }
}

function localRadarTop1Percent(scan){
  const points=Array.isArray(scan?.points)?scan.points:[];
  return Number((points.filter(point=>Number(point?.position)===1).length/Math.max(points.length,1)*100).toFixed(1));
}

function localRadarNumericDelta(current,previous,{lowerIsBetter=false,percentagePoints=false}={}){
  if(current===null||current===undefined||current===''||previous===null||previous===undefined||previous==='')return {available:false,label:'Primeiro mês de acompanhamento'};
  const a=Number(current),b=Number(previous);
  if(!Number.isFinite(a)||!Number.isFinite(b))return {available:false,label:'Primeiro mês de acompanhamento'};
  const difference=Number((a-b).toFixed(2));
  const effective=lowerIsBetter?-difference:difference;
  const label=Math.abs(difference)<.005?'Estável':(effective>0?'Melhorou ':'Piorou ')+Math.abs(difference).toLocaleString('pt-BR',{maximumFractionDigits:2})+(percentagePoints?' p.p.':'');
  return {available:true,current:a,previous:b,difference,effective_direction:effective>0?'improved':effective<0?'worsened':'stable',percentage:b!==0?Number(((a-b)/Math.abs(b)*100).toFixed(1)):null,label};
}

function localRadarKeywordValue(item){
  if(item?.value!==null&&item?.value!==undefined)return {exact:true,value:Number(item.value||0),display:String(Number(item.value||0))};
  if(item?.threshold!==null&&item?.threshold!==undefined)return {exact:false,value:null,threshold:Number(item.threshold||0),display:'baixo volume (<'+Number(item.threshold||0)+')'};
  return {exact:false,value:null,display:'indisponível'};
}

function localRadarCompareKeywords(current=[],previous=[],radarKeyword=''){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const previousMap=new Map((previous||[]).map(item=>[normalize(item.keyword),item]));
  const rows=(current||[]).map(item=>{
    const previousItem=previousMap.get(normalize(item.keyword));
    const currentValue=localRadarKeywordValue(item),previousValue=localRadarKeywordValue(previousItem);
    const canCompare=Boolean(previousItem&&currentValue.exact&&previousValue.exact);
    const delta=canCompare?localRadarNumericDelta(currentValue.value,previousValue.value):{available:false,label:previousItem?'Comparação indisponível para volume censurado':'Novo termo'};
    return {
      keyword:item.keyword,current:currentValue,previous:previousItem?previousValue:null,delta,
      radar:{monitored:normalize(item.keyword)===normalize(radarKeyword),keyword:radarKeyword||''}
    };
  });
  const currentKeys=new Set(rows.map(row=>normalize(row.keyword)));
  for(const item of (previous||[]))if(!currentKeys.has(normalize(item.keyword)))rows.push({keyword:item.keyword,current:null,previous:localRadarKeywordValue(item),delta:{available:false,label:'Deixou de aparecer'},radar:{monitored:normalize(item.keyword)===normalize(radarKeyword),keyword:radarKeyword||''}});
  return rows;
}

function localRadarPointsEquivalent(currentScan,previousScan){
  const current=Array.isArray(currentScan?.points)?currentScan.points:[],previous=Array.isArray(previousScan?.points)?previousScan.points:[];
  if(!current.length||current.length!==previous.length)return false;
  const map=new Map(previous.map(point=>[String(point.row)+':'+String(point.col),point]));
  return current.every(point=>{const other=map.get(String(point.row)+':'+String(point.col));return other&&Math.abs(Number(point.lat)-Number(other.lat))<.00005&&Math.abs(Number(point.lng)-Number(other.lng))<.00005;});
}

function localRadarCompareScans(currentScan,previousScan){
  const currentSummary=currentScan?.summary||{},previousSummary=previousScan?.summary||{};
  const currentTop1=localRadarTop1Percent(currentScan),previousTop1=previousScan?localRadarTop1Percent(previousScan):null;
  const result={
    has_previous:Boolean(previousScan),
    metrics:{
      average_position:localRadarNumericDelta(currentSummary.averagePosition,previousSummary.averagePosition,{lowerIsBetter:true}),
      top1:localRadarNumericDelta(currentTop1,previousTop1,{percentagePoints:true}),
      top3:localRadarNumericDelta(currentSummary.top3Percent,previousSummary.top3Percent,{percentagePoints:true}),
      top10:localRadarNumericDelta(currentSummary.top10Percent,previousSummary.top10Percent,{percentagePoints:true}),
      not_found:localRadarNumericDelta(currentSummary.notFoundPercent,previousSummary.notFoundPercent,{lowerIsBetter:true,percentagePoints:true})
    },
    point_comparison:{available:false,improved:0,worsened:0,stable:0,points:[]}
  };
  if(previousScan&&localRadarPointsEquivalent(currentScan,previousScan)){
    const previousMap=new Map(previousScan.points.map(point=>[String(point.row)+':'+String(point.col),point]));
    const points=currentScan.points.map(point=>{
      const previousPoint=previousMap.get(String(point.row)+':'+String(point.col));
      const currentPosition=point.position===null?999:Number(point.position),previousPosition=previousPoint?.position===null?999:Number(previousPoint?.position);
      const change=currentPosition<previousPosition?'improved':currentPosition>previousPosition?'worsened':'stable';
      return {row:point.row,col:point.col,lat:point.lat,lng:point.lng,current_position:point.position??null,previous_position:previousPoint?.position??null,change};
    });
    result.point_comparison={available:true,improved:points.filter(p=>p.change==='improved').length,worsened:points.filter(p=>p.change==='worsened').length,stable:points.filter(p=>p.change==='stable').length,points};
  }
  return result;
}

function localRadarCompareCompetitors(current=[],previous=[]){
  const previousMap=new Map((previous||[]).map(item=>[String(item.placeId||item.place_id||item.name||'').toLowerCase(),item]));
  const currentKeys=new Set();
  const rows=(current||[]).slice(0,30).map((item,index)=>{
    const key=String(item.placeId||item.place_id||item.name||'').toLowerCase();currentKeys.add(key);
    const before=previousMap.get(key);
    return {...item,current_rank:index+1,previous_rank:before?(previous||[]).indexOf(before)+1:null,average_delta:localRadarNumericDelta(item.averagePosition,before?.averagePosition,{lowerIsBetter:true}),status:before?'tracked':'new_relevant'};
  });
  for(const item of (previous||[]).slice(0,10)){
    const key=String(item.placeId||item.place_id||item.name||'').toLowerCase();
    if(!currentKeys.has(key))rows.push({...item,current_rank:null,previous_rank:(previous||[]).indexOf(item)+1,status:'lost_presence'});
  }
  return rows;
}

function localRadarProfileChanges(current={},previous={}){
  if(!previous?.available)return [];
  const fields=['categories','services','description','phone_numbers','website_uri','regular_hours','attributes','open_info'];
  return fields.filter(field=>JSON.stringify(current?.[field]??null)!==JSON.stringify(previous?.[field]??null)).map(field=>({field,changed:true}));
}

async function localRadarPreviousMonthlySnapshot(clientId,competence,keyword){
  const previousCompetence=localRadarShiftMonthKey(competence,-1);
  const found=await query('SELECT * FROM local_radar_monthly_snapshots WHERE client_id=$1 AND competence=$2 AND keyword=$3 LIMIT 1',[clientId,previousCompetence,keyword]);
  if(found.rows[0])return found.rows[0];
  const report=await query('SELECT r.*,s.* FROM local_radar_reports r JOIN local_radar_scans s ON s.id=r.scan_id WHERE r.client_id=$1 AND r.month_key=$2 AND s.keyword=$3 ORDER BY r.created_at DESC LIMIT 1',[clientId,previousCompetence,keyword]);
  if(!report.rows[0])return null;
  const row=report.rows[0];
  const scan={...row,center:{lat:row.center_lat,lng:row.center_lng}};
  const range=localRadarExactMonthRange(previousCompetence);
  const perf=(await query('SELECT data FROM local_radar_performance_snapshots WHERE client_id=$1 AND start_date=$2 AND end_date=$3 ORDER BY created_at DESC LIMIT 1',[clientId,range.start_date,range.end_date])).rows[0]?.data||{};
  return {competence:previousCompetence,scan_id:scan.id,radar:scan,gbp:perf,search_keywords:perf.search_keywords||[],profile:{},reviews:{},competitors:scan.competitors||[]};
}

async function localRadarBuildMonthlySnapshot(clientId,scan,competence,{refresh=true}={}){
  await ensureLocalRadarTables();
  const key=localRadarResolveCompetence(competence),keyword=String(scan?.keyword||'');
  if(!refresh){
    const cached=await query('SELECT * FROM local_radar_monthly_snapshots WHERE client_id=$1 AND competence=$2 AND keyword=$3 LIMIT 1',[clientId,key,keyword]);
    if(cached.rows[0])return cached.rows[0];
  }
  const range=localRadarExactMonthRange(key);
  const performance=await googleBusinessPerformanceForClient(clientId,key,scan?.created_at||scan?.createdAt);
  const [profile,reviews,previous]=await Promise.all([
    googleBusinessProfileSnapshotForClient(clientId),
    googleBusinessReviewsSnapshotForClient(clientId,range.start_date,range.end_date),
    localRadarPreviousMonthlySnapshot(clientId,key,keyword)
  ]);
  const previousRadar=previous?.radar||null,previousGbp=previous?.gbp||{},previousProfile=previous?.profile||{},previousReviews=previous?.reviews||{};
  const gbpComparison={
    impressions:localRadarNumericDelta(performance?.impressions?.total,previousGbp?.impressions?.total),
    interactions:localRadarNumericDelta(performance?.actions?.total,previousGbp?.actions?.total),
    calls:localRadarNumericDelta(performance?.actions?.calls,previousGbp?.actions?.calls),
    directions:localRadarNumericDelta(performance?.actions?.directions,previousGbp?.actions?.directions),
    website:localRadarNumericDelta(performance?.actions?.website,previousGbp?.actions?.website),
    bookings:localRadarNumericDelta(performance?.actions?.bookings,previousGbp?.actions?.bookings)
  };
  const comparison={
    previous_competence:localRadarShiftMonthKey(key,-1),
    first_month:!previous,
    radar:localRadarCompareScans(scan,previousRadar),
    gbp:gbpComparison,
    keywords:localRadarCompareKeywords(performance?.search_keywords||[],previous?.search_keywords||previousGbp?.search_keywords||[],keyword),
    competitors:localRadarCompareCompetitors(scan?.competitors||[],previous?.competitors||previousRadar?.competitors||[]),
    profile_changes:localRadarProfileChanges(profile,previousProfile),
    reviews:{
      rating:localRadarNumericDelta(reviews?.average_rating,previousReviews?.average_rating),
      total:localRadarNumericDelta(reviews?.total_review_count,previousReviews?.total_review_count),
      unanswered_current:reviews?.unanswered_reviews??null
    }
  };
  const radar={...scan,summary:{...(scan?.summary||{}),top1Percent:localRadarTop1Percent(scan)}};
  const raw={current_month:{competence:key,radar,gbp:performance,profile,reviews,competitors:scan?.competitors||[]},previous_month:previous?{competence:previous.competence,radar:previousRadar,gbp:previousGbp,profile:previousProfile,reviews:previousReviews,competitors:previous.competitors||[]}:null,deltas:comparison};
  const id='radar_month_'+crypto.randomUUID();
  const saved=await query("INSERT INTO local_radar_monthly_snapshots (id,client_id,competence,scan_id,keyword,radar,gbp,search_keywords,profile,reviews,competitors,comparison,raw_snapshot,generated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,now()) ON CONFLICT (client_id,competence,keyword) DO UPDATE SET scan_id=$4,radar=$6::jsonb,gbp=$7::jsonb,search_keywords=$8::jsonb,profile=$9::jsonb,reviews=$10::jsonb,competitors=$11::jsonb,comparison=$12::jsonb,raw_snapshot=$13::jsonb,generated_at=now() RETURNING *",[
    id,clientId,key,scan?.id||null,keyword,JSON.stringify(radar),JSON.stringify(performance||{}),JSON.stringify(performance?.search_keywords||[]),JSON.stringify(profile||{}),JSON.stringify(reviews||{}),JSON.stringify(scan?.competitors||[]),JSON.stringify(comparison),JSON.stringify(raw)
  ]);
  return saved.rows[0];
}

async function localRadarSaveIntelligence({clientId,competence,keyword='',snapshotId=null,status='pending',analysis={},actions=[],error=''}){
  await ensureLocalRadarTables();
  const id='radar_intel_'+crypto.randomUUID();
  const saved=await query("INSERT INTO local_radar_monthly_intelligence (id,client_id,competence,keyword,snapshot_id,status,analysis,actions,error,generated_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,CASE WHEN $6='completed' THEN now() ELSE NULL END,now()) ON CONFLICT (client_id,competence,keyword) DO UPDATE SET snapshot_id=$5,status=$6,analysis=$7::jsonb,actions=$8::jsonb,error=$9,generated_at=CASE WHEN $6='completed' THEN now() ELSE local_radar_monthly_intelligence.generated_at END,updated_at=now() RETURNING *",[
    id,clientId,competence,keyword,snapshotId,status,JSON.stringify(analysis||{}),JSON.stringify(Array.isArray(actions)?actions:[]),String(error||'')
  ]);
  return saved.rows[0];
}

function localRadarParseN8nResponse(text){
  try{return JSON.parse(String(text||'{}'));}catch{return {};}
}

async function googleBusinessOAuthCallbackHandler(req,res){
  try{
    await ensureLocalRadarTables();
    if(req.query.error) throw new Error('A autorização do Google foi cancelada: '+String(req.query.error));
    const state=String(req.query.state||''),code=String(req.query.code||'');
    if(!state||!code) throw new Error('Retorno OAuth incompleto.');
    const stateHash=crypto.createHash('sha256').update(state).digest('hex');
    const found=await query('SELECT * FROM local_radar_google_oauth_states WHERE state_hash=$1 AND used_at IS NULL AND expires_at>now() LIMIT 1',[stateHash]);
    if(!found.rows[0]) throw new Error('Esta autorização expirou. Inicie a conexão novamente no Sistema LEME.');
    await query('UPDATE local_radar_google_oauth_states SET used_at=now() WHERE state_hash=$1',[stateHash]);
    const verifier=decryptIntegrationSecret(found.rows[0].code_verifier_encrypted);
    const redirectUri=String(process.env.GOOGLE_BUSINESS_OAUTH_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim() || googleBusinessPublicOrigin(req)+'/google-business-callback';
    const tokenData=await googleBusinessJson('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
        code,client_id:GBP_OAUTH_CLIENT_ID,client_secret:GBP_OAUTH_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:verifier
      })
    });
    let email='';
    try{
      const user=await googleBusinessJson('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokenData.access_token}});
      email=String(user.email||'');
    }catch{}
    const previous=await googleBusinessConnection();
    const refreshToken=String(tokenData.refresh_token||'') || (previous?decryptIntegrationSecret(previous.refresh_token_encrypted||''):'');
    if(!refreshToken) throw new Error('O Google não devolveu acesso offline. Remova o acesso anterior e conecte novamente.');
    await query("INSERT INTO local_radar_google_connections (id,account_email,access_token_encrypted,refresh_token_encrypted,token_expires_at,scope,connected_by,created_at,updated_at) VALUES ('leme-google-business',$1,$2,$3,$4,$5,$6,now(),now()) ON CONFLICT (id) DO UPDATE SET account_email=$1,access_token_encrypted=$2,refresh_token_encrypted=$3,token_expires_at=$4,scope=$5,connected_by=$6,updated_at=now()",[
      email,encryptIntegrationSecret(tokenData.access_token||''),encryptIntegrationSecret(refreshToken),new Date(Date.now()+Number(tokenData.expires_in||3600)*1000).toISOString(),String(tokenData.scope||GBP_OAUTH_SCOPE),String(found.rows[0].created_by||'')
    ]);
    res.redirect(302,String(found.rows[0].return_url||'/')+(String(found.rows[0].return_url||'/').includes('?')?'&':'?')+'google_business=connected');
  }catch(error){
    console.error('Google Business OAuth:',error);
    const origin=googleBusinessPublicOrigin(req)||'/';
    res.redirect(302,origin+'/?google_business=error&message='+encodeURIComponent(error.message||'Falha ao conectar o Google Business.'));
  }
}

function radarNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function radarGrid(value) { return [3,5,7].includes(Number(value)) ? Number(value) : 5; }
function radarRadius(value) {
  const n = radarNumber(value);
  return n === null ? 3 : Math.min(50, Math.max(0.2, n));
}
function radarPlaceId(value) { return String(value || '').trim().replace(/^places\//, ''); }
function radarRankColor(position) {
  if (!position) return 'gray';
  if (position <= 3) return 'green';
  if (position <= 10) return 'yellow';
  return 'red';
}
function radarHaversine(a,b) {
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function radarGenerateGrid(centerLat, centerLng, gridSize, radiusKm) {
  const grid=radarGrid(gridSize), radius=radarRadius(radiusKm), centerIndex=Math.floor(grid/2);
  const stepKm=grid===1?0:(radius*2)/(grid-1), points=[];
  for(let row=0;row<grid;row++) for(let col=0;col<grid;col++) {
    const northKm=(centerIndex-row)*stepKm, eastKm=(col-centerIndex)*stepKm;
    const lat=centerLat+(northKm/111.32);
    const lng=centerLng+(eastKm/(111.32*Math.cos(centerLat*Math.PI/180)));
    points.push({row,col,lat:Number(lat.toFixed(7)),lng:Number(lng.toFixed(7)),distanceFromCenterKm:Number(radarHaversine({lat:centerLat,lng:centerLng},{lat,lng}).toFixed(2))});
  }
  return points;
}
function radarSearchRadiusMeters(radiusKm, gridSize) {
  const radius=radarRadius(radiusKm), grid=radarGrid(gridSize);
  const stepKm=grid===1?radius:(radius*2)/(grid-1);
  return Math.round(Math.min(Math.max(stepKm*450,500),3000));
}
function radarSummary(points) {
  const valid=points.map(p=>p.position).filter(Boolean), total=Math.max(points.length,1);
  const top3=points.filter(p=>p.position&&p.position<=3).length, top10=points.filter(p=>p.position&&p.position<=10).length;
  return {totalPoints:points.length,averagePosition:valid.length?Number((valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(2)):null,top3Percent:Number((top3/total*100).toFixed(1)),top10Percent:Number((top10/total*100).toFixed(1)),notFoundPercent:Number(((points.length-valid.length)/total*100).toFixed(1)),foundPoints:valid.length,notFoundPoints:points.length-valid.length,bestPosition:valid.length?Math.min(...valid):null,worstPosition:valid.length?Math.max(...valid):null};
}
function radarCompetitors(map,totalPoints) {
  const items=Array.from(map.entries()).map(([placeId,data])=>{
    const avg=data.positions.length?data.positions.reduce((a,b)=>a+b,0)/data.positions.length:null;
    const top10=data.positions.filter(n=>n<=10).length;
    return {
      placeId,
      name:data.name||'Perfil sem nome',
      averagePosition:avg?Number(avg.toFixed(2)):null,
      bestPosition:data.positions.length?Math.min(...data.positions):null,
      worstPosition:data.positions.length?Math.max(...data.positions):null,
      appearances:data.positions.length,
      totalPoints,
      appearancesPercent:Number((data.positions.length/Math.max(totalPoints,1)*100).toFixed(1)),
      top10Percent:Number((top10/Math.max(totalPoints,1)*100).toFixed(1)),
      isTarget:Boolean(data.isTarget)
    };
  }).sort((a,b)=>(a.averagePosition??999)-(b.averagePosition??999)||b.appearances-a.appearances||String(a.name).localeCompare(String(b.name)));

  // Mesmo comportamento do Local Radar antigo: lista até 30 perfis,
  // mas nunca deixa o cliente analisado de fora do ranking.
  const target=items.find(item=>item.isTarget);
  const topItems=items.slice(0,30);
  if(target&&!topItems.some(item=>item.placeId===target.placeId)){
    if(topItems.length>=30) topItems.pop();
    topItems.push(target);
    topItems.sort((a,b)=>(a.averagePosition??999)-(b.averagePosition??999)||b.appearances-a.appearances||String(a.name).localeCompare(String(b.name)));
  }
  return topItems;
}

async function radarGeocode(address, city='') {
  if (!LOCAL_RADAR_GOOGLE_KEY) fail('Configure GOOGLE_MAPS_BACKEND_KEY no EasyPanel para usar o Local Radar.',503);
  const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address',[address,city,'Brasil'].filter(Boolean).join(', '));
  url.searchParams.set('key',LOCAL_RADAR_GOOGLE_KEY); url.searchParams.set('language','pt-BR'); url.searchParams.set('region','br');
  const response=await fetch(url); const json=await response.json();
  if(json.status!=='OK'||!json.results?.[0]?.geometry?.location) fail('Não foi possível localizar esse endereço no Google.');
  const loc=json.results[0].geometry.location;
  return {lat:Number(loc.lat),lng:Number(loc.lng),formattedAddress:json.results[0].formatted_address||''};
}
function radarNormalizeSearchText(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function radarSearchSimilarity(source,target){
  const a=radarNormalizeSearchText(source), b=radarNormalizeSearchText(target);
  if(!a||!b) return 0;
  if(a===b) return 100;
  if(a.includes(b)||b.includes(a)) return 70;
  const tokensA=new Set(a.split(/\s+/).filter(Boolean));
  const tokensB=new Set(b.split(/\s+/).filter(Boolean));
  let common=0;
  for(const token of tokensA) if(tokensB.has(token)) common++;
  return Math.round((common/Math.max(tokensA.size,tokensB.size,1))*60);
}

function radarDistanceKm(lat1,lng1,lat2,lng2){
  const a=radarNumber(lat1),b=radarNumber(lng1),c=radarNumber(lat2),d=radarNumber(lng2);
  if([a,b,c,d].some(v=>v===null)) return null;
  const R=6371,toRad=v=>v*Math.PI/180;
  const dLat=toRad(c-a),dLng=toRad(d-b);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

async function radarPlaceDetails(placeId){
  const pid=radarPlaceId(placeId);
  if(!pid||!/^ChI/i.test(pid)) return null;
  const response=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(pid),{
    headers:{
      'X-Goog-Api-Key':LOCAL_RADAR_GOOGLE_KEY,
      'X-Goog-FieldMask':'id,displayName,formattedAddress,location,googleMapsUri'
    }
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok) return null;
  return {
    place_id:radarPlaceId(json.id),
    name:json.displayName?.text||'',
    address:json.formattedAddress||'',
    lat:json.location?.latitude??null,
    lng:json.location?.longitude??null,
    maps_url:json.googleMapsUri||'',
    exact:true,
    score:999
  };
}

async function radarFindPlaces(text, lat=null, lng=null, options={}) {
  if (!LOCAL_RADAR_GOOGLE_KEY) fail('Configure GOOGLE_MAPS_BACKEND_KEY no EasyPanel para usar o Local Radar.',503);

  const typed=String(text||'').trim();
  const name=String(options.name||'').trim();
  const address=String(options.address||'').trim();
  const city=String(options.city||'').trim();
  const suppliedPlaceId=radarPlaceId(options.place_id||typed);

  if(/^ChI/i.test(suppliedPlaceId)){
    const exact=await radarPlaceDetails(suppliedPlaceId);
    if(exact) return [exact];
  }

  const queries=[
    [name,address,city].filter(Boolean).join(' '),
    [name,city].filter(Boolean).join(' '),
    typed,
    [address,city].filter(Boolean).join(' ')
  ].map(q=>q.trim()).filter(Boolean);

  const uniqueQueries=[...new Set(queries)];
  if(!uniqueQueries.length) fail('Informe o nome, endereço ou Place ID do perfil.');

  const byId=new Map();
  for(const queryText of uniqueQueries.slice(0,4)){
    const body={textQuery:queryText,languageCode:'pt-BR',regionCode:'BR',pageSize:20};
    if(Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))){
      body.locationBias={circle:{center:{latitude:Number(lat),longitude:Number(lng)},radius:30000}};
    }

    const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Goog-Api-Key':LOCAL_RADAR_GOOGLE_KEY,
        'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri'
      },
      body:JSON.stringify(body)
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok) fail(json?.error?.message||'Erro ao consultar Google Places.',502);

    for(const p of (json.places||[])){
      const pid=radarPlaceId(p.id);
      if(!pid) continue;
      const distanceKm=radarDistanceKm(lat,lng,p.location?.latitude,p.location?.longitude);
      const nameScore=radarSearchSimilarity(p.displayName?.text,name||typed);
      const addressScore=radarSearchSimilarity(p.formattedAddress,address||city);
      const distanceScore=distanceKm===null?0:Math.max(0,30-Math.min(30,distanceKm));
      const score=nameScore*2+addressScore+distanceScore;
      const item={
        place_id:pid,
        name:p.displayName?.text||'',
        address:p.formattedAddress||'',
        lat:p.location?.latitude??null,
        lng:p.location?.longitude??null,
        maps_url:p.googleMapsUri||'',
        distance_km:distanceKm===null?null:Number(distanceKm.toFixed(2)),
        score
      };
      const current=byId.get(pid);
      if(!current||item.score>current.score) byId.set(pid,item);
    }
  }

  return Array.from(byId.values())
    .sort((a,b)=>b.score-a.score||(a.distance_km??999)-(b.distance_km??999)||String(a.name).localeCompare(String(b.name),'pt-BR'))
    .slice(0,30);
}

async function radarSearchPoint({keyword,lat,lng,searchRadiusMeters,includeNames=false,targetPlaceId='',maxPages=3}) {
  if (!LOCAL_RADAR_GOOGLE_KEY) fail('Configure GOOGLE_MAPS_BACKEND_KEY no EasyPanel para usar o Local Radar.',503);
  let pageToken=null;
  const places=[];
  const target=radarPlaceId(targetPlaceId);
  const pages=Math.max(1,Math.min(3,Number(maxPages)||3));

  for(let page=0;page<pages;page++) {
    const body={textQuery:keyword,languageCode:'pt-BR',regionCode:'BR',pageSize:20,locationBias:{circle:{center:{latitude:lat,longitude:lng},radius:searchRadiusMeters}}};
    if(pageToken) body.pageToken=pageToken;

    let response=null;
    let json=null;
    for(let attempt=0;attempt<3;attempt++) {
      response=await fetch('https://places.googleapis.com/v1/places:searchText',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Goog-Api-Key':LOCAL_RADAR_GOOGLE_KEY,
          'X-Goog-FieldMask':includeNames?'places.id,places.displayName,nextPageToken':'places.id,nextPageToken'
        },
        body:JSON.stringify(body)
      });
      json=await response.json().catch(()=>({}));
      if(response.ok) break;
      const retryable=Boolean(pageToken) && [400,409,429,500,502,503,504].includes(response.status);
      if(!retryable || attempt===2) fail(json?.error?.message||'Erro ao consultar Google Places.',502);
      await new Promise(r=>setTimeout(r,600*(attempt+1)));
    }

    for(const p of (json?.places||[])){
      const pid=radarPlaceId(p.id);
      if(pid) places.push({id:pid,name:includeNames?(p.displayName?.text||''):''});
    }

    // Igual ao Local Radar antigo: percorre as páginas disponíveis (até 3)
    // para que a posição seja calculada no mesmo universo de resultados.
    if(!json?.nextPageToken) break;
    pageToken=json.nextPageToken;
  }
  return places;
}

async function radarMapLimit(items, limit, worker) {
  const list=Array.from(items||[]);
  const results=new Array(list.length);
  let cursor=0;
  const concurrency=Math.max(1,Math.min(Number(limit)||1,list.length||1));
  const runners=Array.from({length:concurrency},async()=>{
    while(true){
      const index=cursor++;
      if(index>=list.length) return;
      results[index]=await worker(list[index],index);
    }
  });
  await Promise.all(runners);
  return results;
}
async function radarGetConfig(clientId) {
  await ensureLocalRadarTables();
  const client=await getClientRow(clientId);
  const found=await query('SELECT * FROM local_radar_configs WHERE client_id=$1 LIMIT 1',[clientId]);
  const row=found.rows[0]||{};
  return {client_id:clientId,client_name:client.nome_cliente||'Cliente',place_id:row.place_id||'',address:row.address||client.endereco||'',city:row.city||client.cidade||'',profile_lat:row.profile_lat??null,profile_lng:row.profile_lng??null,grid_center_lat:row.grid_center_lat??row.profile_lat??null,grid_center_lng:row.grid_center_lng??row.profile_lng??null,grid_size:radarGrid(row.grid_size||5),radius_km:Number(row.radius_km||3),keyword:row.keyword||client.especialidade||'',include_competitors:row.include_competitors!==false,monthly_enabled:Boolean(row.monthly_enabled),monthly_day:Number(row.monthly_day||5),gbp_account_name:row.gbp_account_name||'',gbp_location_name:row.gbp_location_name||'',gbp_location_title:row.gbp_location_title||'',updated_at:row.updated_at||null};
}
async function radarSaveConfig(clientId,body={}) {
  await getClientRow(clientId); await ensureLocalRadarTables();
  const grid=radarGrid(body.grid_size),radius=radarRadius(body.radius_km),day=Math.min(28,Math.max(1,Number(body.monthly_day||5)||5));
  const includeCompetitors=body.include_competitors === undefined ? true : booleanValue(body.include_competitors,true);
  const current=(await query('SELECT gbp_account_name,gbp_location_name,gbp_location_title FROM local_radar_configs WHERE client_id=$1 LIMIT 1',[clientId])).rows[0]||{};
  const saved=await query('INSERT INTO local_radar_configs (client_id,place_id,address,city,profile_lat,profile_lng,grid_center_lat,grid_center_lng,grid_size,radius_km,keyword,include_competitors,monthly_enabled,monthly_day,gbp_account_name,gbp_location_name,gbp_location_title,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()) ON CONFLICT (client_id) DO UPDATE SET place_id=$2,address=$3,city=$4,profile_lat=$5,profile_lng=$6,grid_center_lat=$7,grid_center_lng=$8,grid_size=$9,radius_km=$10,keyword=$11,include_competitors=$12,monthly_enabled=$13,monthly_day=$14,gbp_account_name=$15,gbp_location_name=$16,gbp_location_title=$17,updated_at=now() RETURNING *',[
    clientId,radarPlaceId(body.place_id),String(body.address||''),String(body.city||''),radarNumber(body.profile_lat),radarNumber(body.profile_lng),radarNumber(body.grid_center_lat??body.profile_lat),radarNumber(body.grid_center_lng??body.profile_lng),grid,radius,String(body.keyword||'').trim(),includeCompetitors,booleanValue(body.monthly_enabled,false),day,String(body.gbp_account_name??current.gbp_account_name??''),String(body.gbp_location_name??current.gbp_location_name??''),String(body.gbp_location_title??current.gbp_location_title??'')
  ]);
  return saved.rows[0];
}

async function radarRunScan(input={},options={}) {
  await ensureLocalRadarTables();
  const onPoint=typeof options.onPoint==='function'?options.onPoint:null;
  let clientId=String(input.client_id||''), targetName=String(input.target_name||''), placeId=radarPlaceId(input.place_id), keyword=String(input.keyword||'').trim();
  let grid=radarGrid(input.grid_size),radius=radarRadius(input.radius_km),centerLat=radarNumber(input.center_lat),centerLng=radarNumber(input.center_lng),source=String(input.source||'')||(clientId?'client':'quick');
  let includeCompetitors=input.include_competitors === undefined ? true : booleanValue(input.include_competitors,true);

  if(clientId){
    const cfg=await radarGetConfig(clientId);
    targetName=targetName||cfg.client_name;
    placeId=placeId||cfg.place_id;
    keyword=keyword||cfg.keyword;
    grid=radarGrid(input.grid_size||cfg.grid_size);
    radius=radarRadius(input.radius_km||cfg.radius_km);
    centerLat=centerLat??radarNumber(cfg.grid_center_lat??cfg.profile_lat);
    centerLng=centerLng??radarNumber(cfg.grid_center_lng??cfg.profile_lng);
    if(input.include_competitors===undefined) includeCompetitors=cfg.include_competitors!==false;
    if((centerLat===null||centerLng===null)&&cfg.address){
      const geo=await radarGeocode(cfg.address,cfg.city);
      centerLat=geo.lat;centerLng=geo.lng;
      await radarSaveConfig(clientId,{...cfg,profile_lat:cfg.profile_lat??geo.lat,profile_lng:cfg.profile_lng??geo.lng,grid_center_lat:geo.lat,grid_center_lng:geo.lng});
    }
  }

  if(!placeId) fail('Defina o perfil do Google do cliente antes de rodar a análise.');
  if(!keyword) fail('Informe a palavra-chave da análise.');
  if(centerLat===null||centerLng===null) fail('Defina a localização/centro do grid.');

  const searchRadiusMeters=radarSearchRadiusMeters(radius,grid);
  const gridPoints=radarGenerateGrid(centerLat,centerLng,grid,radius);
  const competitorMap=new Map();

  // V112.26 — mesma lógica de ranking do Radar antigo, mas consultando os pontos
  // em paralelo controlado. Isso reduz muito o tempo do grid 5x5 e 7x7.
  const concurrency=grid>=7?8:grid>=5?6:4;
  const pointRuns=await radarMapLimit(gridPoints,concurrency,async(point,index)=>{
    const places=await radarSearchPoint({
      keyword,
      lat:point.lat,
      lng:point.lng,
      searchRadiusMeters,
      includeNames:includeCompetitors,
      targetPlaceId:placeId,
      maxPages:3
    });
    const positionIndex=places.findIndex(place=>place.id===placeId);
    const position=positionIndex===-1?null:positionIndex+1;
    const result={...point,position,color:radarRankColor(position),checkedResults:places.length,checkedAt:nowIso()};
    try{await onPoint?.(result,index,gridPoints.length);}catch(error){console.error('Local Radar progress:',error);}
    return {result,places};
  });

  const results=pointRuns.map(run=>run.result);

  if(includeCompetitors){
    for(const run of pointRuns){
      run.places.forEach((place,idx)=>{
        if(!place.id||place.id===placeId) return;
        if(!competitorMap.has(place.id)) competitorMap.set(place.id,{name:place.name,positions:[]});
        const data=competitorMap.get(place.id);
        if(!data.name&&place.name) data.name=place.name;
        data.positions.push(idx+1);
      });
    }
  }

  if(includeCompetitors){
    competitorMap.set(placeId,{
      name:targetName||'Cliente analisado',
      positions:results.map(point=>point.position).filter(Boolean),
      isTarget:true
    });
  }

  const scanId='radar_'+crypto.randomUUID();
  const summary=radarSummary(results);
  const competitors=includeCompetitors?radarCompetitors(competitorMap,results.length):[];
  await query('INSERT INTO local_radar_scans (id,client_id,source,target_name,place_id,keyword,grid_size,radius_km,center_lat,center_lng,points,summary,competitors,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,now())',[scanId,clientId||null,source,targetName,placeId,keyword,grid,radius,centerLat,centerLng,JSON.stringify(results),JSON.stringify(summary),JSON.stringify(competitors)]);
  return {
    id:scanId,client_id:clientId||null,source,target_name:targetName,place_id:placeId,keyword,
    grid_size:grid,radius_km:radius,search_radius_meters:searchRadiusMeters,
    center:{lat:Number(centerLat.toFixed(7)),lng:Number(centerLng.toFixed(7))},
    points:results,summary,competitors,competitors_enabled:includeCompetitors,created_at:nowIso(),
    note:'Resultado gerado por busca geolocalizada via Google Places. Trate como fotografia estratégica do momento.'
  };
}

function localRadarMonthYearLabel(value='',fallbackDate=''){
  const monthNames=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const match=String(value||'').match(/^(\d{4})-(\d{2})$/);
  if(match){
    const month=Math.max(1,Math.min(12,Number(match[2])));
    return monthNames[month-1]+' '+match[1];
  }
  const date=new Date(fallbackDate||value||Date.now());
  if(Number.isNaN(date.getTime())) return '';
  return monthNames[date.getMonth()]+' '+date.getFullYear();
}

async function radarCreateReport(clientId,scan,monthKey='') {
  await ensureLocalRadarTables();
  const client=await getClientRow(clientId);
  const reportId='radar_report_'+crypto.randomUUID();
  const monthLabel=localRadarMonthYearLabel(monthKey,scan.created_at||scan.createdAt);
  const canonicalScan=await localRadarCanonicalizeScan(scan);
  const canonicalClientName=localRadarCanonicalText(client.nome_cliente||canonicalScan.target_name||'Cliente');
  canonicalScan.target_name=canonicalClientName;
  canonicalScan.competitors=Array.isArray(canonicalScan.competitors)
    ? canonicalScan.competitors.map(item=>({...item,name:item.isTarget?canonicalClientName:localRadarCanonicalText(item.name||'Perfil')}))
    : [];
  const data={
    client:{id:clientId,name:canonicalClientName,specialty:localRadarCanonicalText(client.especialidade||''),city:localRadarCanonicalText(client.cidade||'')},
    scan:canonicalScan,
    generated_at:nowIso(),
    month_key:monthKey||'',
    month_label:monthLabel,
    interpretation:{
      visibility:canonicalScan.summary?.top3Percent>=70?'Presença forte no Top 3':canonicalScan.summary?.top10Percent>=70?'Boa presença no Top 10':'Há espaço relevante para ganho de presença local',
      average_position:canonicalScan.summary?.averagePosition
    }
  };
  const title='Relatório Local Radar — '+canonicalClientName+(monthLabel?' — '+monthLabel:'');
  const saved=await query(
    'INSERT INTO local_radar_reports (id,client_id,scan_id,month_key,title,data,created_at) VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (client_id,month_key) DO UPDATE SET scan_id=$3,title=$5,data=$6,created_at=now() RETURNING *',
    [reportId,clientId,canonicalScan.id,monthKey||'',title,data]
  );
  return {...saved.rows[0],data:saved.rows[0].data||data};
}

app.get('/api/local-radar/clients', async (_req,res)=>{
  await ensureLocalRadarTables();
  const rows=await query("SELECT c.registro_id,c.nome_cliente,c.especialidade,c.cidade,c.status,c.data,r.place_id,r.address,r.city AS radar_city,r.grid_size,r.radius_km,r.keyword,r.include_competitors,r.monthly_enabled,r.monthly_day,r.gbp_location_name,r.gbp_location_title,r.updated_at FROM clientes c LEFT JOIN local_radar_configs r ON r.client_id=c.registro_id WHERE COALESCE(c.status,'Ativo') <> 'Encerrado' ORDER BY lower(c.nome_cliente)");
  res.json(ok({clients:rows.rows.map(r=>({
    id:r.registro_id,
    name:r.nome_cliente||r.data?.nome_cliente||'Cliente',
    specialty:r.especialidade||r.data?.especialidade||'',
    city:r.radar_city||r.cidade||r.data?.cidade||'',
    status:r.status||r.data?.status||'Ativo',
    logo_url:r.data?.logo_url||'',
    configured:Boolean(r.place_id&&r.keyword&&r.address),
    place_id:r.place_id||'',
    address:r.address||'',
    grid_size:radarGrid(r.grid_size||5),
    radius_km:Number(r.radius_km||3),
    keyword:r.keyword||'',
    include_competitors:r.include_competitors!==false,
    monthly_enabled:Boolean(r.monthly_enabled),
    monthly_day:Number(r.monthly_day||5),
    gbp_location_name:r.gbp_location_name||'',
    gbp_location_title:r.gbp_location_title||'',
    updated_at:r.updated_at||null
  }))}));
});
app.get('/api/local-radar/map-config', async (_req,res)=>{
  const frontendKey=String(process.env.GOOGLE_MAPS_FRONTEND_KEY||'').trim();
  res.json(ok({configured:Boolean(frontendKey),frontend_key:frontendKey}));
});
app.get('/api/local-radar/google/status',async(_req,res)=>{
  const connection=await googleBusinessConnection();
  res.json(ok({
    configured:googleBusinessConfigured(),
    connected:Boolean(connection?.refresh_token_encrypted),
    account_email:connection?.account_email||'',
    updated_at:connection?.updated_at||null
  }));
});
app.get('/api/local-radar/google/auth-url',async(req,res)=>{
  if(!googleBusinessConfigured()) fail('Configure GOOGLE_BUSINESS_OAUTH_CLIENT_ID e GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET no EasyPanel.',503);
  await ensureLocalRadarTables();
  const state=crypto.randomBytes(32).toString('base64url');
  const verifier=crypto.randomBytes(48).toString('base64url');
  const stateHash=crypto.createHash('sha256').update(state).digest('hex');
  const returnUrl=googleBusinessPublicOrigin(req)+'/';
  await query('DELETE FROM local_radar_google_oauth_states WHERE expires_at<now() OR used_at IS NOT NULL');
  await query('INSERT INTO local_radar_google_oauth_states (state_hash,code_verifier_encrypted,return_url,created_by,expires_at) VALUES ($1,$2,$3,$4,now()+interval \'10 minutes\')',[
    stateHash,encryptIntegrationSecret(verifier),returnUrl,String(req.auth?.colaborador_id||'')
  ]);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',GBP_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri',googleBusinessRedirectUri(req));
  url.searchParams.set('response_type','code');
  url.searchParams.set('scope','openid email '+GBP_OAUTH_SCOPE);
  url.searchParams.set('access_type','offline');
  url.searchParams.set('prompt','consent');
  url.searchParams.set('include_granted_scopes','true');
  url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',googleBusinessPkceChallenge(verifier));
  url.searchParams.set('code_challenge_method','S256');
  res.json(ok({auth_url:url.toString(),redirect_uri:googleBusinessRedirectUri(req)}));
});
app.post('/api/local-radar/google/disconnect',async(_req,res)=>{
  const connection=await googleBusinessConnection();
  if(connection){
    const token=decryptIntegrationSecret(connection.refresh_token_encrypted||connection.access_token_encrypted||'');
    if(token) fetch('https://oauth2.googleapis.com/revoke?token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}}).catch(()=>{});
    await query("DELETE FROM local_radar_google_connections WHERE id='leme-google-business'");
  }
  res.json(ok({disconnected:true}));
});
app.get('/api/local-radar/google/locations',async(_req,res)=>{
  const result=await googleBusinessListLocations();
  res.json(ok(result));
});
app.get('/api/local-radar/google/insights/latest',async(req,res)=>{
  await ensureLocalRadarTables();
  const clientId=String(req.query.client_id||'');
  const found=await query('SELECT data,created_at FROM local_radar_performance_snapshots WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1',[clientId]);
  res.json(ok({performance:found.rows[0]?.data||null,created_at:found.rows[0]?.created_at||null}));
});
app.post('/api/local-radar/google/insights',async(req,res)=>{
  const body=asJson(req.body),clientId=String(body.client_id||'');
  if(!clientId) fail('Selecione um cliente.');
  const config=await radarGetConfig(clientId);
  const locationName=String(body.location_name||config.gbp_location_name||'');
  if(!locationName) fail('Selecione o perfil do Google Business deste cliente.');
  if(String(body.location_name||'')&&body.save_mapping!==false){
    await radarSaveConfig(clientId,{...config,gbp_account_name:String(body.account_name||''),gbp_location_name:locationName,gbp_location_title:String(body.location_title||'')});
  }
  const performance=await googleBusinessFetchPerformance({
    clientId,
    locationName,
    locationTitle:String(body.location_title||config.gbp_location_title||''),
    startDate:String(body.start_date||''),
    endDate:String(body.end_date||''),
    persist:true
  });
  res.json(ok({performance}));
});
app.get('/api/local-radar/intelligence',async(req,res)=>{
  await ensureLocalRadarTables();
  const clientId=String(req.query.client_id||''),requested=String(req.query.competence||'');
  if(!clientId) fail('Selecione um cliente.');
  const history=(await query("SELECT s.id AS snapshot_id,s.competence,s.keyword,s.generated_at,s.radar,s.gbp,s.search_keywords,s.profile,s.reviews,s.competitors,s.comparison,i.id AS intelligence_id,i.status,i.analysis,i.actions,i.error,i.generated_at AS intelligence_generated_at FROM local_radar_monthly_snapshots s LEFT JOIN local_radar_monthly_intelligence i ON i.client_id=s.client_id AND i.competence=s.competence AND i.keyword=s.keyword WHERE s.client_id=$1 ORDER BY s.competence DESC,s.generated_at DESC LIMIT 24",[clientId])).rows;
  const selected=history.find(item=>item.competence===requested)||history[0]||null;
  res.json(ok({selected,history:history.map(item=>({competence:item.competence,keyword:item.keyword,status:item.status||'pending',generated_at:item.generated_at,intelligence_generated_at:item.intelligence_generated_at}))}));
});
app.patch('/api/local-radar/intelligence/:id/actions/:actionId',async(req,res)=>{
  await ensureLocalRadarTables();
  const id=String(req.params.id||''),actionId=String(req.params.actionId||''),status=String(asJson(req.body).status||'pending');
  if(!['pending','in_progress','completed','dismissed'].includes(status)) fail('Status de ação inválido.');
  const found=(await query('SELECT * FROM local_radar_monthly_intelligence WHERE id=$1 LIMIT 1',[id])).rows[0];
  if(!found) fail('Inteligência mensal não encontrada.',404);
  const actions=(Array.isArray(found.actions)?found.actions:[]).map((action,index)=>String(action.id||index)===actionId?{...action,status,updated_at:nowIso()}:action);
  const updated=(await query('UPDATE local_radar_monthly_intelligence SET actions=$2::jsonb,updated_at=now() WHERE id=$1 RETURNING *',[id,JSON.stringify(actions)])).rows[0];
  res.json(ok({intelligence:updated}));
});
app.post('/api/local-radar/intelligence/regenerate',async(req,res)=>{
  await ensureLocalRadarTables();
  const body=asJson(req.body),clientId=String(body.client_id||''),competence=localRadarResolveCompetence(body.competence||localRadarClosedCompetenceKey());
  if(!clientId) fail('Selecione um cliente.');
  const found=(await query('SELECT r.*,s.center_lat,s.center_lng,s.grid_size,s.radius_km,s.keyword,s.place_id,s.target_name,s.summary,s.points,s.competitors,s.created_at AS scan_created_at FROM local_radar_reports r JOIN local_radar_scans s ON s.id=r.scan_id WHERE r.client_id=$1 AND r.month_key=$2 ORDER BY r.created_at DESC LIMIT 1',[clientId,competence])).rows[0];
  if(!found) fail('Não há relatório consolidado para esta competência.',404);
  const scan=await localRadarCanonicalizeScan({...found,id:found.scan_id,created_at:found.scan_created_at,center:{lat:found.center_lat,lng:found.center_lng}});
  const report={id:found.id,client_id:found.client_id,scan_id:found.scan_id,month_key:competence,title:found.title,data:found.data||{}};
  res.json(ok({delivery:await sendLocalRadarMonthlyReportToN8n(report,scan,{executionMode:'monthly_automatic',runAi:true,competence})}));
});
app.get('/api/local-radar/config/:clientId',async(req,res)=>res.json(ok({config:await radarGetConfig(String(req.params.clientId||''))})));
app.put('/api/local-radar/config/:clientId',async(req,res)=>res.json(ok({config:await radarSaveConfig(String(req.params.clientId||''),asJson(req.body))})));
app.post('/api/local-radar/resolve-location',async(req,res)=>{const b=asJson(req.body);res.json(ok({location:await radarGeocode(String(b.address||''),String(b.city||''))}));});
app.post('/api/local-radar/find-place',async(req,res)=>{const b=asJson(req.body);res.json(ok({places:await radarFindPlaces(String(b.query||''),radarNumber(b.lat),radarNumber(b.lng),{name:b.name,address:b.address,city:b.city,place_id:b.place_id})}));});
const localRadarActiveJobs=new Set();

async function localRadarJobRow(jobId){
  const found=await query('SELECT * FROM local_radar_jobs WHERE id=$1 LIMIT 1',[String(jobId||'')]);
  return found.rows[0]||null;
}

async function publicLocalRadarJob(job){
  if(!job) return null;
  let scan=null;
  if(job.status==='done'&&job.scan_id){
    const found=await query('SELECT * FROM local_radar_scans WHERE id=$1 LIMIT 1',[job.scan_id]);
    if(found.rows[0]) scan={...found.rows[0],center:{lat:found.rows[0].center_lat,lng:found.rows[0].center_lng}};
  }
  return {
    id:job.id,
    status:job.status,
    client_id:job.client_id||null,
    source:job.source||'client',
    grid_size:Number(job.grid_size||5),
    radius_km:Number(job.radius_km||3),
    keyword:job.keyword||'',
    include_competitors:job.include_competitors!==false,
    completed:Number(job.completed||0),
    total:Number(job.total||0),
    points:Array.isArray(job.points)?job.points:[],
    error:job.error||'',
    scan,
    started_at:job.started_at,
    finished_at:job.finished_at||null
  };
}

async function processLocalRadarJob(jobId){
  const id=String(jobId||'');
  if(!id||localRadarActiveJobs.has(id)) return;
  localRadarActiveJobs.add(id);
  try{
    const row=await localRadarJobRow(id);
    if(!row||!['queued','running'].includes(row.status)) return;

    const input=asJson(row.input);
    const points=Array.isArray(row.points)?row.points.slice():[];
    await query("UPDATE local_radar_jobs SET status='running',error='',updated_at=now() WHERE id=$1",[id]);

    const scan=await radarRunScan(input,{
      async onPoint(point,index,total){
        points[index]=point;
        const completed=points.filter(Boolean).length;
        await query('UPDATE local_radar_jobs SET points=$2::jsonb,completed=$3,total=$4,updated_at=now() WHERE id=$1',[id,JSON.stringify(points),completed,total]);
      }
    });

    await query("UPDATE local_radar_jobs SET status='done',scan_id=$2,points=$3::jsonb,completed=$4,total=$4,finished_at=now(),updated_at=now() WHERE id=$1",[
      id,scan.id,JSON.stringify(scan.points),scan.points.length
    ]);
  }catch(error){
    console.error('Local Radar persistent job:',error);
    await query("UPDATE local_radar_jobs SET status='error',error=$2,finished_at=now(),updated_at=now() WHERE id=$1",[
      id,String(error?.message||'Não foi possível concluir a análise.').slice(0,1000)
    ]).catch(console.error);
  }finally{
    localRadarActiveJobs.delete(id);
  }
}

app.post('/api/local-radar/scan/start',async(req,res)=>{
  await ensureLocalRadarTables();
  const input=asJson(req.body);
  const clientId=String(input.client_id||'');
  let cfg=null;
  if(clientId) cfg=await radarGetConfig(clientId);
  const grid=radarGrid(input.grid_size||cfg?.grid_size||5);
  const radius=radarRadius(input.radius_km||cfg?.radius_km||3);
  const keyword=String(input.keyword||cfg?.keyword||'').trim();
  const includeCompetitors=input.include_competitors===undefined?(cfg?.include_competitors!==false):booleanValue(input.include_competitors,true);

  if(clientId){
    if(!cfg?.place_id) fail('Defina o perfil do Google antes de rodar a análise.');
    if(!keyword) fail('Informe a palavra-chave antes de rodar a análise.');
    if(radarNumber(cfg.grid_center_lat??cfg.profile_lat)===null||radarNumber(cfg.grid_center_lng??cfg.profile_lng)===null) fail('Defina o centro do grid antes de rodar a análise.');
  }else{
    if(!radarPlaceId(input.place_id)) fail('Selecione o perfil do Google antes de rodar a análise.');
    if(!keyword) fail('Informe a palavra-chave antes de rodar a análise.');
    if(radarNumber(input.center_lat)===null||radarNumber(input.center_lng)===null) fail('Defina o centro do grid antes de rodar a análise.');
  }

  const jobId='radar_job_'+crypto.randomUUID();
  const source=clientId?'client':'quick';
  const jobInput={...input,include_competitors:includeCompetitors};

  await query(
    "INSERT INTO local_radar_jobs (id,client_id,source,input,status,grid_size,radius_km,keyword,include_competitors,completed,total,points,started_at,updated_at) VALUES ($1,$2,$3,$4::jsonb,'queued',$5,$6,$7,$8,0,$9,$10::jsonb,now(),now())",
    [jobId,clientId||null,source,JSON.stringify(jobInput),grid,radius,keyword,includeCompetitors,grid*grid,JSON.stringify([])]
  );

  const row=await localRadarJobRow(jobId);
  res.status(202).json(ok({job:await publicLocalRadarJob(row)}));
  setTimeout(()=>processLocalRadarJob(jobId).catch(console.error),0);
});

app.get('/api/local-radar/scan/jobs/:jobId',async(req,res)=>{
  await ensureLocalRadarTables();
  const row=await localRadarJobRow(String(req.params.jobId||''));
  if(!row) fail('Rodada não encontrada.',404);
  if(row.status==='queued'&&!localRadarActiveJobs.has(row.id)) setTimeout(()=>processLocalRadarJob(row.id).catch(console.error),0);
  res.json(ok({job:await publicLocalRadarJob(row)}));
});

async function recoverLocalRadarJobs(){
  await ensureLocalRadarTables();
  await query("UPDATE local_radar_jobs SET status='queued',updated_at=now() WHERE status='running' AND updated_at < now() - interval '2 minutes'");
  const pending=await query("SELECT id FROM local_radar_jobs WHERE status='queued' ORDER BY started_at ASC LIMIT 3");
  for(const row of pending.rows) setTimeout(()=>processLocalRadarJob(row.id).catch(console.error),0);
}
setTimeout(()=>recoverLocalRadarJobs().catch(console.error),8000);
setInterval(()=>recoverLocalRadarJobs().catch(console.error),60*1000);

app.post('/api/local-radar/scan',async(req,res)=>res.json(ok({scan:await radarRunScan(asJson(req.body))})));
function localRadarCanonicalText(value){
  return String(value??'')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'')
    .replace(/\u00A0/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

async function localRadarCanonicalizeScan(scan){
  if(!scan) return scan;
  let clientName=localRadarCanonicalText(scan.target_name||'');
  if(scan.client_id){
    try{
      const client=await getClientRow(String(scan.client_id));
      clientName=localRadarCanonicalText(client?.nome_cliente||clientName);
    }catch{}
  }
  const competitors=Array.isArray(scan.competitors)
    ? scan.competitors.map(item=>({
        ...item,
        name:item?.isTarget ? clientName : localRadarCanonicalText(item?.name||'Perfil')
      }))
    : [];
  return {...scan,target_name:clientName||localRadarCanonicalText(scan.target_name||'Cliente'),competitors};
}

async function localRadarProfileSnapshot(placeId){
  const pid=radarPlaceId(placeId);
  if(!pid||!LOCAL_RADAR_GOOGLE_KEY) return null;
  try{
    const response=await fetch('https://places.googleapis.com/v1/places/'+encodeURIComponent(pid),{
      headers:{
        'X-Goog-Api-Key':LOCAL_RADAR_GOOGLE_KEY,
        'X-Goog-FieldMask':'id,displayName,formattedAddress,location,googleMapsUri,googleMapsLinks,websiteUri,rating,userRatingCount,reviews,photos,editorialSummary,regularOpeningHours,currentOpeningHours,nationalPhoneNumber,internationalPhoneNumber,primaryType,primaryTypeDisplayName,googleMapsTypeLabel,types,businessStatus'
      }
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok){
      console.warn('Local Radar profile snapshot:',response.status,json?.error?.message||'');
      return null;
    }
    return {
      place_id:radarPlaceId(json.id),
      name:localRadarCanonicalText(json.displayName?.text||''),
      address:localRadarCanonicalText(json.formattedAddress||''),
      location:{lat:json.location?.latitude??null,lng:json.location?.longitude??null},
      google_maps_url:json.googleMapsUri||('https://www.google.com/maps/search/?api=1&query_place_id='+encodeURIComponent(pid)),
      google_maps_links:json.googleMapsLinks||{},
      website_url:json.websiteUri||'',
      phone:json.nationalPhoneNumber||'',
      international_phone:json.internationalPhoneNumber||'',
      business_status:json.businessStatus||'',
      primary_type:json.primaryType||'',
      primary_category:localRadarCanonicalText(json.primaryTypeDisplayName?.text||''),
      google_maps_category:localRadarCanonicalText(json.googleMapsTypeLabel?.text||''),
      types:Array.isArray(json.types)?json.types:[],
      rating:json.rating??null,
      review_count:json.userRatingCount??null,
      editorial_summary:localRadarCanonicalText(json.editorialSummary?.text||''),
      opening_hours:Array.isArray(json.regularOpeningHours?.weekdayDescriptions)?json.regularOpeningHours.weekdayDescriptions:[],
      open_now:json.currentOpeningHours?.openNow??null,
      photo_count:Array.isArray(json.photos)?json.photos.length:0,
      photo_resources:Array.isArray(json.photos)?json.photos.slice(0,6).map(photo=>String(photo?.name||'')).filter(Boolean):[],
      reviews:Array.isArray(json.reviews)?json.reviews.slice(0,5).map(review=>({
        rating:review.rating??null,
        relative_time:review.relativePublishTimeDescription||'',
        published_at:review.publishTime||'',
        text:localRadarCanonicalText(review.text?.text||''),
        author:localRadarCanonicalText(review.authorAttribution?.displayName||''),
        google_maps_url:review.googleMapsUri||''
      })):[]
    };
  }catch(error){
    console.warn('Local Radar profile snapshot:',error.message);
    return null;
  }
}

async function localRadarProfilePhotoSamples(resources){
  if(!LOCAL_RADAR_GOOGLE_KEY||!Array.isArray(resources)) return [];
  const selected=resources
    .map(value=>String(value||'').trim())
    .filter(value=>/^places\/[^/]+\/photos\/[^/]+$/.test(value))
    .slice(0,6);
  const samples=[];
  for(let index=0;index<selected.length;index++){
    try{
      const metaUrl='https://places.googleapis.com/v1/'+selected[index]+'/media?maxWidthPx=640&skipHttpRedirect=true';
      const metaResponse=await fetch(metaUrl,{headers:{'X-Goog-Api-Key':LOCAL_RADAR_GOOGLE_KEY}});
      const meta=await metaResponse.json().catch(()=>({}));
      if(!metaResponse.ok||!meta.photoUri) continue;
      const imageResponse=await fetch(meta.photoUri);
      if(!imageResponse.ok) continue;
      const mimeType=String(imageResponse.headers.get('content-type')||'image/jpeg').split(';')[0].trim();
      if(!mimeType.startsWith('image/')) continue;
      const image=Buffer.from(await imageResponse.arrayBuffer());
      if(!image.length||image.length>2*1024*1024) continue;
      const extension=mimeType.includes('png')?'png':mimeType.includes('webp')?'webp':'jpg';
      samples.push({
        data:image.toString('base64'),
        mime_type:mimeType,
        file_name:'perfil-google-'+String(index+1)+'.'+extension
      });
    }catch(error){
      console.warn('Local Radar profile photo:',error.message);
    }
  }
  return samples;
}

async function localRadarCompetitorSnapshots(competitors,targetPlaceId){
  const target=radarPlaceId(targetPlaceId);
  const selected=(Array.isArray(competitors)?competitors:[])
    .filter(item=>!item?.isTarget&&radarPlaceId(item?.placeId)!==target)
    .slice(0,5);
  return (await radarMapLimit(selected,2,async competitor=>{
    const snapshot=await localRadarProfileSnapshot(competitor.placeId);
    if(!snapshot) return null;
    delete snapshot.photo_resources;
    return {
      ranking_grid:{
        place_id:radarPlaceId(competitor.placeId),
        nome:localRadarCanonicalText(competitor.name||snapshot.name||''),
        posicao_media:competitor.averagePosition??null,
        melhor_posicao:competitor.bestPosition??null,
        pior_posicao:competitor.worstPosition??null,
        aparicoes:competitor.appearances??null,
        presenca_percentual:competitor.appearancesPercent??null,
        top_10_percentual:competitor.top10Percent??null
      },
      perfil_google:snapshot
    };
  })).filter(Boolean);
}

app.get('/api/local-radar/scans',async(req,res)=>{
  await ensureLocalRadarTables();
  const id=String(req.query.client_id||'');
  const rows=await query('SELECT id,client_id,source,target_name,place_id,keyword,grid_size,radius_km,center_lat,center_lng,summary,competitors,created_at FROM local_radar_scans WHERE ($1=\'\' OR client_id=$1) ORDER BY created_at DESC LIMIT 100',[id]);
  const scans=[];
  for(const row of rows.rows) scans.push(await localRadarCanonicalizeScan(row));
  res.json(ok({scans}));
});
app.get('/api/local-radar/scans/:scanId',async(req,res)=>{
  await ensureLocalRadarTables();
  const found=await query('SELECT * FROM local_radar_scans WHERE id=$1 LIMIT 1',[String(req.params.scanId||'')]);
  if(!found.rows[0]) fail('Análise não encontrada.',404);
  const scan=await localRadarCanonicalizeScan({...found.rows[0],center:{lat:found.rows[0].center_lat,lng:found.rows[0].center_lng}});
  res.json(ok({scan}));
});
app.delete('/api/local-radar/scans/:scanId',async(req,res)=>{
  await ensureLocalRadarTables();
  const scanId=String(req.params.scanId||'');
  const found=await query('SELECT id,client_id FROM local_radar_scans WHERE id=$1 LIMIT 1',[scanId]);
  if(!found.rows[0]) fail('Rodada não encontrada.',404);
  await query('DELETE FROM local_radar_reports WHERE scan_id=$1',[scanId]);
  await query("DELETE FROM local_radar_jobs WHERE scan_id=$1 OR input->>'scan_id'=$1",[scanId]).catch(()=>{});
  await query('DELETE FROM local_radar_scans WHERE id=$1',[scanId]);
  res.json(ok({deleted:true,scan_id:scanId,client_id:found.rows[0].client_id||null}));
});
app.post('/api/local-radar/scans/:scanId/run-competitor',async(req,res)=>{
  await ensureLocalRadarTables();
  const found=await query('SELECT * FROM local_radar_scans WHERE id=$1 LIMIT 1',[String(req.params.scanId||'')]);
  if(!found.rows[0]) fail('Análise de origem não encontrada.',404);
  const sourceScan=found.rows[0];
  const body=asJson(req.body);
  const placeId=radarPlaceId(body.place_id||body.placeId);
  if(!placeId) fail('Concorrente inválido.');
  const scan=await radarRunScan({
    source:'competitor',
    target_name:String(body.name||'Concorrente'),
    place_id:placeId,
    keyword:sourceScan.keyword,
    grid_size:sourceScan.grid_size,
    radius_km:sourceScan.radius_km,
    center_lat:sourceScan.center_lat,
    center_lng:sourceScan.center_lng,
    include_competitors:body.include_competitors===undefined?true:booleanValue(body.include_competitors,true)
  });
  res.json(ok({scan}));
});

function localRadarDataUrlToBuffer(value){
  const match=String(value||'').match(/^data:image\/(?:png|jpeg|jpg);base64,(.+)$/i);
  if(!match) return null;
  try{return Buffer.from(match[1],'base64');}catch{return null;}
}

function localRadarPdfFileName(value){
  return String(value||'Local Radar')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\\\/:*?"<>|]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,90);
}

function localRadarPdfDate(value){
  try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));}
  catch{return String(value||'');}
}

function localRadarMercatorPixel(lat,lng,zoom){
  const sin=Math.sin(Number(lat)*Math.PI/180);
  const scale=256*Math.pow(2,zoom);
  const x=(Number(lng)+180)/360*scale;
  const y=(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale;
  return {x,y};
}

function localRadarChooseMapZoom(scan,width=640,height=430){
  const points=Array.isArray(scan?.points)?scan.points:[];
  const fallback={lat:Number(scan?.center?.lat??scan?.center_lat??points[0]?.lat??0),lng:Number(scan?.center?.lng??scan?.center_lng??points[0]?.lng??0)};
  // Usa o centro real dos limites do grid, e não o endereço do perfil. Isso
  // reproduz o fitBounds do mapa da interface mesmo quando o grid foi movido.
  const validPoints=points.filter(point=>Number.isFinite(Number(point?.lat))&&Number.isFinite(Number(point?.lng)));
  const center=validPoints.length?{
    lat:(Math.min(...validPoints.map(point=>Number(point.lat)))+Math.max(...validPoints.map(point=>Number(point.lat))))/2,
    lng:(Math.min(...validPoints.map(point=>Number(point.lng)))+Math.max(...validPoints.map(point=>Number(point.lng))))/2
  }:fallback;
  // Mesma proporção de respiro usada pela captura manual (1000x675 com
  // 68 px nas laterais e 28 px em cima/baixo).
  const paddingX=Math.max(20,Math.round(width*.068));
  const paddingY=Math.max(12,Math.round(height*.042));
  for(let zoom=18;zoom>=3;zoom--){
    const cp=localRadarMercatorPixel(center.lat,center.lng,zoom);
    let fits=true;
    for(const point of validPoints){
      const pp=localRadarMercatorPixel(point.lat,point.lng,zoom);
      const x=width/2+(pp.x-cp.x),y=height/2+(pp.y-cp.y);
      if(x<paddingX||x>width-paddingX||y<paddingY||y>height-paddingY){fits=false;break;}
    }
    if(fits) return {zoom,center};
  }
  return {zoom:11,center};
}

async function fetchLocalRadarStaticMap(scan){
  if(!LOCAL_RADAR_GOOGLE_KEY) return null;
  const width=640,height=430;
  const view=localRadarChooseMapZoom(scan,width,height);
  const url=new URL('https://maps.googleapis.com/maps/api/staticmap');
  url.searchParams.set('center',view.center.lat+','+view.center.lng);
  url.searchParams.set('zoom',String(view.zoom));
  url.searchParams.set('size',width+'x'+height);
  url.searchParams.set('scale','2');
  url.searchParams.set('maptype','roadmap');
  url.searchParams.set('language','pt-BR');
  url.searchParams.set('region','br');
  url.searchParams.set('format','png32');
  // Base visual limpa para relatório: preserva ruas e geografia, mas remove
  // comércios, hospitais, estações, ícones e rótulos que competem com o grid.
  [
    'feature:poi|visibility:off',
    'feature:transit|visibility:off',
    'feature:administrative.land_parcel|visibility:off',
    'feature:landscape|element:labels|visibility:off',
    'feature:road|element:labels.icon|visibility:off',
    'feature:all|element:labels.icon|visibility:off',
    'feature:road|element:geometry|color:0xe8e6e1',
    'feature:road.highway|element:geometry|color:0xf2cf82',
    'feature:road|element:labels.text.fill|color:0x7c8790',
    'feature:road|element:labels.text.stroke|color:0xffffff',
    'feature:water|element:geometry|color:0xd9eef5',
    'feature:landscape|element:geometry|color:0xf6f5f1'
  ].forEach(style=>url.searchParams.append('style',style));
  url.searchParams.set('key',LOCAL_RADAR_GOOGLE_KEY);
  try{
    const response=await fetch(url);
    if(!response.ok){
      console.warn('Local Radar Static Maps:',response.status,await response.text().catch(()=>'')); 
      return null;
    }
    return {buffer:Buffer.from(await response.arrayBuffer()),width,height,zoom:view.zoom,center:view.center};
  }catch(error){
    console.warn('Local Radar Static Maps:',error.message);
    return null;
  }
}

function localRadarStaticMapPoint(staticMap,point){
  const cp=localRadarMercatorPixel(staticMap.center.lat,staticMap.center.lng,staticMap.zoom);
  const pp=localRadarMercatorPixel(point.lat,point.lng,staticMap.zoom);
  return {x:staticMap.width/2+(pp.x-cp.x),y:staticMap.height/2+(pp.y-cp.y)};
}

function localRadarPdfSafeText(value){
  return String(value??'')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'')
    .replace(/\u00A0/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

async function buildLocalRadarPdf(scan,client,mapImageBuffer,performance=null,monthlySnapshot=null){
  const doc=new PDFDocument({size:'A4',margin:0,info:{Title:'Relatório Local Radar - '+localRadarPdfSafeText(client?.nome_cliente||scan.target_name||'Cliente'),Author:'LEME Marketing Médico',Subject:'Posicionamento local'}});
  const chunks=[];
  doc.on('data',chunk=>chunks.push(chunk));
  const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});

  const W=595.28,H=841.89;
  // O mapa oficial do servidor é sempre a primeira opção. Assim download,
  // envio manual ao WhatsApp e automação mensal produzem o mesmo PDF.
  // A imagem do navegador permanece apenas como contingência se a API de
  // Static Maps estiver temporariamente indisponível.
  const staticMap=await fetchLocalRadarStaticMap(scan);
  const effectiveMapImage=staticMap?.buffer||mapImageBuffer||null;
  const navy='#0b2235',blue='#2f8fc0',light='#f2f6f8',line='#dbe5ea',text='#10283a',muted='#6f8390';
  // Mantém a mesma codificação WinAnsi em todo o relatório. A alternância entre
  // DejaVu e as fontes padrão do PDFKit corrompia ou duplicava alguns glifos
  // acentuados (como o "ó" de Vitória), sobretudo na tabela de concorrentes.
  const fontRegular='Helvetica',fontBold='Helvetica-Bold';
  const green='#2aaa7d',yellow='#e4aa22',red='#ef5b7c',gray='#93a1b2';
  let logo=null;
  for(const candidate of [path.join(ROOT_DIR,'logo-horizontal-white.png'),path.join(ROOT_DIR,'n8n-exemplos','assets','logo-leme-horizontal-branca-relatorio.png'),path.join(ROOT_DIR,'logo-horizontal.png')]){
    try{logo=await fs.readFile(candidate);if(logo?.length)break;}catch{}
  }

  function header(title,subtitle,pageNo){
    doc.rect(0,0,W,78).fill(navy);
    if(logo){try{doc.image(logo,38,22,{fit:[150,32],align:'left',valign:'center'});}catch{}}
    else doc.fillColor('#fff').font(fontBold).fontSize(19).text('LEME',38,28,{lineBreak:false});
    doc.fillColor('#fff').font(fontBold).fontSize(15).text(title,185,21,{width:370,align:'right'});
    doc.fillColor('#c8dce8').font(fontRegular).fontSize(8).text(subtitle,185,45,{width:370,align:'right'});
    doc.fillColor('#8ca7b7').fontSize(7).text('Página '+pageNo,500,H-22,{width:55,align:'right'});
  }

  function card(x,y,w,label,value,trend=null){
    doc.roundedRect(x,y,w,58,10).fill(light);
    doc.fillColor(muted).font(fontBold).fontSize(7.3).text(label,x+12,y+11,{width:w-24});
    doc.fillColor(text).font(fontBold).fontSize(trend?16:19).text(String(value??'—'),x+12,y+26,{width:w-24});
    if(trend){
      const color=trend.effective_direction==='improved'?green:trend.effective_direction==='worsened'?red:muted;
      doc.fillColor(color).font(fontBold).fontSize(5.7).text(localRadarPdfSafeText(trend.label||''),x+12,y+47,{width:w-24,lineBreak:false});
    }
  }

  function fittedFontSize(value,font,maxWidth,preferred=7.1,minimum=5.8){
    const clean=localRadarPdfSafeText(value);
    let size=preferred;
    doc.font(font);
    while(size>minimum){
      doc.fontSize(size);
      if(doc.widthOfString(clean)<=maxWidth) break;
      size=Math.max(minimum,size-.2);
    }
    return size;
  }

  const clientName=localRadarPdfSafeText(client?.nome_cliente||scan.target_name||'Cliente');
  const specialty=localRadarPdfSafeText(client?.especialidade||'');
  const city=localRadarPdfSafeText(client?.cidade||'');
  const summary=scan.summary||{};
  const competitors=Array.isArray(scan.competitors)?scan.competitors:[];
  const scanDate=localRadarPdfDate(scan.created_at||scan.createdAt||new Date());
  const comparison=monthlySnapshot?.comparison||{};
  const gbpComparison=comparison.gbp||{};
  const radarComparison=comparison.radar?.metrics||{};

  const hasPerformance=Boolean(performance?.available);
  if(hasPerformance){
    const perf=performance||{},impressions=perf.impressions||{},actions=perf.actions||{};
    const periodStart=String(perf.period?.start_date||'').split('-').reverse().join('/');
    const periodEnd=String(perf.period?.end_date||'').split('-').reverse().join('/');
    header('Desempenho do Perfil no Google',clientName+' · '+periodStart+' a '+periodEnd,1);
    doc.fillColor(text).font(fontBold).fontSize(18).text('Como as pessoas encontraram e acionaram o perfil',38,102,{width:520});
    doc.fillColor(muted).font(fontRegular).fontSize(8.3).text('Dados oficiais da Google Business Profile Performance API para o período selecionado.',38,128,{width:520});

    const perfGap=8,perfW=(W-76-perfGap*3)/4;
    card(38,158,perfW,'Impressões',impressions.total??0,gbpComparison.impressions);
    card(38+perfW+perfGap,158,perfW,'Interações',actions.total??0,gbpComparison.interactions);
    card(38+(perfW+perfGap)*2,158,perfW,'Chamadas',actions.calls??0,gbpComparison.calls);
    card(38+(perfW+perfGap)*3,158,perfW,'Rotas',actions.directions??0,gbpComparison.directions);

    const sourceRows=[
      ['Pesquisa no celular',Number(impressions.mobile_search||0),blue],
      ['Maps no celular',Number(impressions.mobile_maps||0),green],
      ['Pesquisa no computador',Number(impressions.desktop_search||0),'#746cc0'],
      ['Maps no computador',Number(impressions.desktop_maps||0),yellow]
    ];
    doc.fillColor(text).font(fontBold).fontSize(12).text('Origem das visualizações',38,244);
    const maxSource=Math.max(1,...sourceRows.map(row=>row[1]));
    let sourceY=270;
    for(const [label,value,color] of sourceRows){
      doc.fillColor(muted).font(fontBold).fontSize(7.4).text(label,38,sourceY,{width:145});
      doc.roundedRect(185,sourceY-1,250,10,5).fill('#e5edf1');
      doc.roundedRect(185,sourceY-1,Math.max(value?4:0,(value/maxSource)*250),10,5).fill(color);
      doc.fillColor(text).font(fontBold).fontSize(8).text(String(value),447,sourceY,{width:55,align:'right'});
      sourceY+=25;
    }

    doc.roundedRect(38,382,W-76,78,12).fill('#f7fafb').stroke(line);
    const actionCards=[['Visitas ao site',actions.website??0],['Reservas',actions.bookings??0],['Taxa de interação',(perf.interaction_rate??0)+'%']];
    const actionW=(W-104)/3;
    actionCards.forEach((item,index)=>{
      const x=52+index*actionW;
      if(index) doc.moveTo(x,396).lineTo(x,446).strokeColor(line).lineWidth(.7).stroke();
      doc.fillColor(muted).font(fontBold).fontSize(7.3).text(item[0],x+(index?12:0),400,{width:actionW-20});
      doc.fillColor(text).font(fontBold).fontSize(20).text(String(item[1]),x+(index?12:0),419,{width:actionW-20});
    });

    const daily=Array.isArray(perf.daily)?perf.daily:[];
    const dailyPoints=daily.map(day=>({
      date:day.date,
      impressions:Number(day.BUSINESS_IMPRESSIONS_DESKTOP_MAPS||0)+Number(day.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH||0)+Number(day.BUSINESS_IMPRESSIONS_MOBILE_MAPS||0)+Number(day.BUSINESS_IMPRESSIONS_MOBILE_SEARCH||0),
      actions:Number(day.BUSINESS_DIRECTION_REQUESTS||0)+Number(day.CALL_CLICKS||0)+Number(day.WEBSITE_CLICKS||0)+Number(day.BUSINESS_BOOKINGS||0)+Number(day.BUSINESS_FOOD_ORDERS||0)+Number(day.BUSINESS_FOOD_MENU_CLICKS||0)
    }));
    const peak=dailyPoints.reduce((best,point)=>!best||point.impressions>best.impressions?point:best,null);
    doc.fillColor(text).font(fontBold).fontSize(12).text('Evolução diária das visualizações do perfil',38,492,{width:360});
    if(peak){
      const peakDate=String(peak.date||'').split('-').reverse().slice(0,2).join('/');
      doc.fillColor(blue).font(fontBold).fontSize(7.5).text('Pico: '+String(peak.impressions)+' em '+peakDate,408,495,{width:149,align:'right'});
    }
    const chartX=38,chartY=512,chartW=W-76,chartH=112;
    doc.roundedRect(chartX,chartY,chartW,chartH,10).fill('#f7fafb').stroke(line);
    const maxDaily=Math.max(1,...dailyPoints.map(point=>point.impressions));
    if(dailyPoints.length>1){
      const magnitude=Math.pow(10,Math.max(0,String(Math.ceil(maxDaily)).length-2));
      const axisMax=Math.max(1,Math.ceil(maxDaily/magnitude)*magnitude);
      const plotX=chartX+38,plotY=chartY+12,plotW=chartW-54,plotH=chartH-34;
      [0,.5,1].forEach(ratio=>{
        const y=plotY+plotH-(ratio*plotH);
        const value=Math.round(axisMax*ratio);
        doc.moveTo(plotX,y).lineTo(plotX+plotW,y).strokeColor(ratio===0?line:'#e5edf1').lineWidth(.6).stroke();
        doc.fillColor(muted).font(fontRegular).fontSize(6.3).text(String(value),chartX+7,y-3,{width:25,align:'right',lineBreak:false});
      });
      dailyPoints.forEach((point,index)=>{
        const x=plotX+(index/(dailyPoints.length-1))*plotW;
        const y=plotY+plotH-(point.impressions/axisMax)*plotH;
        if(index===0) doc.moveTo(x,y); else doc.lineTo(x,y);
      });
      doc.strokeColor(blue).lineWidth(2).stroke();
      dailyPoints.forEach((point,index)=>{
        const x=plotX+(index/(dailyPoints.length-1))*plotW;
        const y=plotY+plotH-(point.impressions/axisMax)*plotH;
        doc.circle(x,y,index===dailyPoints.indexOf(peak)?3.4:1.45).fill(index===dailyPoints.indexOf(peak)?green:blue);
      });
      const tickIndexes=[0,Math.round((dailyPoints.length-1)/4),Math.round((dailyPoints.length-1)/2),Math.round((dailyPoints.length-1)*3/4),dailyPoints.length-1]
        .filter((value,index,array)=>array.indexOf(value)===index);
      tickIndexes.forEach((pointIndex,tickIndex)=>{
        const point=dailyPoints[pointIndex];
        const x=plotX+(pointIndex/(dailyPoints.length-1))*plotW;
        const label=String(point.date||'').slice(8,10);
        const width=20;
        const labelX=Math.max(chartX+2,Math.min(chartX+chartW-width-2,x-width/2));
        doc.fillColor(muted).font(fontRegular).fontSize(6.2).text(label,labelX,chartY+96,{width,align:tickIndex===0?'left':tickIndex===tickIndexes.length-1?'right':'center',lineBreak:false});
      });
    }else{
      doc.fillColor(muted).font(fontRegular).fontSize(8).text('Não há pontos diários suficientes para desenhar a evolução.',chartX+20,chartY+43,{width:chartW-40,align:'center'});
    }

    doc.fillColor(muted).font(fontRegular).fontSize(6.9).text(
      'A linha soma, dia a dia, as visualizações do perfil na Pesquisa Google e no Maps, em celulares e computadores. O eixo vertical mostra a quantidade de visualizações.',
      38,632,{width:W-76,align:'left'}
    );

    const keywords=Array.isArray(perf.search_keywords)?perf.search_keywords.slice(0,6):[];
    doc.fillColor(text).font(fontBold).fontSize(12).text('Principais termos usados para encontrar o perfil',38,661);
    if(keywords.length){
      let keywordY=685;
      keywords.forEach((item,index)=>{
        if(index%2===1) doc.rect(38,keywordY-4,W-76,17).fill('#f7fafb');
        const keywordDelta=Array.isArray(comparison.keywords)?comparison.keywords[index]?.delta:null;
        const deltaText=keywordDelta?.available&&keywordDelta.percentage!==null?' ('+(keywordDelta.percentage>0?'+':'')+String(keywordDelta.percentage)+'%)':'';
        const amount=(item.value!==null&&item.value!==undefined?String(item.value):('< '+String(item.threshold??0)))+deltaText;
        doc.fillColor(text).font(index<3?fontBold:fontRegular).fontSize(7.6).text((index+1)+'. '+localRadarPdfSafeText(item.keyword||'Termo'),46,keywordY,{width:390,lineBreak:false});
        doc.fillColor(blue).font(fontBold).fontSize(7.1).text(amount,452,keywordY,{width:88,align:'right',lineBreak:false});
        keywordY+=17;
      });
    }else{
      doc.fillColor(muted).font(fontRegular).fontSize(8).text('O Google não disponibilizou termos de busca para este período.',38,685,{width:W-76});
    }
    doc.fillColor('#879aa6').font(fontRegular).fontSize(7).text('As visualizações não garantem posição, mas mostram alcance e oportunidades de contato com o perfil.',38,807,{width:W-76,align:'center'});
  }



  if(hasPerformance) doc.addPage({size:'A4',margin:0});
  header('Relatório Local Radar',scanDate,hasPerformance?2:1);
  doc.fillColor(blue).font(fontBold).fontSize(7.5).text('LEME · POSICIONAMENTO LOCAL',38,99);
  doc.fillColor(text).font(fontBold).fontSize(23).text(clientName,38,115,{width:520});
  doc.fillColor(muted).font(fontRegular).fontSize(9.5).text([specialty,city,scan.keyword,(scan.grid_size||5)+'×'+(scan.grid_size||5),Number(scan.radius_km||0).toFixed(2)+' km'].filter(Boolean).join('  ·  '),38,149,{width:520});

  const gap=8,cw=(W-76-gap*3)/4;
  card(38,179,cw,'Posição média',summary.averagePosition??'—',radarComparison.average_position);
  card(38+cw+gap,179,cw,'Top 3',(summary.top3Percent??0)+'%',radarComparison.top3);
  card(38+(cw+gap)*2,179,cw,'Top 10',(summary.top10Percent??0)+'%',radarComparison.top10);
  card(38+(cw+gap)*3,179,cw,'Não apareceu',(summary.notFoundPercent??0)+'%',radarComparison.not_found);

  doc.fillColor(text).font(fontBold).fontSize(12).text('Mapa da análise',38,257);
  doc.fillColor(muted).font(fontRegular).fontSize(8.3).text('Cada ponto mostra a posição do perfil naquela região da cidade.',38,274);
  const mapX=38,mapY=292,mapW=W-76,mapH=350;
  doc.roundedRect(mapX,mapY,mapW,mapH,12).fill('#e8eef0');
  if(effectiveMapImage){
    try{doc.save();doc.roundedRect(mapX,mapY,mapW,mapH,12).clip();doc.image(effectiveMapImage,mapX,mapY,{width:mapW,height:mapH});doc.restore();}
    catch(error){doc.fillColor(muted).fontSize(10).text('Não foi possível incorporar o mapa.',mapX+20,mapY+150,{width:mapW-40,align:'center'});}
  }else{
    doc.fillColor(muted).fontSize(10).text('Mapa não capturado nesta geração.',mapX+20,mapY+150,{width:mapW-40,align:'center'});
  }

  if(staticMap){
    const points=Array.isArray(scan?.points)?scan.points:[];
    const sx=mapW/staticMap.width,sy=mapH/staticMap.height;
    const projected=points.map(point=>{
      const pos=localRadarStaticMapPoint(staticMap,point);
      return {point,x:mapX+pos.x*sx,y:mapY+pos.y*sy};
    });
    // A malha conecta os mesmos pontos por linha e coluna, como no mapa
    // interativo antigo. É desenhada no PDF para permanecer idêntica em
    // downloads, envios manuais e automações mensais.
    const drawGridSeries=(key,orderKey)=>{
      const groups=new Map();
      projected.forEach(item=>{
        const groupKey=Number(item.point?.[key]);
        if(!Number.isFinite(groupKey))return;
        if(!groups.has(groupKey))groups.set(groupKey,[]);
        groups.get(groupKey).push(item);
      });
      groups.forEach(series=>{
        series.sort((left,right)=>Number(left.point?.[orderKey]??0)-Number(right.point?.[orderKey]??0));
        const visible=series.filter(item=>item.x>=mapX&&item.x<=mapX+mapW&&item.y>=mapY&&item.y<=mapY+mapH);
        if(visible.length<2)return;
        doc.moveTo(visible[0].x,visible[0].y);
        visible.slice(1).forEach(item=>doc.lineTo(item.x,item.y));
        doc.strokeColor('#78a9c8').opacity(.72).lineWidth(.8).stroke();
      });
    };
    doc.save();
    doc.roundedRect(mapX,mapY,mapW,mapH,12).clip();
    drawGridSeries('row','col');
    drawGridSeries('col','row');
    doc.restore();
    doc.opacity(1);
    for(const item of projected){
      const point=item.point,x=item.x,y=item.y;
      if(x<mapX+8||x>mapX+mapW-8||y<mapY+8||y>mapY+mapH-8) continue;
      const position=Number(point.position||0);
      const color=!position?gray:position<=3?green:position<=10?yellow:red;
      doc.circle(x,y,9).fill(color).strokeColor('#ffffff').lineWidth(2).stroke();
      doc.fillColor(position>10?'#ffffff':'#10283a').font(fontBold).fontSize(position>=10?5.8:7).text(position?String(position):'—',x-8,y-3.2,{width:16,align:'center',lineBreak:false});
    }
  }

  const legendY=657;
  const legend=[[green,'Top 3'],[yellow,'Top 10'],[red,'11+'],[gray,'Não apareceu']];
  let lx=42;
  for(const item of legend){
    doc.circle(lx,legendY+5,4).fill(item[0]);
    doc.fillColor(muted).font(fontBold).fontSize(7.5).text(item[1],lx+9,legendY,{lineBreak:false});
    lx+=item[1]==='Não apareceu'?0:88;
  }

  const visibility=(summary.top3Percent??0)>=70?'Presença forte no Top 3 em grande parte do grid.':(summary.top10Percent??0)>=70?'Boa presença no Top 10, com oportunidade de avançar para as primeiras posições.':'Há espaço relevante para ampliar a presença local nos pontos analisados.';
  doc.roundedRect(38,684,W-76,88,12).fill('#f7fafb').stroke(line);
  doc.fillColor(blue).font(fontBold).fontSize(7.8).text('LEITURA ESTRATÉGICA',52,699);
  doc.fillColor(text).font(fontBold).fontSize(11.5).text(visibility,52,718,{width:W-104});
  doc.fillColor(muted).font(fontRegular).fontSize(7.8).text('Melhor posição: '+(summary.bestPosition??'—')+' · Pior posição: '+(summary.worstPosition??'—')+' · Pontos encontrados: '+(summary.foundPoints??0)+'/'+(summary.totalPoints??scan.points?.length??0),52,749,{width:W-104});
  doc.fillColor('#879aa6').fontSize(7.2).text('Relatório gerado pelo Sistema LEME. Fotografia do posicionamento no momento da rodada.',38,807,{width:W-76,align:'center'});

  const rows=(Array.isArray(comparison.competitors)&&comparison.competitors.length?comparison.competitors:competitors).slice(0,10);
  const rowsPerPage=17;
  const totalPages=Math.max(1,Math.ceil(rows.length/rowsPerPage));
  for(let pageIndex=0;pageIndex<totalPages;pageIndex++){
    doc.addPage({size:'A4',margin:0});
    header('Análise dos concorrentes',clientName+' · '+String(scan.keyword||'')+' · '+String(scan.grid_size||5)+'×'+String(scan.grid_size||5),pageIndex+(hasPerformance?3:2));
    doc.fillColor(text).font(fontBold).fontSize(18).text('Ranking de perfis encontrados',38,102);
    doc.fillColor(muted).font(fontRegular).fontSize(8.3).text('Ordenado pela posição média nos mesmos pontos do grid.',38,126);
    const x=38,y0=158,widths=[25,205,48,48,65,65,63],heads=['#','Perfil','Atual','Antes','Média','Mudança','Top 10'];
    let px=x;
    doc.roundedRect(x,y0,W-76,28,7).fill(navy);
    heads.forEach((head,i)=>{doc.fillColor('#fff').font(fontBold).fontSize(7).text(head,px+5,y0+10,{width:widths[i]-10});px+=widths[i];});
    const pageRows=rows.slice(pageIndex*rowsPerPage,(pageIndex+1)*rowsPerPage);
    let y=y0+32;
    pageRows.forEach((item,index)=>{
      const rank=pageIndex*rowsPerPage+index+1;
      const isTargetRow=Boolean(
        item?.isTarget ||
        (scan?.place_id && (String(item?.placeId||item?.place_id||'')===String(scan.place_id)))
      );
      const profileName=isTargetRow
        ? localRadarPdfSafeText(clientName)
        : localRadarPdfSafeText(item?.name||'Perfil');

      if(isTargetRow) doc.rect(x,y,W-76,31).fill('#e9f3f8');
      else if(index%2===1) doc.rect(x,y,W-76,31).fill('#f9fbfc');

      px=x;
      const vals=[
        rank,
        profileName,
        item.current_rank??rank,
        item.previous_rank??'—',
        item.averagePosition??'—',
        item.average_delta?.available?(item.average_delta.effective_direction==='improved'?'Melhorou':item.average_delta.effective_direction==='worsened'?'Piorou':'Estável'):'—',
        (item.top10Percent??0)+'%'
      ];

      vals.forEach((val,i)=>{
        if(i===1){
          const profileFont=isTargetRow?fontBold:fontRegular;
          const profileFontSize=fittedFontSize(val,profileFont,widths[i]-10);
          doc.fillColor(isTargetRow?blue:text)
            .font(profileFont)
            .fontSize(profileFontSize)
            .text(String(val),px+5,y+10,{width:widths[i]-10,lineBreak:false});
        }else{
          doc.fillColor(text)
            .font(i===2?fontBold:fontRegular)
            .fontSize(7.3)
            .text(String(val),px+5,y+10,{width:widths[i]-10,lineBreak:false});
        }
        px+=widths[i];
      });

      doc.moveTo(x,y+31).lineTo(W-38,y+31).strokeColor(line).lineWidth(.5).stroke();
      y+=31;
    });
    if(!pageRows.length) doc.fillColor(muted).fontSize(10).text('Nenhum concorrente foi incluído nesta rodada.',38,210);
  }

  doc.end();
  return done;
}

app.post('/api/local-radar/scans/:scanId/report.pdf',async(req,res)=>{
  await ensureLocalRadarTables();
  const scanId=String(req.params.scanId||'');
  const found=await query('SELECT * FROM local_radar_scans WHERE id=$1 LIMIT 1',[scanId]);
  if(!found.rows[0]) fail('Análise não encontrada.',404);
  const row=found.rows[0];
  let scan=await localRadarCanonicalizeScan({...row,center:{lat:row.center_lat,lng:row.center_lng}});
  let client={nome_cliente:scan.target_name||'Cliente',especialidade:'',cidade:''};
  if(scan.client_id){try{client=await getClientRow(scan.client_id);}catch{}}
  const mapImageBuffer=localRadarDataUrlToBuffer(asJson(req.body).map_image);
  const performance=scan.client_id?await googleBusinessPerformanceForClient(scan.client_id,'',scan.created_at||scan.createdAt):null;
  const monthlySnapshot=scan.client_id?(await query('SELECT * FROM local_radar_monthly_snapshots WHERE scan_id=$1 ORDER BY generated_at DESC LIMIT 1',[scan.id])).rows[0]||null:null;
  const pdf=await buildLocalRadarPdf(scan,client,mapImageBuffer,performance,monthlySnapshot);
  const monthLabel=localRadarMonthYearLabel('',scan.created_at||scan.createdAt);
  const fileName=localRadarPdfFileName('Relatorio Local Radar - '+String(client.nome_cliente||scan.target_name||'Cliente')+(monthLabel?' - '+monthLabel:''))+'.pdf';
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','attachment; filename="'+fileName+'"');
  res.setHeader('Content-Length',String(pdf.length));
  res.send(pdf);
});

app.post('/api/local-radar/reports',async(req,res)=>{const b=asJson(req.body),scanId=String(b.scan_id||'');const found=await query('SELECT * FROM local_radar_scans WHERE id=$1 LIMIT 1',[scanId]);if(!found.rows[0])fail('Análise não encontrada.',404);const scan={...found.rows[0],center:{lat:found.rows[0].center_lat,lng:found.rows[0].center_lng}};res.json(ok({report:await radarCreateReport(String(b.client_id||scan.client_id||''),scan,String(b.month_key||''))}));});
app.get('/api/local-radar/reports',async(req,res)=>{await ensureLocalRadarTables();const id=String(req.query.client_id||'');const rows=await query('SELECT id,client_id,scan_id,month_key,title,data,created_at FROM local_radar_reports WHERE ($1=\'\' OR client_id=$1) ORDER BY created_at DESC LIMIT 100',[id]);res.json(ok({reports:rows.rows}));});
app.delete('/api/local-radar/reports/:reportId',async(req,res)=>{
  await ensureLocalRadarTables();
  const reportId=String(req.params.reportId||'');
  const found=await query('DELETE FROM local_radar_reports WHERE id=$1 RETURNING id,client_id,scan_id',[reportId]);
  if(!found.rows[0]) fail('Relatório não encontrado.',404);
  res.json(ok({deleted:true,report:found.rows[0]}));
});
async function sendLocalRadarMonthlyReportToN8n(report,scan,options={}){
  if(!LOCAL_RADAR_N8N_WEBHOOK_URL) return {ok:false,skipped:true,error:'Webhook n8n não configurado.'};
  const executionMode=String(options.executionMode||'manual').trim().toLowerCase();
  const runAi=executionMode==='monthly_automatic'&&options.runAi===true;
  const client=await getClientRow(report.client_id||scan.client_id);
  const canonicalScan=await localRadarCanonicalizeScan(scan);
  const clientName=localRadarCanonicalText(client.nome_cliente||canonicalScan.target_name||'Cliente');
  canonicalScan.target_name=clientName;
  canonicalScan.competitors=Array.isArray(canonicalScan.competitors)
    ? canonicalScan.competitors.map(item=>({...item,name:item.isTarget?clientName:localRadarCanonicalText(item.name||'Perfil')}))
    : [];
  const competence=localRadarResolveCompetence(options.competence||report.month_key);
  const monthLabel=localRadarMonthYearLabel(competence,canonicalScan.created_at||canonicalScan.createdAt);
  const monthlySnapshot=await localRadarBuildMonthlySnapshot(report.client_id||canonicalScan.client_id,canonicalScan,competence,{refresh:runAi});
  const performance=monthlySnapshot.gbp||{};
  const pdf=await buildLocalRadarPdf(canonicalScan,client,null,performance,monthlySnapshot);
  let profilePhotos=[];
  let profileSnapshot=null;
  let competitorSnapshots=[];
  if(runAi){
    const rawProfileSnapshot=await localRadarProfileSnapshot(canonicalScan.place_id);
    profilePhotos=await localRadarProfilePhotoSamples(rawProfileSnapshot?.photo_resources||[]);
    profileSnapshot=rawProfileSnapshot?{...rawProfileSnapshot}:null;
    if(profileSnapshot) delete profileSnapshot.photo_resources;
    competitorSnapshots=await localRadarCompetitorSnapshots(canonicalScan.competitors,canonicalScan.place_id);
    await localRadarSaveIntelligence({clientId:report.client_id||canonicalScan.client_id,competence,keyword:canonicalScan.keyword||'',snapshotId:monthlySnapshot.id,status:'processing'});
  }
  const googleMapsUrl=profileSnapshot?.google_maps_url||(
    canonicalScan.place_id
      ? 'https://www.google.com/maps/search/?api=1&query_place_id='+encodeURIComponent(canonicalScan.place_id)
      : ''
  );
  const fileName=localRadarPdfFileName(
    'Relatorio Local Radar - '+clientName+(monthLabel?' - '+monthLabel:'')
  )+'.pdf';
  const summary=canonicalScan.summary||{};
  const caption=[
    '📍 *Local Radar LEME*',
    '*'+clientName+'*',
    monthLabel?'Competência: '+monthLabel:'',
    'Posição média: '+String(summary.averagePosition??'—'),
    'Top 3: '+String(summary.top3Percent??0)+'% · Top 10: '+String(summary.top10Percent??0)+'%'
  ].filter(Boolean).join('\n');

  const response=await fetch(LOCAL_RADAR_N8N_WEBHOOK_URL,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      ...(process.env.N8N_LEME_SECRET?{'X-LEME-N8N-KEY':String(process.env.N8N_LEME_SECRET)}:{})
    },
    body:JSON.stringify({
      event:runAi?'local_radar_monthly_report':'local_radar_manual_report',
      execution_mode:executionMode,
      run_ai:runAi,
      report_id:report.id,
      scan_id:canonicalScan.id,
      client_id:report.client_id||canonicalScan.client_id,
      client_name:clientName,
      specialty:localRadarCanonicalText(client.especialidade||''),
      city:localRadarCanonicalText(client.cidade||''),
      address:localRadarCanonicalText(report.data?.scan?.address||profileSnapshot?.address||''),
      keyword:canonicalScan.keyword||'',
      profile_place_id:canonicalScan.place_id||'',
      profile_google_maps_url:googleMapsUrl,
      profile_snapshot:profileSnapshot,
      profile_photos:profilePhotos,
      competitor_snapshots:competitorSnapshots,
      gbp_performance:performance,
      scan_summary:summary,
      grid_size:Number(canonicalScan.grid_size||0),
      radius_km:Number(canonicalScan.radius_km||0),
      grid_points:(canonicalScan.points||[]).slice(0,49).map(point=>({
        row:point.row,
        col:point.col,
        position:point.position??null,
        lat:point.lat,
        lng:point.lng,
        distance_from_center_km:point.distanceFromCenterKm??null
      })),
      competitors:(canonicalScan.competitors||[]).slice(0,20),
      month_key:competence,
      competence,
      previous_competence:monthlySnapshot.comparison?.previous_competence||localRadarShiftMonthKey(competence,-1),
      monthly_snapshot_id:monthlySnapshot.id,
      comparison_dataset:monthlySnapshot.raw_snapshot||{},
      internal_insights_url:String(process.env.PUBLIC_APP_URL||'').replace(/\/$/,'')+'/?view=local-radar&tab=insights&client_id='+encodeURIComponent(report.client_id||canonicalScan.client_id)+'&competence='+encodeURIComponent(competence),
      month_label:monthLabel,
      title:report.title,
      file_name:fileName,
      caption,
      pdf_base64:pdf.toString('base64')
    })
  });
  const text=await response.text().catch(()=>'');
  if(!response.ok){
    if(runAi)await localRadarSaveIntelligence({clientId:report.client_id||canonicalScan.client_id,competence,keyword:canonicalScan.keyword||'',snapshotId:monthlySnapshot.id,status:'failed',error:'n8n respondeu '+response.status});
    throw new Error('n8n Local Radar respondeu '+response.status+(text?': '+text.slice(0,300):''));
  }
  const parsed=localRadarParseN8nResponse(text);
  if(runAi){
    const intelligence=parsed.intelligence||parsed.data?.intelligence||{};
    await localRadarSaveIntelligence({
      clientId:report.client_id||canonicalScan.client_id,competence,keyword:canonicalScan.keyword||'',snapshotId:monthlySnapshot.id,
      status:Object.keys(intelligence).length?'completed':'failed',analysis:intelligence,actions:intelligence.actions||[],error:Object.keys(intelligence).length?'':'O fluxo concluiu sem devolver inteligência estruturada.'
    });
  }
  return {ok:true,status:response.status,response:parsed};
}

app.post('/api/local-radar/reports/:reportId/send-whatsapp',async(req,res)=>{
  await ensureLocalRadarTables();
  const reportId=String(req.params.reportId||'');
  const found=await query('SELECT * FROM local_radar_reports WHERE id=$1 LIMIT 1',[reportId]);
  if(!found.rows[0]) fail('Relatório não encontrado.',404);
  const report=found.rows[0];
  const scanFound=await query('SELECT * FROM local_radar_scans WHERE id=$1 LIMIT 1',[report.scan_id]);
  if(!scanFound.rows[0]) fail('Rodada do relatório não encontrada.',404);
  const row=scanFound.rows[0];
  const scan=await localRadarCanonicalizeScan({...row,center:{lat:row.center_lat,lng:row.center_lng}});
  res.json(ok({delivery:await sendLocalRadarMonthlyReportToN8n(report,scan,{executionMode:'manual_whatsapp',runAi:false})}));
});

app.post('/api/local-radar/monthly/run/:clientId',async(req,res)=>{
  const clientId=String(req.params.clientId||'');
  const scan=await radarRunScan({client_id:clientId});
  const monthKey=localRadarClosedCompetenceKey();
  const report=await radarCreateReport(clientId,scan,monthKey);
  let delivery=null;
  try{delivery=await sendLocalRadarMonthlyReportToN8n(report,scan,{executionMode:'manual_monthly_run',runAi:false});}catch(error){delivery={ok:false,error:error.message};}
  res.json(ok({scan,report,delivery}));
});

let localRadarAutomationRunning=false;
async function runLocalRadarMonthlyAutomation(){
  if(localRadarAutomationRunning)return; localRadarAutomationRunning=true;
  try{
    await ensureLocalRadarTables();
    const local=saoPauloParts(),monthKey=localRadarClosedCompetenceKey();
    const due=await query("SELECT c.client_id FROM local_radar_configs c WHERE c.monthly_enabled=true AND c.monthly_day <= $1 AND c.place_id <> '' AND c.keyword <> '' AND NOT EXISTS (SELECT 1 FROM local_radar_reports r WHERE r.client_id=c.client_id AND r.month_key=$2)",[local.day,monthKey]);
    for(const row of due.rows){
      try{
        const scan=await radarRunScan({client_id:row.client_id});
        const report=await radarCreateReport(row.client_id,scan,monthKey);
        try{
          await sendLocalRadarMonthlyReportToN8n(report,scan,{executionMode:'monthly_automatic',runAi:true});
          console.log('Local Radar mensal enviado ao WhatsApp:',row.client_id,monthKey);
        }catch(deliveryError){
          console.error('Local Radar mensal WhatsApp:',row.client_id,deliveryError.message);
        }
      }catch(error){
        console.error('Local Radar mensal:',row.client_id,error.message);
      }
    }
  }finally{localRadarAutomationRunning=false;}
}
setTimeout(()=>runLocalRadarMonthlyAutomation().catch(console.error),20000);
setInterval(()=>runLocalRadarMonthlyAutomation().catch(console.error),30*60*1000);


app.use((req, res, next) => {
  if (/\.(?:html|js|css)$/i.test(req.path) || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

const staticNoCache = {
  setHeaders(res, filePath) {
    if (/\.(?:html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
};

app.get(['/', '/index.html'], async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.use(express.static(ROOT_DIR, staticNoCache));

app.get('*', async (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhook/')) {
    return res.status(404).json({ ok: false, error: 'Rota não encontrada.' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Erro interno' });
});


async function repairPlaintextPasswords() {
  const rows = await query(`SELECT registro_id, senha, senha_hash, data FROM colaboradores WHERE COALESCE(senha,'') <> '' OR data ? 'senha' OR data ? 'password'`);
  for (const row of rows.rows) {
    const data = { ...(row.data || {}) };
    const plain = data.senha || data.password || row.senha || '';
    if (!plain) continue;
    const hash = data.senha_hash || row.senha_hash || passwordHash(plain);
    delete data.senha;
    delete data.password;
    data.senha_hash = hash;
    await query('UPDATE colaboradores SET senha = $1, senha_hash = $2, data = $3, updated_at = now() WHERE registro_id = $4', ['', hash, data, row.registro_id]);
  }
}

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
    const initialPassword = String(process.env.LEME_INITIAL_ADMIN_PASSWORD || '').trim();
    if (initialPassword.length < 12) {
      fail('Banco vazio: configure LEME_INITIAL_ADMIN_PASSWORD com pelo menos 12 caracteres.', 503);
    }
    await upsertColaborador({ registro_id: 'matheus', id: 'matheus', nome: 'Matheus', usuario: 'Matheus', senha: initialPassword, cargo: 'Direção / Produção', cor: '#163f63', status: 'Ativo' });
    await upsertColaborador({ registro_id: 'luis', id: 'luis', nome: 'Luis', usuario: 'Luis', senha: initialPassword, cargo: 'Direção / Produção', cor: '#4d95c6', status: 'Ativo' });
  }

  const financeCount = await query('SELECT COUNT(*)::int AS count FROM finance_boxes');
  if (financeCount.rows[0].count === 0) {
    for (const box of financeDefaultBoxes()) await upsertFinanceBox(box);
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
await repairPlaintextPasswords();
await seedIfEmpty();
app.listen(PORT, () => console.log(`Sistema LEME v107.3.2 rodando na porta ${PORT} com Analytics do Site, relatórios PDF e automação n8n`));
