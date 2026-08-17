import 'dotenv/config';
import { runMigrations, closePool } from '../src/db.js';
await runMigrations();
await closePool();
console.log('Migrações aplicadas com sucesso.');
