"""
Reproductor de una sesión integrada.

Muestra a la vez el video de la yema y, debajo, las curvas de presión,
aceleración (IMU) y micrófono, con un cursor rojo que avanza sincronizado con el
video. Así se ve, de un vistazo, cómo el toque sube la presión, agita la IMU y
suena en el micrófono en el mismo instante en que aparece la huella.

Uso:
    python reproductor.py                       # reproduce la última sesión
    python reproductor.py --carpeta data/sesiones_integradas/XX␣
    python reproductor.py --guardar-frame 0.6   # sin ventana: guarda un cuadro

Cerrar la ventana con la tecla Q.
"""

import argparse
import csv
import glob
import os
import time
import wave

import cv2
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

AQUI = os.path.dirname(__file__)


def ultima_sesion():
    carpetas = sorted(glob.glob(os.path.join(AQUI, "data", "sesiones_integradas", "*")))
    if not carpetas:
        raise SystemExit("No hay sesiones. Graba una con: python sesion_integrada.py")
    return carpetas[-1]


def _leer_csv(ruta, col):
    with open(ruta, encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    t = np.array([float(x["ts_ms"]) for x in filas]) / 1000.0
    return t, np.array([float(x[col]) for x in filas])


def cargar(carpeta):
    datos = {}
    tp, pv = _leer_csv(os.path.join(carpeta, "presion.csv"), "presion_kpa")
    datos["presion"] = (tp, pv)

    with open(os.path.join(carpeta, "imu.csv"), encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    ti = np.array([float(x["ts_ms"]) for x in filas]) / 1000.0
    mag = np.sqrt(sum(np.array([float(x[c]) for x in filas]) ** 2 for c in ("ax", "ay", "az")))
    datos["accel"] = (ti, mag)

    w = wave.open(os.path.join(carpeta, "audio.wav"))
    muestras = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    fs = w.getframerate(); w.close()
    # Envolvente del audio para dibujarlo compacto (máximo por tramo).
    cubos = max(1, len(muestras) // 600)
    env = np.abs(muestras[: cubos * (len(muestras) // cubos)]).reshape(-1, cubos).max(1)
    datos["audio"] = (np.linspace(0, len(muestras) / fs, len(env)), env)

    cap = cv2.VideoCapture(os.path.join(carpeta, "video.avi"))
    datos["fps"] = cap.get(cv2.CAP_PROP_FPS) or 30
    datos["nframes"] = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    datos["ancho"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    cap.release()
    datos["duracion"] = datos["nframes"] / datos["fps"]
    return datos


def render_panel(datos, alto=180):
    ancho = datos["ancho"]
    bandas = [("Presion (kPa)", *datos["presion"], "#0f49b6"),
              ("|Aceleracion|", *datos["accel"], "#03aed2"),
              ("Microfono", *datos["audio"], "#05065c")]
    fig = plt.figure(figsize=(ancho / 100, alto / 100), dpi=100)
    n = len(bandas)
    for i, (titulo, tx, ty, color) in enumerate(bandas):
        ax = fig.add_axes([0, 1 - (i + 1) / n, 1, 1 / n])
        ax.plot(tx, ty, color=color, lw=1)
        ax.set_xlim(0, datos["duracion"])
        ax.axis("off")
        ax.text(0.01, 0.78, titulo, transform=ax.transAxes, fontsize=8, color="#333")
    fig.canvas.draw()
    panel = np.asarray(fig.canvas.buffer_rgba())[..., :3]
    plt.close(fig)
    return cv2.cvtColor(panel, cv2.COLOR_RGB2BGR)


def componer(frame, panel, t, duracion):
    """Pone el cursor en el panel y lo apila debajo del video (mismo ancho)."""
    p = panel.copy()
    x = int(t / duracion * p.shape[1]) if duracion else 0
    cv2.line(p, (x, 0), (x, p.shape[0]), (0, 0, 255), 1)
    if frame.shape[1] != p.shape[1]:
        frame = cv2.resize(frame, (p.shape[1], frame.shape[0]))
    return np.vstack([frame, p])


def main():
    ap = argparse.ArgumentParser(description="Reproductor de una sesión integrada")
    ap.add_argument("--carpeta", help="Carpeta de la sesión (por defecto, la última)")
    ap.add_argument("--guardar-frame", type=float, default=None,
                    help="Sin ventana: guarda el cuadro compuesto en ese segundo")
    args = ap.parse_args()

    carpeta = args.carpeta or ultima_sesion()
    datos = cargar(carpeta)
    panel = render_panel(datos)
    cap = cv2.VideoCapture(os.path.join(carpeta, "video.avi"))

    if args.guardar_frame is not None:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(args.guardar_frame * datos["fps"]))
        ok, frame = cap.read(); cap.release()
        if not ok:
            raise SystemExit("No se pudo leer ese cuadro.")
        salida = os.path.join(AQUI, "compuesto.png")
        cv2.imwrite(salida, componer(frame, panel, args.guardar_frame, datos["duracion"]))
        print(f"Guardado {salida}")
        return

    print(f"Reproduciendo {os.path.basename(carpeta)}. Cierra con la tecla Q.")
    espera = 1.0 / datos["fps"]
    while True:
        ok, frame = cap.read()
        if not ok:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # vuelve a empezar
            continue
        t = cap.get(cv2.CAP_PROP_POS_FRAMES) / datos["fps"]
        cv2.imshow("Sesión integrada (video + sensores)", componer(frame, panel, t, datos["duracion"]))
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
        time.sleep(espera)
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
