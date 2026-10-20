import { existsSync } from "node:fs";
import path from "node:path";
if (existsSync(path.join(process.cwd(), ".env.local")))
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
export const dataDirectory = () =>
  path.resolve(
    process.env.MECAPLAN_DATA_DIR || path.join(process.cwd(), "data"),
  );
