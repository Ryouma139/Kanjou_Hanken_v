import { serve } from "@hono/node-server";
import { createApp } from "./app.tsx";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";

const config = loadConfig();
const db = openDb(config.dbPath);
const app = createApp(db, config);
const port = Number(process.env.PORT ?? 8000);
const hostname = process.env.HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`感情の半券: http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${info.port}/`);
});
