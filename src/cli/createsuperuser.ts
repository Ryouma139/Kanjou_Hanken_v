/**
 * 管理画面に入れるユーザーを作る（すでにいればパスワードを変えて管理者にする）。
 *   npm run createsuperuser -- <ニックネーム> <パスワード>
 */
import { hashPassword, validatePassword } from "../auth.ts";
import { loadConfig } from "../config.ts";
import { openDb } from "../db.ts";
import { Repo } from "../models.ts";

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

const repo = new Repo(openDb(loadConfig().dbPath));
const hash = await hashPassword(password);
const existing = repo.userByName(username);
if (existing) {
  repo.setUserPassword(existing.id, hash, true);
  console.log(`「${existing.username}」を管理者にし、パスワードを更新しました。`);
} else {
  repo.createUser(username, hash, true);
  console.log(`管理者「${username}」を作成しました。`);
}
