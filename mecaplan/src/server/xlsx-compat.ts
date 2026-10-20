import JSZip from "jszip";
const spreadsheetNamespace =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
// ExcelJS expects unprefixed SpreadsheetML tags. Preserve text, CDATA and relationship
// attributes while accepting valid namespace-prefixed workbooks from other exporters.
export async function normalizeSpreadsheetNamespaces(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  let changed = false;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.endsWith(".xml")) continue;
    let xml = await entry.async("string");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error("El XLSX contiene definiciones XML no admitidas.");
    const prefixes = [
      ...xml.matchAll(
        /xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g,
      ),
    ].map((m) => m[1]);
    if (!prefixes.length) continue;
    for (const prefix of new Set(prefixes)) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      xml = xml.replace(
        /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<(?:(?:"[^"]*")|(?:'[^']*')|[^'">])*>/g,
        (tag) => {
          if (tag.startsWith("<!")) return tag;
          let result = tag.replace(new RegExp("^(</?)" + escaped + ":"), "$1");
          const declaration = new RegExp(
            "\\sxmlns:" +
              escaped +
              "=([\"'])" +
              spreadsheetNamespace.replaceAll("/", "\\/") +
              "\\1",
          );
          if (declaration.test(result)) {
            result = /\sxmlns\s*=/.test(result)
              ? result.replace(declaration, "")
              : result.replace("xmlns:" + prefix + "=", "xmlns=");
          }
          return result;
        },
      );
    }
    zip.file(name, xml);
    changed = true;
  }
  return changed
    ? zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    : bytes;
}
