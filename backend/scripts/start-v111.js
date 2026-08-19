import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, '../src/server.js');
const runtimePath = path.resolve(__dirname, '../src/server.v111.runtime.js');

const source = await fs.readFile(sourcePath, 'utf8');
const marker = "app.post('/webhook/criar-publicacao', async (req, res) => {";
if (!source.includes(marker)) {
  throw new Error('V111: ponto de inserção do endpoint de calendário LEME não encontrado.');
}

const injection = String.raw`
// V111 — mídia do estúdio da LEME persistida no PostgreSQL.
app.post('/api/leme-art-media', upload.single('file'), async (req, res) => {
  if (!req.file) fail('Envie um arquivo no campo file.');
  const mimeType = String(req.file.mimetype || '').toLowerCase();
  const allowed = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
  if (!allowed.has(mimeType)) fail('Formato de vídeo não suportado. Use MP4, WebM ou MOV.');
  const mediaId = crypto.randomUUID();
  await query('CREATE TABLE IF NOT EXISTS leme_art_media (id text PRIMARY KEY, file_name text NOT NULL, mime_type text NOT NULL, file_data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
  await query('INSERT INTO leme_art_media (id,file_name,mime_type,file_data) VALUES ($1,$2,$3,$4)', [mediaId, String(req.file.originalname || 'video').slice(0, 240), mimeType, req.file.buffer]);
  return res.json(ok({
    id: mediaId,
    file_name: String(req.file.originalname || 'video'),
    mime_type: mimeType,
    url: '/media/leme-art/' + mediaId
  }));
});

app.get('/media/leme-art/:mediaId', async (req, res) => {
  await query('CREATE TABLE IF NOT EXISTS leme_art_media (id text PRIMARY KEY, file_name text NOT NULL, mime_type text NOT NULL, file_data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
  const found = await query('SELECT file_name,mime_type,file_data FROM leme_art_media WHERE id=$1 LIMIT 1', [String(req.params.mediaId || '')]);
  if (!found.rows[0]) return res.status(404).send('Mídia não encontrada.');
  res.setHeader('Content-Type', found.rows[0].mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + String(found.rows[0].file_name || 'media').replace(/["\\]/g, '') + '"');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(found.rows[0].file_data);
});

// V111 — endpoint exclusivo do calendário editorial da LEME.
// Não altera nem reutiliza o fluxo de criação mensal dos clientes.
app.post('/webhook/leme-calendario-mensal', async (req, res) => {
  const body = asJson(req.body);
  const action = String(body.action || body.acao || '').trim().toLowerCase();
  const profiles = await listTable('leme_profile');
  const profile = profiles.find(item => String(item.registro_id || item.id || '') === 'leme') || profiles[0] || {};
  const driveUrl = String(profile.drive_url || profile.drive_folder_url || '').trim();

  if (['context', 'contexto', 'get_context', 'dados'].includes(action) || (!body.publicacoes && !body.posts && !body.items && !body.calendario)) {
    return res.json(ok({
      action: 'leme_calendar_context',
      cliente_id: 'leme-interno',
      nome: profile.nome || 'LEME',
      drive_url: driveUrl,
      leme: profile,
      instruction: 'Use drive_url como pasta mãe da LEME. Depois envie as publicações para este mesmo endpoint no campo publicacoes.'
    }));
  }

  const rawItems = body.publicacoes || body.posts || body.items || body.calendario || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  if (!items.length) fail('Envie pelo menos uma publicação no campo publicacoes.');
  if (items.length > 100) fail('O limite é de 100 publicações por chamada.');

  const saved = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = asJson(items[index]);
    const titulo = String(item.titulo || item.tema || item.title || '').trim() || ('Publicação LEME ' + (index + 1));
    const dataPublicacao = dateOnly(item.data_publicacao || item.data || item.date);
    if (!dataPublicacao) fail('Informe uma data válida para a publicação ' + (index + 1) + '.');

    const referenciasRaw = item.referencias || item.referencia || item.links_referencia || [];
    const referencias = [...new Set(
      (Array.isArray(referenciasRaw) ? referenciasRaw : String(referenciasRaw || '').split(/\r?\n|\s*,\s*/))
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )].slice(0, 30);

    const deterministicSeed = [dataPublicacao, titulo, item.formato || item.format || ''].join('|').toLowerCase();
    const deterministicId = 'leme-' + dataPublicacao + '-' + crypto.createHash('sha1').update(deterministicSeed).digest('hex').slice(0, 12);
    const registroId = String(item.registro_id || item.id || item.external_id || deterministicId).trim();
    const now = nowIso();

    const record = await upsertPublicacao({
      ...item,
      id: registroId,
      registro_id: registroId,
      cliente_id: 'leme-interno',
      titulo,
      tema: item.tema || titulo,
      formato: item.formato || item.format || 'Post único',
      status: item.status || 'Ideia',
      data_publicacao: dataPublicacao,
      responsavel_id: item.responsavel_id || item.colaborador_id || '',
      drive_folder_url: item.drive_folder_url || item.pasta_drive || '',
      leme_drive_url: driveUrl,
      referencias,
      created_at: item.created_at || now,
      updated_at: now,
      origem_calendario: 'leme_mensal_n8n'
    });
    saved.push(record);
  }

  broadcastRealtime('publicacoes', 'leme_monthly_calendar_upserted', 'leme-interno', { total: saved.length });
  return res.json(ok({
    action: 'leme_monthly_calendar_upserted',
    cliente_id: 'leme-interno',
    drive_url: driveUrl,
    total: saved.length,
    data: saved
  }));
});

`;

const runtime = source.replace(marker, injection + marker);
await fs.writeFile(runtimePath, runtime, 'utf8');
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
