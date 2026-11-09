const selector = document.getElementById("origen");
const status = document.getElementById("estado");
const sourceLabel = document.getElementById("fuente");
const time = document.getElementById("timestamp");
const fields = Object.fromEntries(
  ["contacto", "zona", "desplazamiento"].map(id => [id, document.getElementById(id)]),
);
const mapZones = document.querySelectorAll(".map-zone");
const decimal = new Intl.NumberFormat("es-HN", {maximumFractionDigits: 2});
const clock = new Intl.DateTimeFormat("es-HN", {timeStyle: "medium"});
const labels = {
  conectando: "Conectando",
  en_linea: "En línea",
  desconectado: "Desconectado",
};

let modeRevision = 0;

function displayReading(reading) {
  const value = reading?.valor;
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Detectado" : "En reposo";
  if (typeof value === "number") {
    return reading.unidad ? `${decimal.format(value)} ${reading.unidad}` : decimal.format(value);
  }
  return typeof value === "string" ? value : "—";
}

function render(source, state, snapshot) {
  const online = state === "en_linea";
  const readings = online ? snapshot?.lecturas : undefined;
  const active = readings?.contacto?.valor === true;
  const zone = active ? readings?.zona?.valor : undefined;
  const stamp = online && snapshot?.timestamp ? new Date(snapshot.timestamp) : null;

  sourceLabel.dataset.origen = source;
  sourceLabel.textContent = source === "simulado"
    ? "Datos simulados"
    : online ? "Datos reales" : "Modo hardware";
  status.dataset.estado = state;
  if (status.textContent !== labels[state]) status.textContent = labels[state];

  for (const [id, field] of Object.entries(fields)) {
    field.textContent = displayReading(readings?.[id]);
  }
  fields.contacto.dataset.activo = String(active);
  for (const region of mapZones) {
    region.classList.toggle("is-active", region.dataset.zone === zone);
  }

  if (stamp && !Number.isNaN(stamp.valueOf())) {
    time.dateTime = snapshot.timestamp;
    time.textContent = clock.format(stamp);
  } else {
    time.removeAttribute("datetime");
    time.textContent = "—";
  }
}

async function refresh() {
  const source = selector.value;
  const revision = modeRevision;
  try {
    const response = await fetch(`/api/sensors?origen=${source}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const snapshot = data.sensors.find(sensor => sensor.id === "tactil" && sensor.origen === source);
    const state = Object.hasOwn(labels, snapshot?.estado) ? snapshot.estado : "desconectado";
    if (revision === modeRevision) render(source, state, snapshot);
  } catch {
    if (revision === modeRevision) render(source, "desconectado");
  } finally {
    window.setTimeout(refresh, 500);
  }
}

selector.addEventListener("change", () => {
  modeRevision += 1;
  render(selector.value, "conectando");
});
refresh();
