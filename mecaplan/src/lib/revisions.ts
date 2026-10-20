export class RevisionConflict extends Error {}

export function assertActivityRevision(
  candidate: { revision?: number },
  current: { revision?: number },
) {
  if ((candidate.revision ?? 0) !== (current.revision ?? 0))
    throw new RevisionConflict(
      "Esta actividad cambió desde que abriste el formulario. Conserva tu borrador, actualiza la página y revisa los cambios antes de guardar.",
    );
}

export function canonical(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === "revision") return undefined;
    return v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v;
  });
}
