"""
Detección de contacto en la yema táctil.

La idea es la misma del Digit/GelSight: se guarda una imagen de REFERENCIA del
gel sin tocar, y a cada fotograma se le resta. Donde hay contacto, la diferencia
crece; el resto queda cerca de cero. Con eso se saca:

  - si hay contacto o no,
  - el área tocada (en píxeles),
  - el centro del contacto,
  - una "fuerza" aproximada (qué tan fuerte cambió la imagen).

No necesita la placa ni el gel real: funciona con la cámara simulada y, el día
que exista, con la cámara de verdad (sin cambiar nada).
"""

import numpy as np


class DetectorContacto:
    def __init__(self, umbral=18.0, area_minima=60):
        self.referencia = None  # imagen del gel en reposo (float32, escala de grises)
        self.umbral = umbral
        self.area_minima = area_minima

    def fijar_referencia(self, imagen_bgr) -> None:
        """Guarda el gel en reposo. Llamar con unas imágenes SIN contacto."""
        self.referencia = _gris(imagen_bgr)

    def detectar(self, imagen_bgr) -> dict:
        if self.referencia is None:
            raise RuntimeError("Primero hay que fijar la imagen de referencia.")
        gris = _gris(imagen_bgr)
        diferencia = np.abs(gris - self.referencia)
        mascara = diferencia > self.umbral
        area = int(mascara.sum())

        if area < self.area_minima:
            return {"contacto": False, "area": area, "centro": None,
                    "fuerza": 0.0, "mascara": mascara, "diferencia": diferencia}

        ys, xs = np.nonzero(mascara)
        centro = (float(xs.mean()), float(ys.mean()))
        # "Fuerza" aproximada: cuánto cambió la imagen en la zona tocada.
        fuerza = float(diferencia[mascara].mean())
        return {"contacto": True, "area": area, "centro": centro,
                "fuerza": fuerza, "mascara": mascara, "diferencia": diferencia}


def _gris(imagen_bgr) -> np.ndarray:
    """Pasa a escala de grises en float32, con o sin OpenCV."""
    arr = np.asarray(imagen_bgr, dtype=np.float32)
    if arr.ndim == 2:
        return arr
    # Pesos BGR estándar (OpenCV usa orden B, G, R).
    return arr[..., 0] * 0.114 + arr[..., 1] * 0.587 + arr[..., 2] * 0.299
