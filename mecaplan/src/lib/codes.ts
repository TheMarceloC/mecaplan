import type { Project, Activity } from "./model";
export const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export const validPrefix = (value: string) =>
  /^[A-Z][A-Z0-9]{1,7}$/.test(value);
const defaults: Record<string, string> = {
  electronics: "ELE",
  software: "PRO",
  cad: "MAN",
  integration: "INT",
  instructor: "DOC",
};
export function teamPrefix(p: Project, teamId: string) {
  const team = p.teams.find((t) => t.id === teamId);
  return (
    (team?.codePrefix ??
      defaults[teamId] ??
      normalizeText(team?.name ?? "EQ")
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 4)
        .toUpperCase()) ||
    "EQ"
  );
}
export function nextActivityCode(p: Project, teamId: string) {
  const prefix = teamPrefix(p, teamId),
    used = new Set(p.activities.flatMap((a) => [a.code, ...(a.aliases ?? [])]));
  let n =
    Math.max(
      0,
      ...p.activities
        .filter((a) => a.code.startsWith(prefix + "-"))
        .map((a) => Number(a.code.slice(prefix.length + 1)) || 0),
    ) + 1;
  while (used.has(`${prefix}-${String(n).padStart(3, "0")}`)) n++;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
export function matchesActivityCode(a: Activity, code: string) {
  return [a.code, ...(a.aliases ?? [])].some(
    (c) => c.toUpperCase() === code.trim().toUpperCase(),
  );
}
export function normalizeProjectCodes(p: Project) {
  const prefixes = new Set<string>();
  for (const t of p.teams) {
    let prefix =
      t.codePrefix ??
      defaults[t.id] ??
      normalizeText(t.name)
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 4)
        .toUpperCase();
    if (!validPrefix(prefix)) prefix = "EQ";
    const base = prefix;
    let n = 2;
    while (prefixes.has(prefix)) prefix = base.slice(0, 5) + n++;
    t.codePrefix = prefix;
    prefixes.add(prefix);
  }
  for (const a of p.activities) {
    const prefix = teamPrefix(p, a.teamId);
    if (!new RegExp("^" + prefix + "-\\d{3,}$").test(a.code)) {
      const old = a.code;
      a.code = nextActivityCode(p, a.teamId);
      a.aliases = [...new Set([...(a.aliases ?? []), old].filter(Boolean))];
    }
  }
  if (p.control) {
    const used = new Set<string>();
    let n = 0;
    for (const r of p.control.risks) {
      if (r.code && !used.has(r.code)) {
        used.add(r.code);
        n = Math.max(n, Number(r.code.split("-")[1]) || 0);
      } else {
        do {
          r.code = `RIE-${String(++n).padStart(3, "0")}`;
        } while (used.has(r.code));
        used.add(r.code);
      }
    }
  }
  return p;
}
