import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export { schema };
export * from './schema';

const _dirname = dirname(fileURLToPath(import.meta.url));
const dbUrl = process.env.DB_URL ?? resolve(_dirname, '../otb.db');
const sqlite = new Database(dbUrl);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
