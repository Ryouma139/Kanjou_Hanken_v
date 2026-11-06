import type { Message } from "./auth.ts";
import type { Config } from "./config.ts";
import type { Repo, User } from "./models.ts";

/** すべてのリクエストで使える共有物 */
export interface AppDeps {
  repo: Repo;
  config: Config;
}

/** Hono の Context に載せる値 */
export interface AppEnv {
  Variables: {
    app: AppDeps;
    user: User | null;
    /** 前の画面から届いたメッセージ */
    messages: Message[];
    /** 次の画面へ渡すメッセージ */
    outMessages: Message[];
  };
}
