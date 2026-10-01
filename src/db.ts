import { MongoClient, type Collection, type Db } from 'mongodb';
import type { Env, SummonerDocument } from './types';

// --- Cliente MongoDB para Cloudflare Workers (driver nativo) ---
// Usa MONGO_URI (connection string) y MONGO_DB_NAME.

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

function getDb(env: Env): Db {
  if (cachedDb) return cachedDb;

  cachedClient = new MongoClient(env.MONGO_URI);
  cachedDb = cachedClient.db(env.MONGO_DB_NAME);
  return cachedDb;
}

function getCollection(env: Env): Collection<SummonerDocument> {
  return getDb(env).collection<SummonerDocument>('summoners');
}

// --- Operaciones ---

export async function findOne(
  env: Env,
  filter: Record<string, unknown>
): Promise<SummonerDocument | null> {
  const col = getCollection(env);
  return col.findOne(filter) as Promise<SummonerDocument | null>;
}

export async function insertOne(
  env: Env,
  document: Record<string, unknown>
): Promise<string | undefined> {
  const col = getCollection(env);
  const result = await col.insertOne(document as any);
  return result.insertedId?.toString();
}

export async function updateOne(
  env: Env,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<number> {
  const col = getCollection(env);
  const result = await col.updateOne(filter, update);
  return result.modifiedCount ?? 0;
}
