import { existsSync } from "node:fs";
// Only deployment tools load this ignored file; Next's local app stays on SQLite.
if (existsSync(".env.cloud.local")) process.loadEnvFile(".env.cloud.local");
