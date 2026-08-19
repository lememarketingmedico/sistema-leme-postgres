import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, './start-v1112.js');
const runtimePath = path.resolve(__dirname, './start-v1119.runtime.js');

let source = await fs.readFile(sourcePath, 'utf8');
const needle = "app.post('/api/leme-art-media', upload.single('file'), async (req, res) => {";
if (!source.includes(needle)) {
  throw new Error('V111.9: rota de mídia da LEME não encontrada para aplicar limite de 30 MB.');
}

source = source.replace(
  needle,
  "const lemeMediaUpload30 = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });\napp.post('/api/leme-art-media', lemeMediaUpload30.single('file'), async (req, res) => {"
);

await fs.writeFile(runtimePath, source, 'utf8');
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
