export const importSheets = [
  {
    key: "activities",
    name: "Actividades",
    headers: [
      "Referencia",
      "Código",
      "Título",
      "Equipo",
      "Descripción",
      "Estado",
      "Prioridad",
      "Inicio",
      "Fin",
      "Duración",
      "Responsables",
      "Aprobador",
      "Consultados",
      "Informados",
      "Dependencias",
      "Desfases",
      "Evidencias",
      "Motivo bloqueo",
    ],
  },
  {
    key: "budget",
    name: "Presupuesto BOM",
    headers: [
      "Referencia",
      "Nombre",
      "Equipo",
      "Categoría",
      "Cantidad",
      "Precio unitario",
      "Proveedor",
      "Enlace",
      "Actividad",
      "BOM",
      "Notas",
    ],
  },
  {
    key: "expenses",
    name: "Gastos",
    headers: [
      "Referencia",
      "Descripción",
      "Equipo",
      "Fecha",
      "Importe",
      "Partida",
      "Actividad",
      "Comprobante",
    ],
  },
  {
    key: "risks",
    name: "Riesgos",
    headers: [
      "Referencia",
      "Descripción",
      "Probabilidad",
      "Impacto",
      "Mitigación",
      "Responsable",
      "Estado",
    ],
  },
  ...[
    ["weekly", "Bitácoras"],
    ["meeting", "Actas de reunión"],
    ["reception", "Recepción línea base"],
    ["acceptance", "Pruebas de aceptación"],
    ["checklist", "Listas de revisión"],
  ].map(([key, name]) => ({
    key,
    name,
    headers: [
      "Referencia",
      "Título",
      "Equipo",
      "Fecha",
      "Responsable",
      "Resumen",
      "Completado",
      "Elementos",
      "Objetivo",
      "Medición",
      "Resultado",
      "Evidencia",
      "Participantes",
    ],
  })),
] as const;
export type ImportIssue = {
  sheet: string;
  row: number;
  column: string;
  message: string;
};
export type ImportChange = {
  sheet: string;
  row: number;
  kind: string;
  mode: "new" | "update";
  unchanged?: boolean;
  label: string;
  id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};
