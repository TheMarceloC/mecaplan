"""
Demostración de la yema táctil: cámara simulada + detección de contacto en vivo.

Muestra tres paneles: la imagen del gel, la diferencia contra la referencia, y
la imagen con el contacto marcado (círculo + datos). Toma la referencia con los
primeros fotogramas (sin contacto).

Uso (simulado, sin hardware):
    python demo_contacto.py
    python demo_contacto.py --forma borde
    python demo_contacto.py --forma puntos

Con la cámara real (USB), el día que exista:
    python demo_contacto.py --camara 0

Cerrar con la tecla Q sobre la ventana.
"""

import argparse

import cv2
import numpy as np

from camara_simulada import FORMAS, FuenteCamara, FuenteSimulada
from deteccion_contacto import DetectorContacto


def dibujar(imagen, resultado):
    salida = imagen.copy()
    if resultado["contacto"] and resultado["centro"]:
        cx, cy = (int(v) for v in resultado["centro"])
        radio = int(max(8, (resultado["area"] / np.pi) ** 0.5))
        cv2.circle(salida, (cx, cy), radio, (0, 0, 255), 2)
        cv2.circle(salida, (cx, cy), 3, (0, 0, 255), -1)
    estado = "CONTACTO" if resultado["contacto"] else "sin contacto"
    cv2.putText(salida, f"{estado}  area={resultado['area']}  "
                f"fuerza={resultado['fuerza']:.1f}", (8, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return salida


def panel_diferencia(resultado):
    dif = np.clip(resultado["diferencia"], 0, 60) / 60 * 255
    return cv2.applyColorMap(dif.astype(np.uint8), cv2.COLORMAP_INFERNO)


def main():
    ap = argparse.ArgumentParser(description="Demo de contacto en la yema táctil")
    ap.add_argument("--forma", default="esfera", choices=FORMAS,
                    help="Forma del contacto simulado")
    ap.add_argument("--camara", type=int, default=None,
                    help="Índice de la cámara USB real en vez del simulador")
    args = ap.parse_args()

    fuente = (FuenteCamara(args.camara) if args.camara is not None
              else FuenteSimulada(forma=args.forma))
    detector = DetectorContacto()

    print("Tomando la imagen de referencia (no toques el gel)…")
    for _ in range(10):
        imagen = fuente.leer()
    detector.fijar_referencia(imagen)
    print("Listo. Ventana abierta; cierra con la tecla Q.")

    try:
        while True:
            imagen = fuente.leer()
            if imagen is None:
                break
            resultado = detector.detectar(imagen)
            tablero = np.hstack([
                imagen,
                panel_diferencia(resultado),
                dibujar(imagen, resultado),
            ])
            cv2.imshow("Gel  |  diferencia  |  contacto", tablero)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        fuente.cerrar()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
