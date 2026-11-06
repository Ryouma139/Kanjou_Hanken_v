/**
 * テーブルを作る（何度実行しても安全）。
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import { migrate } from "../db.ts";
import { connect } from "./db.ts";

const { db, where, close } = await connect();
await migrate(db);
await close();
console.log(`${where} にテーブルを用意しました。`);
