"""
Cámara táctil simulada (imágenes falsas de la yema, estilo Digit/GelSight).

Imita lo que verá la cámara dentro del sensor: el gel iluminado por tres LEDs
(rojo, verde y azul) desde los bordes. Cuando algo lo presiona, la superficie se
hunde, cambian sus inclinaciones y cada LED la ilumina distinto: eso produce la
"huella" de colores que después detectamos.

Cada 4 segundos hay un toque de 1 s (entre 1.5 s y 2.5 s del ciclo), y el objeto
se desliza un poco. Los primeros instantes no tienen contacto, para que se pueda
tomar la imagen de referencia.

Formas de contacto: "esfera" (yema de un dedo o una bolita), "borde" (arista de
una pieza) y "puntos" (tres puntas pequeñas, como una textura).

Las imágenes salen en BGR (el orden de colores que usa OpenCV).
"""

import math
import time

import numpy as np

ALTO, ANCHO = 240, 320
FPS = 30
FORMAS = ("esfera", "borde", "puntos")

# Ángulos de los tres LEDs alrededor de la yema (rojo, verde, azul).
_ANGULOS_LED = (90, 210, 330)
_GANANCIA_SOMBRA = 180.0  # cuánto cambia el brillo con la inclinación del gel


class GelSimulado:
    def __init__(self, forma="esfera", ruido=2.0, semilla=None):
        if forma not in FORMAS:
            raise ValueError(f"Forma desconocida: {forma}. Usa una de {FORMAS}.")
        self.forma = forma
        self.ruido = ruido
        self.rng = np.random.default_rng(semilla)
        self.yy, self.xx = np.mgrid[0:ALTO, 0:ANCHO].astype(np.float32)

        self.luces = []
        fondo = []
        for grados in _ANGULOS_LED:
            a = math.radians(grados)
            luz = np.array([math.cos(a), math.sin(a), 0.9])
            self.luces.append(luz / np.linalg.norm(luz))
            # Cada color es más brillante del lado de su LED.
            proyeccion = (
                (self.xx - ANCHO / 2) * math.cos(a) + (self.yy - ALTO / 2) * math.sin(a)
            ) / (ANCHO / 2)
            fondo.append(110 + 35 * proyeccion)
        self.fondo = np.stack(fondo, axis=-1)  # orden R, G, B

    def _hundimiento(self, t):
        """Mapa de hundimiento del gel y la verdad del contacto en el instante t."""
        ciclo = t % 4.0
        if not 1.5 <= ciclo < 2.5:
            return None, {"contacto": False, "centro": None, "fuerza": 0.0}

        fuerza = math.sin((ciclo - 1.5) * math.pi)  # 0 → 1 → 0
        cx = ANCHO / 2 + 60 * math.sin(t * 0.7)  # el objeto se desliza
        cy = ALTO / 2 + 30 * math.cos(t * 0.5)
        dx, dy = self.xx - cx, self.yy - cy

        if self.forma == "esfera":
            h = np.exp(-(dx**2 + dy**2) / (2 * 26**2))
        elif self.forma == "borde":
            # Arista inclinada: angosta en un sentido, larga en el otro.
            a = math.radians(30)
            perp = -dx * math.sin(a) + dy * math.cos(a)
            par = dx * math.cos(a) + dy * math.sin(a)
            h = np.exp(-(perp**2) / (2 * 5**2)) * np.exp(-(par**2) / (2 * 55**2))
        else:  # puntos
            h = np.zeros_like(self.xx)
            for ox, oy in ((-25, -12), (22, -15), (0, 20)):
                h += np.exp(-((dx - ox) ** 2 + (dy - oy) ** 2) / (2 * 6**2))

        verdad = {"contacto": True, "centro": (cx, cy), "fuerza": fuerza}
        return 14.0 * fuerza * h, verdad

    def render(self, h):
        """Convierte un mapa de hundimiento `h` (o None) en imagen BGR uint8.

        Es la iluminación del gel por los tres LEDs; la usan tanto el toque del
        ciclo como los materiales (ver materiales.py).
        """
        rgb = self.fondo.copy()
        if h is not None:
            gy, gx = np.gradient(h)
            norma = np.sqrt(gx**2 + gy**2 + 1)
            nx, ny, nz = -gx / norma, -gy / norma, 1 / norma
            for c, luz in enumerate(self.luces):
                # Cambio de brillo respecto al gel plano (que sería la referencia).
                rgb[..., c] += _GANANCIA_SOMBRA * (
                    nx * luz[0] + ny * luz[1] + nz * luz[2] - luz[2]
                )
        rgb += self.rng.normal(0, self.ruido, rgb.shape)
        bgr = np.clip(rgb, 0, 255).astype(np.uint8)[..., ::-1]
        return np.ascontiguousarray(bgr)

    def imagen(self, t):
        """Devuelve (imagen BGR uint8, verdad del contacto) para el instante t."""
        h, verdad = self._hundimiento(t)
        return self.render(h), verdad


class FuenteSimulada:
    """Fuente de imágenes con la misma forma de uso que una cámara: leer() -> imagen.

    Con tiempo_real=False avanza 1/FPS por lectura, sin esperar (útil en pruebas).
    """

    def __init__(self, forma="esfera", tiempo_real=True, semilla=None):
        self.gel = GelSimulado(forma, semilla=semilla)
        self.tiempo_real = tiempo_real
        self.t0 = time.time()
        self.t = 0.0
        self.verdad = None

    def leer(self):
        if self.tiempo_real:
            time.sleep(1 / FPS)
            self.t = time.time() - self.t0
        else:
            self.t += 1 / FPS
        img, self.verdad = self.gel.imagen(self.t)
        return img

    def cerrar(self):
        pass


class FuenteCamara:
    """La cámara real (USB): mismo uso que la simulada."""

    def __init__(self, indice=0):
        import cv2

        self.cap = cv2.VideoCapture(indice)
        if not self.cap.isOpened():
            raise RuntimeError(f"No se pudo abrir la cámara {indice}.")
        self.verdad = None  # con la cámara real no hay "verdad" conocida

    def leer(self):
        ok, img = self.cap.read()
        return img if ok else None

    def cerrar(self):
        self.cap.release()
