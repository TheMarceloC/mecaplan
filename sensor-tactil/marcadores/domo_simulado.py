"""
Domo con marcadores simulado (lo que vería la cámara USB dentro del dedo).

Es la idea que quedó para el proyecto (estilo TacTip): un domo de silicona con
puntos oscuros en su cara interna, iluminado por dentro y visto desde abajo por
una cámara USB a 640×480. Al presionar, los marcadores cercanos al contacto se
abren hacia afuera (y se ven un poco más grandes, porque se acercan a la
cámara); si además hay arrastre, se corren en esa dirección.

Simplificaciones (no es un modelo físico de la silicona):
- Proyección plana del domo: se ignora la curvatura.
- Escala fija px→mm (PX_POR_MM), supuesta para un domo de ~40 mm visible.
- El desplazamiento es un campo suave inventado, no un cálculo de elasticidad.

Con luz_exterior=True se suma una iluminación de afuera que cambia lentamente,
como pasaría con un domo translúcido (riesgo señalado en el Avance 1).

Las imágenes salen en BGR (el orden de colores que usa OpenCV).
"""

import math
import time

import cv2
import numpy as np

ANCHO, ALTO = 640, 480
FPS = 30
CENTRO = (ANCHO / 2, ALTO / 2)
RADIO_VISTA = 220  # radio del campo visible del domo, en px
PX_POR_MM = 11.0  # supuesto: ~40 mm de domo visible en 440 px


def patron_marcadores(paso=24):
    """Marcadores en anillos concéntricos (hexagonal), como en un TacTip."""
    pts = [(0.0, 0.0)]
    anillo = 1
    while anillo * paso < RADIO_VISTA - 12:
        r = anillo * paso
        n = 6 * anillo
        for k in range(n):
            a = 2 * math.pi * k / n + (anillo % 2) * math.pi / n
            pts.append((r * math.cos(a), r * math.sin(a)))
        anillo += 1
    return np.array(pts, np.float32) + np.array(CENTRO, np.float32)


def desplazar(base, contacto):
    """Posiciones y escala de cada marcador para un contacto (o None)."""
    if not contacto or contacto["fuerza"] <= 0:
        return base.copy(), np.ones(len(base), np.float32)
    cx, cy, f = contacto["x"], contacto["y"], contacto["fuerza"]
    sx, sy = contacto.get("cizalla", (0.0, 0.0))
    sigma = 28 * (1 + 0.6 * f)  # la huella crece con la fuerza
    v = base - np.array([cx, cy], np.float32)
    r = np.hypot(v[:, 0], v[:, 1]) + 1e-6
    # Empuje radial hacia afuera, máximo a una distancia sigma del contacto.
    g = (r / sigma) * np.exp(0.5 * (1 - (r / sigma) ** 2))
    radial = (v / r[:, None]) * (12 * f * g)[:, None]
    w = np.exp(-(r**2) / (2 * (1.6 * sigma) ** 2))
    arrastre = np.outer(w * f, (sx, sy)).astype(np.float32)
    escala = 1 + 0.5 * f * np.exp(-(r**2) / (2 * sigma**2))
    return base + radial + arrastre, escala


class DomoSimulado:
    def __init__(self, luz_exterior=False, ruido=3.0, semilla=None):
        self.base = patron_marcadores()
        self.luz_exterior = luz_exterior
        self.ruido = ruido
        self.rng = np.random.default_rng(semilla)
        yy, xx = np.mgrid[0:ALTO, 0:ANCHO].astype(np.float32)
        self.xx, self.yy = xx, yy
        d = np.hypot(xx - CENTRO[0], yy - CENTRO[1]) / RADIO_VISTA
        fondo = np.where(d <= 1, 205 - 60 * d**2, 30)  # domo iluminado; afuera, carcasa oscura
        self.fondo = fondo.astype(np.uint8)

    def render(self, contacto=None, t=0.0):
        """Imagen BGR uint8 del domo con ese contacto (dict o None)."""
        img = self.fondo.copy()
        pos, escala = desplazar(self.base, contacto)
        for (x, y), s in zip(pos, escala):
            if math.hypot(x - CENTRO[0], y - CENTRO[1]) > RADIO_VISTA - 4:
                continue
            cv2.circle(img, (int(round(x * 16)), int(round(y * 16))),
                       int(round(4.2 * s * 16)), 45, -1, cv2.LINE_AA, shift=4)

        img = img.astype(np.float32)
        if self.luz_exterior:
            # Domo translúcido: entra luz de afuera (una lámpara o el sol que se
            # mueve y puede saturar) y se ve la sombra de la mano, con borde nítido.
            bx = CENTRO[0] + 160 * math.sin(t * 0.7)
            by = CENTRO[1] + 90 * math.cos(t * 0.4)
            mancha = np.exp(-((self.xx - bx) ** 2 + (self.yy - by) ** 2) / (2 * 90**2))
            img += 150 * (0.6 + 0.4 * math.sin(t * 1.3)) * mancha
            hx = CENTRO[0] + 120 * math.sin(t * 0.5)
            hy = CENTRO[1] + 60 * math.cos(t * 0.3)
            dedo = (((self.xx - hx) / 35) ** 2 + ((self.yy - hy) / 110) ** 2 <= 1)
            img -= 70 * cv2.GaussianBlur(dedo.astype(np.float32), (0, 0), 2)
        img = cv2.GaussianBlur(img, (3, 3), 0)
        img += self.rng.normal(0, self.ruido, img.shape)
        gris = np.clip(img, 0, 255).astype(np.uint8)
        return cv2.cvtColor(gris, cv2.COLOR_GRAY2BGR)


def a_mm(x, y):
    """Convierte una posición en px a mm respecto del centro del domo."""
    return ((x - CENTRO[0]) / PX_POR_MM, (y - CENTRO[1]) / PX_POR_MM)


class FuenteDomo:
    """Fuente con la misma forma de uso que una cámara: leer() -> imagen.

    Cada 4 s hay un toque de 1 s (entre 1.5 s y 2.5 s del ciclo) en un punto y
    con una fuerza al azar; a veces con arrastre. `verdad` guarda lo real.
    """

    def __init__(self, luz_exterior=False, tiempo_real=True, semilla=None):
        self.domo = DomoSimulado(luz_exterior, semilla=semilla)
        self.rng = np.random.default_rng(semilla)
        self.tiempo_real = tiempo_real
        self.t0 = time.time()
        self.t = 0.0
        self.ciclo = -1
        self.toque = None
        self.verdad = None

    def leer(self):
        if self.tiempo_real:
            time.sleep(1 / FPS)
            self.t = time.time() - self.t0
        else:
            self.t += 1 / FPS
        ciclo = int(self.t // 4)
        if ciclo != self.ciclo:
            self.ciclo = ciclo
            ang = self.rng.uniform(0, 2 * math.pi)
            rad = self.rng.uniform(0, 150)
            arrastre = (0.0, 0.0)
            if self.rng.random() < 0.4:
                a2 = self.rng.uniform(0, 2 * math.pi)
                arrastre = (6 * math.cos(a2), 6 * math.sin(a2))
            self.toque = {"x": CENTRO[0] + rad * math.cos(ang),
                          "y": CENTRO[1] + rad * math.sin(ang),
                          "fmax": self.rng.uniform(0.4, 1.0), "cizalla": arrastre}
        fase = self.t % 4
        f = math.sin((fase - 1.5) * math.pi) if 1.5 <= fase < 2.5 else 0.0
        contacto = None
        if f > 0:
            contacto = {"x": self.toque["x"], "y": self.toque["y"],
                        "fuerza": f * self.toque["fmax"], "cizalla": self.toque["cizalla"]}
        self.verdad = {"contacto": contacto is not None,
                       "mm": a_mm(self.toque["x"], self.toque["y"]) if contacto else None,
                       "fuerza": contacto["fuerza"] if contacto else 0.0}
        return self.domo.render(contacto, self.t)

    def cerrar(self):
        pass
