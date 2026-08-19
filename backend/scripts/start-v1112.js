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
  throw new Error('V111.7: ponto de inserção dos recursos de mídia não encontrado.');
}

const injection = String.raw`
// Mídia do estúdio da LEME persistida no PostgreSQL.
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

const lemeMp4Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }
});

async function runLemeExec(binary, args, options = {}) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 32 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (!error) return resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
      const details = String(stderr || stdout || error.message || '').trim().slice(0, 3000);
      const out = new Error(details || ('Falha ao executar ' + binary + '.'));
      out.status = 500;
      reject(out);
    });
  });
}

async function probeLemeMedia(filePath) {
  const result = await runLemeExec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type',
    '-of', 'json',
    filePath
  ]);
  const data = JSON.parse(result.stdout || '{}');
  return {
    duration: Math.max(0.05, Number(data?.format?.duration || 0.05)),
    hasAudio: Array.isArray(data?.streams) && data.streams.some(stream => stream?.codec_type === 'audio')
  };
}

async function convertLemeVideoBufferToMp4(inputBuffer) {
  const jobId = crypto.randomUUID();
  const inputPath = path.join('/tmp', 'leme-render-' + jobId + '.webm');
  const outputPath = path.join('/tmp', 'leme-render-' + jobId + '.mp4');
  await fs.writeFile(inputPath, inputBuffer);
  try {
    await runLemeExec('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-r', '30', '-fps_mode', 'cfr',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
  }
}

app.post('/api/leme-art-convert-mp4', lemeMp4Upload.single('file'), async (req, res) => {
  if (!req.file?.buffer?.length) fail('Envie o vídeo renderizado no campo file.');
  const output = await convertLemeVideoBufferToMp4(req.file.buffer);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', String(output.length));
  res.setHeader('Cache-Control', 'no-store');
  return res.send(output);
});

// V111.7 — composição final feita integralmente pelo FFmpeg.
// O vídeo original não passa mais por MediaRecorder/canvas em tempo real;
// isso preserva todos os frames e elimina as travadas percebidas na exportação.
const lemeFinalRenderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024, files: 3 }
});

app.post('/api/leme-art-render-mp4', lemeFinalRenderUpload.fields([
  { name: 'overlay', maxCount: 1 },
  { name: 'video1', maxCount: 1 },
  { name: 'video2', maxCount: 1 }
]), async (req, res) => {
  const overlayFile = req.files?.overlay?.[0];
  const videoFiles = [req.files?.video1?.[0], req.files?.video2?.[0]].filter(Boolean);
  if (!overlayFile?.buffer?.length || !videoFiles.length) fail('Overlay e ao menos um vídeo são obrigatórios.');

  let config = {};
  try { config = JSON.parse(String(req.body?.config || '{}')); } catch { fail('Configuração de renderização inválida.'); }
  const width = Math.max(2, Math.round(Number(config.width || 1080) / 2) * 2);
  const height = Math.max(2, Math.round(Number(config.height || 1350) / 2) * 2);
  const fps = Math.max(24, Math.min(60, Math.round(Number(config.fps || 30))));
  const videoConfigs = Array.isArray(config.videos) ? config.videos.slice(0, videoFiles.length) : [];
  if (!videoConfigs.length) fail('Nenhuma configuração de vídeo foi enviada.');

  const jobId = crypto.randomUUID();
  const overlayPath = path.join('/tmp', 'leme-final-' + jobId + '-overlay.png');
  const outputPath = path.join('/tmp', 'leme-final-' + jobId + '.mp4');
  const videoPaths = videoFiles.map((file, index) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = mime.includes('webm') ? 'webm' : mime.includes('quicktime') ? 'mov' : 'mp4';
    return path.join('/tmp', 'leme-final-' + jobId + '-video' + (index + 1) + '.' + ext);
  });

  try {
    await fs.writeFile(overlayPath, overlayFile.buffer);
    await Promise.all(videoFiles.map((file, index) => fs.writeFile(videoPaths[index], file.buffer)));
    const probes = await Promise.all(videoPaths.map(probeLemeMedia));

    const normalized = videoConfigs.map((item, index) => {
      const duration = probes[index].duration;
      const start = Math.max(0, Math.min(Number(item.start || 0), Math.max(0, duration - 0.05)));
      let end = Number(item.end || 0);
      if (!Number.isFinite(end) || end <= start) end = duration;
      end = Math.max(start + 0.05, Math.min(end, duration));
      return {
        x: Math.round(Number(item.x || 0)),
        y: Math.round(Number(item.y || 0)),
        width: Math.max(2, Math.round(Number(item.width || width) / 2) * 2),
        height: Math.max(2, Math.round(Number(item.height || height) / 2) * 2),
        cropX: Math.max(0, Math.min(100, Number(item.cropX ?? 50))) / 100,
        cropY: Math.max(0, Math.min(100, Number(item.cropY ?? 50))) / 100,
        start, end, length: end - start,
        audio: item.audio !== false && probes[index].hasAudio,
        hasAudio: probes[index].hasAudio
      };
    });

    const maxDuration = Math.max(...normalized.map(item => item.length), 0.05);
    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    videoPaths.forEach(filePath => args.push('-i', filePath));
    const overlayInputIndex = videoPaths.length;
    args.push('-loop', '1', '-framerate', String(fps), '-i', overlayPath);

    const filters = [];
    normalized.forEach((item, index) => {
      const pad = Math.max(0, maxDuration - item.length);
      const parts = [
        'trim=start=' + item.start.toFixed(6) + ':end=' + item.end.toFixed(6),
        'setpts=PTS-STARTPTS',
        'scale=' + item.width + ':' + item.height + ':force_original_aspect_ratio=increase',
        "crop=" + item.width + ':' + item.height + ":x='(in_w-out_w)*" + item.cropX.toFixed(6) + "':y='(in_h-out_h)*" + item.cropY.toFixed(6) + "'",
        'setsar=1',
        'fps=' + fps
      ];
      if (pad > 0.001) parts.push('tpad=stop_mode=clone:stop_duration=' + pad.toFixed(6));
      parts.push('trim=duration=' + maxDuration.toFixed(6));
      filters.push('[' + index + ':v]' + parts.join(',') + '[v' + index + ']');
    });

    filters.push('color=c=black@0.0:s=' + width + 'x' + height + ':r=' + fps + ':d=' + maxDuration.toFixed(6) + ',format=rgba[base]');
    let current = 'base';
    normalized.forEach((item, index) => {
      const next = 'stage' + index;
      filters.push('[' + current + '][v' + index + ']overlay=x=' + item.x + ':y=' + item.y + ':shortest=0:eof_action=pass[' + next + ']');
      current = next;
    });
    filters.push('[' + overlayInputIndex + ':v]format=rgba,fps=' + fps + ',trim=duration=' + maxDuration.toFixed(6) + '[ov]');
    filters.push('[' + current + '][ov]overlay=0:0:shortest=1:format=auto[outv]');

    const audioIndexes = normalized.map((item, index) => item.audio ? index : -1).filter(index => index >= 0);
    if (audioIndexes.length) {
      const audioLabels = [];
      audioIndexes.forEach((index, audioOrder) => {
        const item = normalized[index];
        const label = 'a' + audioOrder;
        filters.push('[' + index + ':a]atrim=start=' + item.start.toFixed(6) + ':end=' + item.end.toFixed(6) + ',asetpts=PTS-STARTPTS,apad=pad_dur=' + maxDuration.toFixed(6) + ',atrim=duration=' + maxDuration.toFixed(6) + '[' + label + ']');
        audioLabels.push('[' + label + ']');
      });
      if (audioLabels.length === 1) {
        filters.push(audioLabels[0] + 'anull[aout]');
      } else {
        filters.push(audioLabels.join('') + 'amix=inputs=' + audioLabels.length + ':duration=longest:normalize=0,atrim=duration=' + maxDuration.toFixed(6) + '[aout]');
      }
    }

    args.push('-filter_complex', filters.join(';'), '-map', '[outv]');
    if (audioIndexes.length) args.push('-map', '[aout]'); else args.push('-an');
    args.push(
      '-t', maxDuration.toFixed(6),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-fps_mode', 'cfr',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', outputPath
    );

    await runLemeExec('ffmpeg', args);
    const output = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(output.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.send(output);
  } catch (error) {
    console.error('Falha no render final da arte LEME.', error);
    const out = new Error('Não foi possível renderizar o vídeo final. ' + String(error.message || '').slice(0, 1200));
    out.status = 500;
    throw out;
  } finally {
    await Promise.allSettled([
      fs.unlink(overlayPath), fs.unlink(outputPath), ...videoPaths.map(filePath => fs.unlink(filePath))
    ]);
  }
});

`;

const runtime = source.replace(marker, injection + marker);
await fs.writeFile(runtimePath, runtime, 'utf8');
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
