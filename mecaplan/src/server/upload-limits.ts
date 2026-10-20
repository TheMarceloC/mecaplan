import { postgresEnabled } from "./repositories/sql-driver";
export const importUploadBytes = () =>
  (postgresEnabled() ? 3 : 5) * 1024 * 1024;
export const jsonRequestBytes = () => (postgresEnabled() ? 4000000 : 32000000);
