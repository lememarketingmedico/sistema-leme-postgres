import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, '../src/server.js');
const runtimePath = path.resolve(__dirname, '../src/server.v1112.runtime.js');

const source = await fs.readFile(sourcePath, 'utf8');
const marker = "app.post('/webhook/criar-publicacao', async (req, res) => {";
if (!source.includes(marker)) {
  throw new Error('V111.2: ponto de inserção dos recursos de mídia não encontrado.');
}

const injection = String.raw`
// V111.2 — mídia do estúdio da LEME persistida no PostgreSQL.
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

// V111.2 — toda exportação de vídeo do estúdio termina em MP4/H.264 + AAC.
// O navegador ainda renderiza o canvas via MediaRecorder e o backend faz a conversão final com FFmpeg.
const lemeMp4Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 180 * 1024 * 1024 }
});

async function convertLemeVideoBufferToMp4(inputBuffer) {
  const jobId = crypto.randomUUID();
  const inputPath = path.join('/tmp', 'leme-render-' + jobId + '.webm');
  const outputPath = path.join('/tmp', 'leme-render-' + jobId + '.mp4');
  await fs.writeFile(inputPath, inputBuffer);

  try {
    const { execFile } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', inputPath,
        '-map', '0:v:0',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        outputPath
      ], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error) return resolve();
        const details = String(stderr || stdout || error.message || '').trim().slice(0, 1800);
        const out = new Error(details ? 'FFmpeg: ' + details : 'Não foi possível converter o vídeo para MP4.');
        out.status = 500;
        reject(out);
      });
    });

    return await fs.readFile(outputPath);
  } finally {
    await Promise.allSettled([
      fs.unlink(inputPath),
      fs.unlink(outputPath)
    ]);
  }
}

app.post('/api/leme-art-convert-mp4', lemeMp4Upload.single('file'), async (req, res) => {
  if (!req.file?.buffer?.length) fail('Envie o vídeo renderizado no campo file.');
  const output = await convertLemeVideoBufferToMp4(req.file.buffer);
  const baseName = String(req.file.originalname || 'leme-video')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 120) || 'leme-video';
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', 'attachment; filename="' + baseName + '.mp4"');
  res.setHeader('Content-Length', String(output.length));
  res.setHeader('Cache-Control', 'no-store');
  return res.send(output);
});

`;

const runtime = source.replace(marker, injection + marker);
await fs.writeFile(runtimePath, runtime, 'utf8');
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
