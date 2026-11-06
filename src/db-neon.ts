/** 本番用：Neon に HTTP でつなぐ（Cloudflare Workers でも Node でも動く） */
import { neon } from "@neondatabase/serverless";
import type { DB, Row } from "./db.ts";

export function neonDb(databaseUrl: string): DB {
  const sql = neon(databaseUrl);
  return {
    query: async <T extends Row>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
  };
}
