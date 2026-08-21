import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, './start-v1112.js');
const runtimePath = path.resolve(__dirname, './start-v11114.runtime.js');

let source = await fs.readFile(sourcePath, 'utf8');

// V111.14 — mídia original em alta qualidade e compatibilidade ampla de vídeo.
const oldMediaBody = `  const mimeType = String(req.file.mimetype || '').toLowerCase();
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
  }));`;

const newMediaBody = `  const originalName = String(req.file.originalname || 'midia').slice(0, 240);
  const mimeType = String(req.file.mimetype || '').toLowerCase();
  const ext = path.extname(originalName).toLowerCase();
  const imageExts = new Set(['.png','.jpg','.jpeg','.webp','.avif','.gif','.bmp','.svg']);
  const videoExts = new Set(['.mp4','.m4v','.mov','.webm','.mkv','.avi','.wmv','.flv','.mpeg','.mpg','.mpe','.mts','.m2ts','.ts','.3gp','.3g2','.ogv','.vob','.asf','.rm','.rmvb','.divx','.mxf','.f4v','.dv']);
  const isImage = mimeType.startsWith('image/') || imageExts.has(ext);
  const looksVideo = mimeType.startsWith('video/') || videoExts.has(ext);
  if (!isImage && !looksVideo) fail('Arquivo não identificado como imagem ou vídeo.');

  const mediaId = crypto.randomUUID();
  let storedBuffer = req.file.buffer;
  let storedMime = mimeType || (isImage ? 'application/octet-stream' : 'video/mp4');
  let storedName = originalName;
  const mediaType = isImage ? 'image' : 'video';
  const mediaUrl = isImage ? '/media/leme-art-image/' + mediaId : '/media/leme-art/' + mediaId;

  if (!isImage) {
    const safeExt = ext && /^[.][a-z0-9]{1,8}$/i.test(ext) ? ext : '.bin';
    const inputPath = path.join('/tmp', 'leme-upload-' + mediaId + safeExt);
    const outputPath = path.join('/tmp', 'leme-upload-' + mediaId + '.mp4');
    try {
      await fs.writeFile(inputPath, req.file.buffer);
      const probe = await runLemeExec('ffprobe', [
        '-v','error',
        '-select_streams','v:0',
        '-show_entries','stream=codec_name,width,height,r_frame_rate',
        '-show_entries','format=format_name',
        '-of','json',
        inputPath
      ]);
      const probeData = JSON.parse(probe.stdout || '{}');
      const videoStream = Array.isArray(probeData?.streams) ? probeData.streams[0] : null;
      if (!videoStream?.codec_name) fail('O FFmpeg não conseguiu identificar uma faixa de vídeo nesse arquivo.');
      const codec = String(videoStream.codec_name || '').toLowerCase();

      if (codec === 'h264') {
        await runLemeExec('ffmpeg', [
          '-y','-hide_banner','-loglevel','error','-i',inputPath,
          '-map','0:v:0','-map','0:a?',
          '-c:v','copy','-c:a','aac','-b:a','256k',
          '-movflags','+faststart',outputPath
        ]);
      } else {
        await runLemeExec('ffmpeg', [
          '-y','-hide_banner','-loglevel','error','-i',inputPath,
          '-map','0:v:0','-map','0:a?',
          '-c:v','libx264','-preset','slow','-crf','10','-pix_fmt','yuv420p',
          '-c:a','aac','-b:a','256k',
          '-movflags','+faststart',outputPath
        ]);
      }

      storedBuffer = await fs.readFile(outputPath);
      storedMime = 'video/mp4';
      storedName = originalName.replace(/\.[^.]+$/,'') + '.mp4';
    } catch (error) {
      console.error('Falha ao normalizar vídeo enviado para o estúdio.', error);
      fail('Esse vídeo não pôde ser decodificado pelo FFmpeg. Tente exportá-lo novamente mantendo uma faixa de vídeo válida.');
    } finally {
      await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
    }
  }

  await query('CREATE TABLE IF NOT EXISTS leme_art_media (id text PRIMARY KEY, file_name text NOT NULL, mime_type text NOT NULL, file_data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
  await query('INSERT INTO leme_art_media (id,file_name,mime_type,file_data) VALUES ($1,$2,$3,$4)', [mediaId, storedName, storedMime, storedBuffer]);
  return res.json(ok({
    id: mediaId,
    file_name: storedName,
    mime_type: storedMime,
    media_type: mediaType,
    kind: mediaType,
    url: mediaUrl
  }));`;

if (!source.includes(oldMediaBody)) throw new Error('V111.14: corpo da rota de mídia não encontrado.');
source = source.replace(oldMediaBody, newMediaBody);

const imageRouteMarker = `app.get('/media/leme-art/:mediaId', async (req, res) => {`;
if (!source.includes(imageRouteMarker)) throw new Error('V111.14: rota de leitura de mídia não encontrada.');
source = source.replace(imageRouteMarker, `app.get('/media/leme-art-image/:mediaId', async (req, res) => {
  await query('CREATE TABLE IF NOT EXISTS leme_art_media (id text PRIMARY KEY, file_name text NOT NULL, mime_type text NOT NULL, file_data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
  const found = await query('SELECT file_name,mime_type,file_data FROM leme_art_media WHERE id=$1 LIMIT 1', [String(req.params.mediaId || '')]);
  if (!found.rows[0]) return res.status(404).send('Mídia não encontrada.');
  res.setHeader('Content-Type', found.rows[0].mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + String(found.rows[0].file_name || 'imagem').replace(/["\\\\]/g, '') + '"');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(found.rows[0].file_data);
});

${imageRouteMarker}`);

// Exportação de vídeo com qualidade muito alta, sem reduzir resolução.
source = source.replaceAll("'-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p'", "'-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p'");
source = source.replaceAll("'-c:a', 'aac', '-b:a', '192k'", "'-c:a', 'aac', '-b:a', '256k'");

// Mantém V111.11: 30 MB e zoom na composição FFmpeg.
const mediaNeedle = "app.post('/api/leme-art-media', upload.single('file'), async (req, res) => {";
if (!source.includes(mediaNeedle)) throw new Error('V111.14: rota de mídia não encontrada após normalização.');
source = source.replace(
  mediaNeedle,
  "const lemeMediaUpload30 = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });\napp.post('/api/leme-art-media', lemeMediaUpload30.single('file'), async (req, res) => {"
);

const normalizedNeedle = `        cropX: Math.max(0, Math.min(100, Number(item.cropX ?? 50))) / 100,
        cropY: Math.max(0, Math.min(100, Number(item.cropY ?? 50))) / 100,
        start, end, length: end - start,`;
const normalizedReplacement = `        cropX: Math.max(0, Math.min(100, Number(item.cropX ?? 50))) / 100,
        cropY: Math.max(0, Math.min(100, Number(item.cropY ?? 50))) / 100,
        zoom: Math.max(0.05, Math.min(3, Number(item.zoom ?? 1))),
        start, end, length: end - start,`;
if (!source.includes(normalizedNeedle)) throw new Error('V111.14: bloco de enquadramento do FFmpeg não encontrado.');
source = source.replace(normalizedNeedle, normalizedReplacement);

const filterNeedle = `      const parts = [
        'trim=start=' + item.start.toFixed(6) + ':end=' + item.end.toFixed(6),
        'setpts=PTS-STARTPTS',
        'scale=' + item.width + ':' + item.height + ':force_original_aspect_ratio=increase',
        "crop=" + item.width + ':' + item.height + ":x='(in_w-out_w)*" + item.cropX.toFixed(6) + "':y='(in_h-out_h)*" + item.cropY.toFixed(6) + "'",
        'setsar=1',
        'fps=' + fps
      ];`;
const filterReplacement = `      const scaledWidth = Math.max(2, Math.round((item.width * item.zoom) / 2) * 2);
      const scaledHeight = Math.max(2, Math.round((item.height * item.zoom) / 2) * 2);
      const cropW = "min(iw," + item.width + ")";
      const cropH = "min(ih," + item.height + ")";
      const parts = [
        'trim=start=' + item.start.toFixed(6) + ':end=' + item.end.toFixed(6),
        'setpts=PTS-STARTPTS',
        'scale=' + scaledWidth + ':' + scaledHeight + ':force_original_aspect_ratio=increase:flags=lanczos',
        "crop=w='" + cropW + "':h='" + cropH + "':x='max(0,(iw-" + cropW + ")*" + item.cropX.toFixed(6) + ")':y='max(0,(ih-" + cropH + ")*" + item.cropY.toFixed(6) + ")'",
        "pad=" + item.width + ':' + item.height + ":x='max(0,(ow-iw)*" + item.cropX.toFixed(6) + ")':y='max(0,(oh-ih)*" + item.cropY.toFixed(6) + ")':color=black@0",
        'format=rgba',
        'setsar=1',
        'fps=' + fps
      ];`;
if (!source.includes(filterNeedle)) throw new Error('V111.14: filtro de vídeo do FFmpeg não encontrado.');
source = source.replace(filterNeedle, filterReplacement);

await fs.writeFile(runtimePath, source, 'utf8');
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
