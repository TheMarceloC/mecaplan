import { withDistributedLock } from "./distributed-lock";
const shared = globalThis as unknown as { mecaStorageQueue?: Promise<unknown> };
/** Network jobs serialize their token cache independently of project writes. */
export function withStorageLock<T>(work: () => Promise<T>): Promise<T> {
  const run = (shared.mecaStorageQueue ?? Promise.resolve()).then(() =>
    withDistributedLock("onedrive", work),
  );
  shared.mecaStorageQueue = run.catch(() => {});
  return run;
}
