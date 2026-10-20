import {
  ConfidentialClientApplication,
  type ICachePlugin,
} from "@azure/msal-node";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { sql } from "./repositories/database";
import { withStorageLock } from "./storage-lock";
import { oneDriveUrl } from "@/lib/onedrive-link";
import { dataDirectory } from "./data-directory";
import { postgresEnabled } from "./repositories/sql-driver";
const scopes = [
  "https://graph.microsoft.com/Files.ReadWrite",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];
const secretKeyPath = path.join(dataDirectory(), "onedrive-token-key.bin");
async function encryptionKey() {
  if (process.env.ONEDRIVE_TOKEN_KEY) {
    const b = Buffer.from(process.env.ONEDRIVE_TOKEN_KEY, "base64");
    if (b.length !== 32)
      throw Error("ONEDRIVE_TOKEN_KEY debe contener 32 bytes en base64.");
    return b;
  }
  if (postgresEnabled())
    throw Error(
      "Configura ONEDRIVE_TOKEN_KEY para conservar el cifrado de tokens en la nube.",
    );
  await mkdir(path.dirname(secretKeyPath), { recursive: true });
  try {
    return await readFile(secretKeyPath);
  } catch {
    const key = randomBytes(32);
    try {
      await writeFile(secretKeyPath, key, { flag: "wx", mode: 0o600 });
      return key;
    } catch {
      return readFile(secretKeyPath);
    }
  }
}
async function encrypt(text: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", await encryptionKey(), iv),
    data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
async function decrypt(value: string) {
  const b = Buffer.from(value, "base64"),
    d = createDecipheriv(
      "aes-256-gcm",
      await encryptionKey(),
      b.subarray(0, 12),
    );
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
const row = async (id: string) =>
  (await sql
    .prepare("SELECT payload FROM storage_connections WHERE id=?")
    .get(id)) as { payload: string } | undefined;
const setRow = async (id: string, payload: string) =>
  await sql
    .prepare(
      "INSERT INTO storage_connections VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    )
    .run(id, payload);
export function driveConfigured() {
  return !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.ONEDRIVE_REDIRECT_URI
  );
}
function client() {
  if (!driveConfigured())
    throw Error(
      "Configura la aplicación de Microsoft para conectar OneDrive institucional. Puedes asociar enlaces mientras tanto.",
    );
  const tenant = process.env.MICROSOFT_TENANT_ID || "organizations";
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant))
    throw Error("Tenant de Microsoft no válido.");
  const plugin: ICachePlugin = {
    beforeCacheAccess: async (c) => {
      const value = await row("onedrive-cache");
      if (value) c.tokenCache.deserialize(await decrypt(value.payload));
    },
    afterCacheAccess: async (c) => {
      if (c.cacheHasChanged)
        await setRow("onedrive-cache", await encrypt(c.tokenCache.serialize()));
    },
  };
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: "https://login.microsoftonline.com/" + tenant,
    },
    cache: { cachePlugin: plugin },
  });
}
export async function storageStatus() {
  const info = await row("onedrive-account");
  return {
    configured: driveConfigured(),
    connected: !!info,
    account: info ? JSON.parse(info.payload).name : "",
    redirectUri: process.env.ONEDRIVE_REDIRECT_URI ?? "",
    missing: [
      "MICROSOFT_TENANT_ID",
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_CLIENT_SECRET",
      "ONEDRIVE_REDIRECT_URI",
    ].filter((key) => !process.env[key]),
  };
}
export async function beginDriveAuth(
  userId: string,
  origin: string,
  sessionHash: string,
) {
  const redirect = process.env.ONEDRIVE_REDIRECT_URI;
  if (!redirect || new URL(redirect).origin !== origin)
    throw Error(
      "Abre MecaPlan desde el mismo origen configurado en ONEDRIVE_REDIRECT_URI antes de conectar.",
    );
  const state = randomBytes(32).toString("hex"),
    verifier = randomBytes(48).toString("base64url");
  await sql
    .prepare("DELETE FROM oauth_states WHERE expires_at<?")
    .run(Date.now());
  await sql
    .prepare("INSERT INTO oauth_states VALUES(?,?,?,?)")
    .run(
      createHash("sha256").update(state).digest("hex"),
      userId,
      Date.now() + 600000,
      JSON.stringify({ verifier, sessionHash }),
    );
  const auth = await client().getAuthCodeUrl({
    scopes,
    redirectUri: redirect,
    state,
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    codeChallengeMethod: "S256",
    prompt: "select_account",
  });
  return auth;
}
export async function finishDriveAuth(
  userId: string,
  state: string,
  code: string,
  sessionHash: string,
) {
  const key = createHash("sha256").update(state).digest("hex"),
    entry = (await sql
      .prepare("SELECT user_id,expires_at,payload FROM oauth_states WHERE id=?")
      .get(key)) as
      | { user_id: string; expires_at: number; payload: string }
      | undefined;
  if (
    !entry ||
    entry.user_id !== userId ||
    entry.expires_at < Date.now() ||
    !sessionHash ||
    JSON.parse(entry.payload).sessionHash !== sessionHash
  )
    throw Error(
      "La conexión caducó o no corresponde a tu sesión. Vuelve a intentarlo.",
    );
  await sql.prepare("DELETE FROM oauth_states WHERE id=?").run(key);
  const result = await client().acquireTokenByCode({
    code,
    scopes,
    redirectUri: process.env.ONEDRIVE_REDIRECT_URI!,
    codeVerifier: JSON.parse(entry.payload).verifier,
  });
  if (!result?.account) throw Error("Microsoft no devolvió una cuenta válida.");
  await setRow(
    "onedrive-account",
    JSON.stringify({
      accountId: result.account.homeAccountId,
      name: result.account.name ?? "Cuenta institucional",
      connectedBy: userId,
    }),
  );
}
export async function disconnectDrive() {
  await sql
    .prepare(
      "DELETE FROM storage_connections WHERE id IN ('onedrive-cache','onedrive-account')",
    )
    .run();
}
async function accessToken() {
  const accountInfo = await row("onedrive-account");
  if (!accountInfo)
    throw Error(
      "Conecta OneDrive institucional antes de subir archivos. También puedes asociar un enlace existente.",
    );
  const c = client(),
    info = JSON.parse(accountInfo.payload),
    account = (await c.getTokenCache().getAllAccounts()).find(
      (a) => a.homeAccountId === info.accountId,
    );
  if (!account) throw Error("Vuelve a conectar tu cuenta institucional.");
  try {
    const r = await c.acquireTokenSilent({ account, scopes });
    if (!r?.accessToken) throw Error();
    return r.accessToken;
  } catch {
    throw Error(
      "La autorización de OneDrive caducó o fue revocada. Vuelve a conectar la cuenta.",
    );
  }
}
class GraphError extends Error {
  constructor(public status: number) {
    super(
      status === 403
        ? "Microsoft no permite esta operación. Revisa los permisos de la cuenta institucional."
        : status === 401
          ? "Vuelve a conectar OneDrive."
          : "OneDrive no pudo completar la operación. Código " + status,
    );
  }
}
async function graph(endpoint: string, options: RequestInit = {}) {
  const response = await fetch("https://graph.microsoft.com/v1.0" + endpoint, {
    ...options,
    headers: {
      Authorization: "Bearer " + (await accessToken()),
      ...options.headers,
    },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new GraphError(response.status);
  return response;
}
async function folder(parent: string, name: string) {
  try {
    return await (await graph(`${parent}:/${encodeURIComponent(name)}`)).json();
  } catch (e) {
    if (!(e instanceof GraphError) || e.status !== 404) throw e;
  }
  return (
    await graph(
      parent.endsWith("/root") ? parent + "/children" : parent + "/children",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      },
    )
  ).json();
}
export async function uploadToDrive(
  projectId: string,
  name: string,
  bytes: Uint8Array,
  operation = { id: crypto.randomUUID(), actorId: "system" },
) {
  return withStorageLock(async () => {
    const hash = createHash("sha256").update(bytes).digest("hex"),
      account = await row("onedrive-account");
    if (!account)
      throw Error("Conecta OneDrive institucional antes de subir archivos.");
    const accountId = JSON.parse(account.payload).accountId;
    const existing = (await sql
      .prepare(
        "SELECT project_id,actor_id,payload FROM storage_operations WHERE id=?",
      )
      .get(operation.id)) as
      | { project_id: string; actor_id: string; payload: string }
      | undefined;
    let job: Record<string, any> = existing
      ? JSON.parse(existing.payload)
      : { name, hash, size: bytes.length, state: "pending", accountId };
    if (
      existing &&
      (existing.project_id !== projectId ||
        existing.actor_id !== operation.actorId ||
        job.hash !== hash ||
        job.accountId !== accountId)
    )
      throw Error(
        "La operación de subida pertenece a otro archivo, cuenta o proyecto. Inicia una nueva subida.",
      );
    const save = async () =>
      await sql
        .prepare(
          "INSERT INTO storage_operations VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        )
        .run(
          operation.id,
          projectId,
          operation.actorId,
          new Date().toISOString(),
          JSON.stringify(job),
        );
    await save();
    try {
      if (!job.itemId) {
        const root = await folder("/me/drive/root", "MecaPlan"),
          base = await folder(
            "/me/drive/items/" + encodeURIComponent(root.id),
            "Proyecto-" + projectId,
          );
        const fileName =
          operation.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) +
          "-" +
          name.replace(/[\x00-\x1f<>:"/\\|?*#%]/g, "_").slice(0, 150);
        // Stable path: retrying a PUT with a lost response replaces the same operation's file.
        job.path =
          "/me/drive/items/" +
          encodeURIComponent(base.id) +
          ":/" +
          encodeURIComponent(fileName) +
          ":/content";
        await save();
        const item = await (
          await graph(job.path, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: Buffer.from(bytes),
          })
        ).json();
        job = {
          ...job,
          driveId: String(item.parentReference?.driveId ?? ""),
          itemId: String(item.id ?? ""),
          url: oneDriveUrl(String(item.webUrl ?? "")),
          state: "uploaded",
        };
        await save();
        if (!job.driveId || !job.itemId || item.size !== bytes.length)
          throw Error("No se pudo verificar el archivo guardado en OneDrive.");
      }
      if (job.state !== "verified" && job.state !== "linked") {
        const downloaded = await graph(
            "/drives/" +
              encodeURIComponent(job.driveId) +
              "/items/" +
              encodeURIComponent(job.itemId) +
              "/content",
          ),
          copy = Buffer.from(await downloaded.arrayBuffer());
        if (
          copy.length !== bytes.length ||
          createHash("sha256").update(copy).digest("hex") !== hash
        )
          throw Error(
            "La copia de OneDrive no coincide con el archivo original.",
          );
        job.state = "verified";
        delete job.error;
        await save();
      }
      return {
        provider: "onedrive" as const,
        url: oneDriveUrl(job.url),
        driveId: String(job.driveId),
        itemId: String(job.itemId),
      };
    } catch (e) {
      job.state = "error";
      job.error = e instanceof Error ? e.message : "Subida interrumpida";
      await save();
      throw e;
    }
  });
}
export async function markStorageLinked(id: string) {
  const entry = (await sql
    .prepare("SELECT payload FROM storage_operations WHERE id=?")
    .get(id)) as { payload: string } | undefined;
  if (entry) {
    const job = JSON.parse(entry.payload);
    job.state = "linked";
    delete job.error;
    await sql
      .prepare("UPDATE storage_operations SET payload=? WHERE id=?")
      .run(JSON.stringify(job), id);
  }
}
