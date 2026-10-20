import { withDistributedLock } from "./distributed-lock";
const shared = globalThis as unknown as { mecaWriteQueue?: Promise<unknown> };
export function withWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const run = (shared.mecaWriteQueue ?? Promise.resolve()).then(() =>
    withDistributedLock("project-write", work),
  );
  shared.mecaWriteQueue = run.catch(() => {});
  return run;
}
