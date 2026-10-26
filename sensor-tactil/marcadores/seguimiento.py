"""
Seguimiento de marcadores: de la imagen del domo al contacto.

Pasos en cada cuadro:
  1. Detectar los marcadores (puntos oscuros) y quedarse con sus centros.
  2. Emparejar cada marcador con su posición del cuadro anterior (se mueven
     poco entre cuadros a 30 fps, así que no se confunden con los vecinos).
  3. Desplazamiento = posición actual − posición de referencia (sin contacto).
  4. Del campo de desplazamientos sacar: contacto sí/no, ubicación (px y mm),
     zona (izquierda/centro/derecha), fuerza relativa y cizalla.

Funciona igual con el domo simulado y con la cámara real. Para detectar usa
"fondo local − imagen", que tolera cambios lentos de iluminación.

La "fuerza" es RELATIVA (desplazamiento medio en px). Para reportarla en
newtons hay que calibrar con pesas.
"""

import cv2
import numpy as np

from domo_simulado import CENTRO, PX_POR_MM, RADIO_VISTA


class SeguidorMarcadores:
    def __init__(self, umbral=25, area_min=8, area_max=600, umbral_contacto=1.6):
        self.umbral = umbral
        self.area_min = area_min
        self.area_max = area_max
        self.umbral_contacto = umbral_contacto  # px de desplazamiento máximo
        self.ref = None
        self.pos = None
        self.radio_busqueda = 10.0

    def detectar(self, imagen_bgr) -> np.ndarray:
        """Centros (N×2, en px) de los marcadores visibles."""
        gris = cv2.cvtColor(imagen_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        fondo = cv2.GaussianBlur(gris, (0, 0), 9)
        mascara = ((fondo - gris) > self.umbral).astype(np.uint8)
        _, _, stats, centros = cv2.connectedComponentsWithStats(mascara)
        area = stats[1:, cv2.CC_STAT_AREA]
        ok = (area >= self.area_min) & (area <= self.area_max)
        return centros[1:][ok].astype(np.float32)

    def fijar_referencia(self, imagen_bgr) -> int:
        """Guarda las posiciones sin contacto. Devuelve cuántos marcadores vio."""
        self.ref = self.detectar(imagen_bgr)
        self.pos = self.ref.copy()
        if len(self.ref) > 1:
            d = np.linalg.norm(self.ref[:, None] - self.ref[None], axis=2)
            np.fill_diagonal(d, np.inf)
            self.radio_busqueda = 0.45 * float(np.median(d.min(1)))
        return len(self.ref)

    def actualizar(self, imagen_bgr) -> dict:
        if self.ref is None:
            raise RuntimeError("Primero hay que fijar la referencia (sin contacto).")
        det = self.detectar(imagen_bgr)
        if len(det):
            d = np.linalg.norm(self.pos[:, None] - det[None], axis=2)
            j = d.argmin(1)
            cerca = d[np.arange(len(self.pos)), j] < self.radio_busqueda
            self.pos[cerca] = det[j[cerca]]  # los que no aparecen conservan su posición

        desp = self.pos - self.ref
        mag = np.hypot(desp[:, 0], desp[:, 1])
        peso = np.where(mag > 0.6, mag, 0.0)  # ignora el ruido de la detección
        contacto = mag.max() > self.umbral_contacto and int((mag > 1.0).sum()) >= 3

        res = {"contacto": bool(contacto), "ref": self.ref, "pos": self.pos.copy(),
               "desp": desp, "mag": mag, "n_marcadores": len(self.ref),
               "fuerza_rel": float(mag.mean()), "centro_px": None, "centro_mm": None,
               "zona": None, "cizalla_px": (0.0, 0.0)}
        if contacto:
            cx, cy = (self.ref * peso[:, None]).sum(0) / peso.sum()
            res["centro_px"] = (float(cx), float(cy))
            res["centro_mm"] = ((cx - CENTRO[0]) / PX_POR_MM, (cy - CENTRO[1]) / PX_POR_MM)
            res["zona"] = zona_de(cx)
            # El empuje radial se cancela al promediar; lo que queda es el arrastre.
            res["cizalla_px"] = tuple((desp * peso[:, None]).sum(0) / peso.sum())
        return res


def zona_de(x):
    """Tres franjas verticales del campo visible: izquierda, centro y derecha."""
    franja = RADIO_VISTA / 3
    if x < CENTRO[0] - franja:
        return "izquierda"
    if x > CENTRO[0] + franja:
        return "derecha"
    return "centro"
