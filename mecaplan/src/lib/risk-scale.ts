// Significado de los valores 1 a 5 de la matriz de riesgos (índice = valor).
export const probabilityLabels = [
  "",
  "Muy baja",
  "Baja",
  "Media",
  "Alta",
  "Muy alta",
];
export const impactLabels = [
  "",
  "Mínimo",
  "Menor",
  "Moderado",
  "Mayor",
  "Crítico",
];

/** Opciones "3 · Media" para los desplegables de probabilidad e impacto. */
export const scaleOptions = (labels: string[]) =>
  [1, 2, 3, 4, 5].map((i) => ({
    value: String(i),
    label: `${i} · ${labels[i]}`,
  }));
