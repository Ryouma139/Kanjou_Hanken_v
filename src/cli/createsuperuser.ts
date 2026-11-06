/**
 * 管理画面に入れるユーザーを作る（すでにいればパスワードを変えて管理者にする）。
 *   npm run createsuperuser -- <ニックネーム> <パスワード>
 * DATABASE_URL を付けると Neon（本番）に、付けなければ手元の PGlite に作る。
 */
import { hashPassword, validatePassword } from "../auth.ts";
import { Repo } from "../models.ts";
import { connect } from "./db.ts";

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("使い方: npm run createsuperuser -- <ニックネーム> <パスワード>");
  process.exit(1);
}
const problems = validatePassword(password, username);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const { db, where, close } = await connect();
const repo = new Repo(db);
const hash = await hashPassword(password);
const existing = await repo.userByName(username);
if (existing) {
  await repo.setUserPassword(existing.id, hash, true);
  console.log(`${where}：「${existing.username}」を管理者にし、パスワードを更新しました。`);
} else {
  await repo.createUser(username, hash, true);
  console.log(`${where}：管理者「${username}」を作成しました。`);
}
await close();
