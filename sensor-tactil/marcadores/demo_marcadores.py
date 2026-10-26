"""
Demo en vivo del domo con marcadores.

Muestra la imagen del domo con flechas que indican cuánto y hacia dónde se movió
cada marcador, y un panel con: contacto, zona, ubicación en mm, fuerza relativa
y cizalla. Toma la referencia con los primeros cuadros (sin contacto).

Uso (simulado, sin hardware):
    python demo_marcadores.py
    python demo_marcadores.py --luz-exterior      # domo translúcido con luz de afuera

Con la cámara USB real, el día que exista:
    python demo_marcadores.py --camara 0

Teclas: Q cierra, R vuelve a tomar la referencia (sin tocar el domo).
Con --frame 2.0 guarda un cuadro en ese segundo sin abrir ventana.
"""

import argparse
import math
import os

import cv2
import numpy as np

from domo_simulado import ALTO, FuenteDomo
from seguimiento import SeguidorMarcadores

AQUI = os.path.dirname(__file__)
BLANCO, GRIS, VERDE = (235, 235, 235), (140, 140, 140), (90, 200, 90)


class FuenteCamara:
    def __init__(self, indice):
        self.cap = cv2.VideoCapture(indice)
        if not self.cap.isOpened():
            raise SystemExit(f"No se pudo abrir la cámara {indice}.")
        self.verdad = None

    def leer(self):
        ok, img = self.cap.read()
        return img if ok else None

    def cerrar(self):
        self.cap.release()


def dibujar(imagen, res, verdad):
    vista = imagen.copy()
    for (x, y), (dx, dy), m in zip(res["ref"], res["desp"], res["mag"]):
        if m > 0.8:
            fin = (int(x + dx * 3), int(y + dy * 3))  # flechas ×3 para que se vean
            cv2.arrowedLine(vista, (int(x), int(y)), fin, (0, 140, 255), 1,
                            cv2.LINE_AA, tipLength=0.35)
    if res["contacto"]:
        cx, cy = (int(v) for v in res["centro_px"])
        cv2.drawMarker(vista, (cx, cy), (0, 0, 255), cv2.MARKER_CROSS, 22, 2)

    panel = np.full((ALTO, 270, 3), (34, 32, 30), np.uint8)

    def texto(t, y, color=GRIS, escala=0.5, grosor=1):
        cv2.putText(panel, t, (14, y), cv2.FONT_HERSHEY_SIMPLEX, escala, color,
                    grosor, cv2.LINE_AA)

    texto("DOMO CON MARCADORES", 32, BLANCO, 0.55, 2)
    texto("CONTACTO" if res["contacto"] else "sin contacto", 72,
          VERDE if res["contacto"] else GRIS, 0.6, 2)
    texto(f"marcadores: {res['n_marcadores']}", 104)
    if res["contacto"]:
        mx, my = res["centro_mm"]
        sx, sy = res["cizalla_px"]
        texto("Zona:", 146)
        texto(res["zona"].upper(), 178, BLANCO, 0.8, 2)
        texto(f"ubicacion: {mx:+.1f}, {my:+.1f} mm", 214)
        texto(f"fuerza relativa: {res['fuerza_rel']:.2f} px", 240)
        texto(f"cizalla: {math.hypot(sx, sy):.1f} px", 266)
    if verdad and verdad["contacto"]:
        vx, vy = verdad["mm"]
        texto(f"(real: {vx:+.1f}, {vy:+.1f} mm)", 300)
    texto("Q: salir   R: referencia", ALTO - 18)
    return np.hstack([vista, panel])


def main():
    ap = argparse.ArgumentParser(description="Demo del domo con marcadores")
    ap.add_argument("--camara", type=int, default=None, help="Índice de la cámara USB real")
    ap.add_argument("--luz-exterior", action="store_true",
                    help="Simula luz de afuera entrando por un domo translúcido")
    ap.add_argument("--frame", type=float, default=None,
                    help="Sin ventana: guarda un cuadro en ese segundo")
    args = ap.parse_args()

    simulado = args.camara is None
    if args.frame is not None and not simulado:
        raise SystemExit("--frame solo funciona con el domo simulado.")
    fuente = (FuenteDomo(args.luz_exterior, tiempo_real=args.frame is None, semilla=5)
              if simulado else FuenteCamara(args.camara))
    seguidor = SeguidorMarcadores()
    for _ in range(5):
        imagen = fuente.leer()
    print(f"Referencia tomada: {seguidor.fijar_referencia(imagen)} marcadores.")

    while True:
        imagen = fuente.leer()
        if imagen is None:
            break
        res = seguidor.actualizar(imagen)
        tablero = dibujar(imagen, res, fuente.verdad)

        if args.frame is not None:
            if fuente.t >= args.frame:
                salida = os.path.join(AQUI, "demo_marcadores.png")
                cv2.imwrite(salida, tablero)
                print(f"Guardado {salida}")
                break
            continue

        cv2.imshow("Domo con marcadores", tablero)
        tecla = cv2.waitKey(1) & 0xFF
        if tecla == ord("q"):
            break
        if tecla == ord("r"):
            print(f"Nueva referencia: {seguidor.fijar_referencia(imagen)} marcadores.")
    fuente.cerrar()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
