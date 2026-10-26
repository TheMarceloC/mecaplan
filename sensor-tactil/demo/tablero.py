"""
Tablero de demostración del sensor táctil (todo en una pantalla).

Junta en vivo lo que hicimos por separado:
  - la yema de la cámara con el contacto marcado,
  - el material reconocido (IA por imagen), en grande,
  - las curvas de presión, aceleración (IMU) y micrófono.

Cada ~4 s toca un material al azar; en el pico del toque la IA lo reconoce.
Es simulado (sin placa ni cámara). Pensado para la presentación del Avance.

Antes de usarlo, entrenar el modelo una vez:
    python ../vision/clasificador.py --entrenar

Luego:
    python tablero.py

Cerrar con la tecla Q.
"""

import argparse
import collections
import math
import os
import sys
import time

import cv2
import numpy as np

AQUI = os.path.dirname(__file__)
VISION = os.path.join(os.path.dirname(AQUI), "vision")
sys.path.insert(0, VISION)

from camara_simulada import ALTO, ANCHO, GelSimulado  # noqa: E402
from clasificador import MODELO, cargar_modelo, extraer_rasgos  # noqa: E402
from deteccion_contacto import DetectorContacto  # noqa: E402
from materiales import MATERIALES, _mapa_hundimiento  # noqa: E402

FONDO = (34, 32, 30)
BLANCO = (235, 235, 235)
GRIS = (120, 120, 120)
VERDE = (90, 200, 90)
# Qué tan "fuerte" suena cada material (para el nivel del micrófono, 0–1).
SONORIDAD = {"liso": 0.55, "rugoso": 0.75, "filo": 1.0, "tela": 0.4, "blando": 0.3}


def fuerza_en(t):
    ciclo = t % 4.0
    return math.sin(ciclo * math.pi) if ciclo < 1.0 else 0.0


def dibujar_curva(lienzo, x, y, w, h, vals, vmin, vmax, color, titulo, cap):
    cv2.rectangle(lienzo, (x, y), (x + w, y + h), (55, 52, 50), 1)
    cv2.putText(lienzo, titulo, (x + 6, y + 16), cv2.FONT_HERSHEY_SIMPLEX,
                0.45, GRIS, 1, cv2.LINE_AA)
    if len(vals) < 2:
        return
    v = np.clip(np.array(vals, dtype=np.float32), vmin, vmax)
    xs = x + np.arange(len(v)) / (cap - 1) * w
    ys = y + h - (v - vmin) / (vmax - vmin) * h
    pts = np.stack([xs, ys], 1).astype(np.int32)
    cv2.polylines(lienzo, [pts], False, color, 1, cv2.LINE_AA)


def correr(guardar_en=None, semilla=None):
    if not os.path.exists(MODELO):
        raise SystemExit("Falta el modelo. Entrena antes: "
                         "python ../vision/clasificador.py --entrenar")
    datos = cargar_modelo()
    modelo, materiales = datos["modelo"], datos["materiales"]

    rng = np.random.default_rng(semilla)
    gel = GelSimulado(ruido=2.0)
    # Umbral más bajo que por defecto, para captar también toques tenues (blando, tela).
    detector = DetectorContacto(umbral=12, area_minima=40)
    detector.fijar_referencia(gel.render(None))

    cap = 150  # muestras visibles en las curvas (~5 s)
    pres = collections.deque(maxlen=cap)
    acc = collections.deque(maxlen=cap)
    mic = collections.deque(maxlen=cap)

    ciclo_actual = -1
    material_real = "—"
    predicho = "—"
    base = np.zeros((ALTO, ANCHO), np.float32)
    t0 = time.time()
    t = 0.0
    if guardar_en is None:
        print("Tablero abierto; cierra con la tecla Q.")

    while True:
        t = (t + 1 / 30) if guardar_en is not None else (time.time() - t0)
        ciclo = int(t // 4)
        if ciclo != ciclo_actual:  # nuevo toque: elige material y reinicia
            ciclo_actual = ciclo
            material_real = str(rng.choice(MATERIALES))
            base = _mapa_hundimiento(material_real, rng)
            predicho = "—"

        f = fuerza_en(t)
        imagen = gel.render(f * base) if f > 0 else gel.render(None)
        res = detector.detectar(imagen)

        if f > 0.6 and predicho == "—":  # en el pico, la IA reconoce
            predicho = materiales[int(modelo.predict(extraer_rasgos(res)[None])[0])]

        pres.append(101.3 + f * 8.0 + rng.normal(0, 0.05))
        acc.append(9.81 + f * 0.5 + abs(rng.normal(0, 0.05 + f * 0.3)))
        mic.append(f * SONORIDAD[material_real] + abs(rng.normal(0, 0.03)))

        # --- Lienzo ---
        lienzo = np.full((585, 760, 3), FONDO, np.uint8)

        vista = imagen.copy()
        if res["contacto"] and res["centro"]:
            cx, cy = (int(v) for v in res["centro"])
            cv2.circle(vista, (cx, cy), int(max(8, (res["area"] / math.pi) ** 0.5)),
                       (0, 0, 255), 2)
        lienzo[10:10 + ALTO, 10:10 + ANCHO] = vista
        cv2.rectangle(lienzo, (10, 10), (10 + ANCHO, 10 + ALTO), (80, 76, 72), 1)

        # Panel de información
        px = 350
        cv2.putText(lienzo, "SENSOR TACTIL - demo", (px, 36),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, BLANCO, 2, cv2.LINE_AA)
        estado = "CONTACTO" if res["contacto"] else "sin contacto"
        cv2.putText(lienzo, estado, (px, 78), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    VERDE if res["contacto"] else GRIS, 2, cv2.LINE_AA)
        cv2.putText(lienzo, "Material (IA):", (px, 130),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, GRIS, 1, cv2.LINE_AA)
        acierto = predicho == material_real and predicho != "—"
        cv2.putText(lienzo, predicho.upper(), (px, 172), cv2.FONT_HERSHEY_SIMPLEX,
                    1.1, VERDE if acierto else BLANCO, 3, cv2.LINE_AA)
        cv2.putText(lienzo, f"(real: {material_real})", (px, 205),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, GRIS, 1, cv2.LINE_AA)
        cv2.putText(lienzo, f"area: {res['area']:5d}   fuerza: {res['fuerza']:.1f}",
                    (px, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.5, GRIS, 1, cv2.LINE_AA)

        # Curvas
        dibujar_curva(lienzo, 10, 270, 740, 95, pres, 100, 112, (246, 148, 15),
                      "Presion (kPa)", cap)
        dibujar_curva(lienzo, 10, 378, 740, 95, acc, 9, 12, (210, 174, 3),
                      "|Aceleracion| (m/s2)", cap)
        dibujar_curva(lienzo, 10, 486, 740, 95, mic, 0, 1, (92, 6, 5),
                      "Nivel microfono", cap)

        if guardar_en is not None:
            if t >= guardar_en:
                salida = os.path.join(AQUI, "tablero.png")
                cv2.imwrite(salida, lienzo)
                print(f"Guardado {salida}")
                return
            continue

        cv2.imshow("Tablero del sensor tactil", lienzo)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
        time.sleep(1 / 30)
    cv2.destroyAllWindows()


def main():
    ap = argparse.ArgumentParser(description="Tablero de demostración del sensor")
    ap.add_argument("--frame", type=float, default=None,
                    help="Sin ventana: guarda un cuadro del tablero en ese segundo")
    args = ap.parse_args()
    correr(guardar_en=args.frame, semilla=1 if args.frame is not None else None)


if __name__ == "__main__":
    main()
