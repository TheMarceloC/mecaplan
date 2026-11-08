const selector = document.getElementById("origen");
const status = document.getElementById("estado");
const time = document.getElementById("timestamp");
const valueIds = ["contacto", "zona", "desplazamiento"];
const labels = {
  conectando: "Conectando",
  en_linea: "En línea",
  desconectado: "Desconectado",
};

function displayReading(reading) {
  if (reading?.valor == null) return "—";
  if (typeof reading.valor === "boolean") return reading.valor ? "Detectado" : "En reposo";
  return reading.unidad ? `${reading.valor} ${reading.unidad}` : reading.valor;
}

function render(source, state, snapshot) {
  const realReading = state === "en_linea" && snapshot?.timestamp;
  document.getElementById("fuente").textContent =
    source === "simulado" ? "Datos simulados" : (realReading ? "Datos reales" : "Modo hardware");
  status.dataset.estado = state;
  if (status.textContent !== labels[state]) status.textContent = labels[state];

  for (const id of valueIds) {
    document.getElementById(id).textContent = displayReading(snapshot?.lecturas[id]);
  }
  if (snapshot?.timestamp) {
    time.dateTime = snapshot.timestamp;
    time.textContent = new Date(snapshot.timestamp).toLocaleTimeString("es-HN");
  } else {
    time.removeAttribute("datetime");
    time.textContent = "—";
  }
}

async function refresh() {
  const source = selector.value;
  try {
    const response = await fetch(`/api/sensors?origen=${source}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const snapshot = data.sensors.find(sensor => sensor.id === "tactil");
    if (selector.value === source) {
      render(source, snapshot?.estado ?? "desconectado", snapshot);
    }
  } catch {
    if (selector.value === source) render(source, "desconectado");
  } finally {
    window.setTimeout(refresh, 500);
  }
}

selector.addEventListener("change", () => render(selector.value, "conectando"));
refresh();
