import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
const windows = process.platform === "win32";
function pnpm(args, options) {
  if (!args.every((arg) => /^[a-zA-Z0-9:._/-]+$/.test(arg)))
    throw Error("Argumento de verificación no válido.");
  return windows
    ? spawn(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", "pnpm " + args.join(" ")],
        { ...options, shell: false },
      )
    : spawn("pnpm", args, { ...options, shell: false });
}
function run(args, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = pnpm(args, {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...extra },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error("Falló pnpm " + args.join(" "))),
    );
  });
}
let server;
try {
  await run(["test"]);
  await run(["run", "typecheck"]);
  await run(["run", "build"]);
  await mkdir("work", { recursive: true });
  const testDir = await mkdtemp(path.resolve("work", "verify-data-")),
    env = {
      ...process.env,
      MECAPLAN_DATA_DIR: testDir,
      ENABLE_DEMO: "1",
      BUILD_OUT: ".next-verify",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    base = "http://127.0.0.1:3102";
  server = pnpm(["run", "dev", "--port", "3102"], {
    stdio: "inherit",
    windowsHide: true,
    env,
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(base + "/api/app");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("No arrancó el servidor de prueba.");
  await run(["run", "test:integration"], {
    MECAPLAN_DATA_DIR: testDir,
    TEST_BASE_URL: base,
  });
  await run(["run", "test:security"], {
    MECAPLAN_DATA_DIR: testDir,
    TEST_BASE_URL: base,
  });
  await run(["run", "test:corrections"], {
    MECAPLAN_DATA_DIR: testDir,
    TEST_BASE_URL: base,
  });
  await run(["run", "test:webhook"], { MECAPLAN_DATA_DIR: testDir });
  await run(["run", "test:e2e"]);
  console.log(
    "Verificación local completa. Microsoft y GitHub reales requieren su configuración externa.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (server) {
    if (windows)
      await new Promise((r) => {
        const stop = spawn(
          "taskkill",
          ["/PID", String(server.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        stop.on("exit", r);
        stop.on("error", r);
      });
    else server.kill("SIGTERM");
  }
}
