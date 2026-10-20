export function oneDriveUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error("Escribe un enlace válido de OneDrive.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      host === "1drv.ms" ||
      host === "onedrive.live.com" ||
      host.endsWith(".sharepoint.com")
    )
  )
    throw Error("Usa un enlace HTTPS de OneDrive o SharePoint institucional.");
  if (value.length > 4096) throw Error("El enlace es demasiado largo.");
  return url.toString();
}
