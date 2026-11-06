/** コマンド用：DATABASE_URL があれば Neon、なければ手元の PGlite につなぐ */
import type { DB } from "../db.ts";
import { neonDb } from "../db-neon.ts";
import { pgliteDb } from "../db-pglite.ts";

export async function connect(): Promise<{ db: DB; where: string; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (url) return { db: neonDb(url), where: "Neon", close: async () => {} };
  const dir = process.env.HANKEN_PGLITE_DIR ?? ".pglite";
  const db = await pgliteDb(dir);
  return { db, where: `PGlite（${dir}）`, close: () => db.close() };
}
