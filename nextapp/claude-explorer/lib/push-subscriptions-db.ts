import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PushSubscriptionRecord {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  created_at: string;
}

let db: Database | null = null;

function getDB(): Database {
  if (db) return db;

  const dbPath =
    process.env.EXPLORER_DB_PATH ?? join(homedir(), ".claude", "explorer.db");
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=3000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint    TEXT PRIMARY KEY,
      keys_p256dh TEXT NOT NULL,
      keys_auth   TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
  `);

  return db;
}

export function saveSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): void {
  const d = getDB();
  d.query(
    `INSERT OR REPLACE INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, created_at)
     VALUES ($endpoint, $keys_p256dh, $keys_auth, $created_at)`
  ).run({
    $endpoint: sub.endpoint,
    $keys_p256dh: sub.keys.p256dh,
    $keys_auth: sub.keys.auth,
    $created_at: new Date().toISOString(),
  });
}

export function removeSubscription(endpoint: string): void {
  getDB()
    .query("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .run(endpoint);
}

export function getAllSubscriptions(): PushSubscriptionRecord[] {
  return getDB()
    .query<PushSubscriptionRecord, []>("SELECT * FROM push_subscriptions")
    .all();
}
