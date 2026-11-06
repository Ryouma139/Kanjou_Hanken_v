/** 手元・テスト用：PGlite（Node の中で動く PostgreSQL）。dataDir を省くとメモリ上に作る。 */
import { PGlite } from "@electric-sql/pglite";
import { migrate, type DB, type Row } from "./db.ts";

export async function pgliteDb(dataDir?: string): Promise<DB & { close(): Promise<void> }> {
  const pg = new PGlite(dataDir);
  const db = {
    query: async <T extends Row>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}
