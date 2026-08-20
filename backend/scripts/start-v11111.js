import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, './start-v1112.js');
const runtimePath = path.resolve(__dirname, './start-v11111.runtime.js');

let source = await fs.readFile(sourcePath, 'utf8');

const mediaNeedle = "app.post('/api/leme-art-media', upload.single('file'), async (req, res) => {";
if (!source.includes(mediaNeedle)) throw new Error('V111.11: rota de mídia não encontrada.');
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
if (!source.includes(normalizedNeedle)) throw new Error('V111.11: bloco de enquadramento do FFmpeg não encontrado.');
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
        'scale=' + scaledWidth + ':' + scaledHeight + ':force_original_aspect_ratio=increase',
        "crop=w='" + cropW + "':h='" + cropH + "':x='max(0,(iw-" + cropW + ")*" + item.cropX.toFixed(6) + ")':y='max(0,(ih-" + cropH + ")*" + item.cropY.toFixed(6) + ")'",
        "pad=" + item.width + ':' + item.height + ":x='max(0,(ow-iw)*" + item.cropX.toFixed(6) + ")':y='max(0,(oh-ih)*" + item.cropY.toFixed(6) + ")':color=black@0",
        'format=rgba',
        'setsar=1',
        'fps=' + fps
      ];`;
if (!source.includes(filterNeedle)) throw new Error('V111.11: filtro de vídeo do FFmpeg não encontrado.');
source = source.replace(filterNeedle, filterReplacement);

await fs.writeFile(runtimePath, source, 'utf8');
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
