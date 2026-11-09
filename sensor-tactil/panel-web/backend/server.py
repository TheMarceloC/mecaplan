import argparse
import json
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import monotonic
from urllib.parse import parse_qs, urlsplit

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
STARTED_AT = monotonic()


def tactile_snapshot(source):
    sensor = {
        "id": "tactil",
        "nombre": "Sensor táctil",
        "estado": "desconectado",
        "origen": source,
        "timestamp": None,
        "lecturas": {
            "contacto": {"valor": None, "unidad": None},
            "zona": {"valor": None, "unidad": None},
            "desplazamiento": {"valor": None, "unidad": "px"},
        },
    }
    # El adaptador físico de Vargas reemplazará esta respuesta de espera.
    if source == "real":
        return sensor

    # Secuencia de ejemplo para verificar el contrato sin cámara ni OpenCV.
    elapsed = monotonic() - STARTED_AT
    phase = elapsed % 8
    contact = 2 <= phase < 5
    zone = ("izquierda", "centro", "derecha")[int(elapsed // 8) % 3]
    sensor.update(
        estado="en_linea",
        timestamp=datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        lecturas={
            "contacto": {"valor": contact, "unidad": None},
            "zona": {"valor": zone if contact else None, "unidad": None},
            "desplazamiento": {"valor": 2.4 if contact else 0.0, "unidad": "px"},
        },
    )
    return sensor


class PanelHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/api/sensors":
            sources = parse_qs(url.query, keep_blank_values=True).get("origen", ["simulado"])
            if sources not in (["simulado"], ["real"]):
                self.send_json(400, {"error": "origen debe ser simulado o real"})
                return
            self.send_json(200, {"version": 1, "sensors": [tactile_snapshot(sources[0])]})
        elif url.path.startswith("/api/"):
            self.send_json(404, {"error": "Ruta desconocida"})
        else:
            super().do_GET()


def main():
    parser = argparse.ArgumentParser(description="Servidor local del panel Digit 360")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    with ThreadingHTTPServer(("127.0.0.1", args.port), PanelHandler) as server:
        print(f"Panel Digit 360: http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
