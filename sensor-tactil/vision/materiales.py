"""
Materiales simulados: cada uno deja una huella distinta en el gel.

Sirve para armar y probar TODO el flujo de la IA (dataset + entrenamiento +
clasificación) sin la placa ni el gel. Cuando existan datos reales, se cambia la
fuente de imágenes y el resto del flujo queda igual.

Materiales y su marca característica:
  - liso    : una huella suave y redonda (plástico, vidrio).
  - rugoso  : muchas puntas pequeñas regadas (lija, piedra).
  - filo    : una línea alargada (arista de metal).
  - tela    : una cuadrícula fina de bultos (tejido).
  - blando  : una huella grande y tenue, poca fuerza (espuma).

Son marcas INVENTADAS para desarrollar el software; no son medidas reales.
"""

import numpy as np

from camara_simulada import ALTO, ANCHO, GelSimulado

MATERIALES = ("liso", "rugoso", "filo", "tela", "blando")


def _mapa_hundimiento(nombre, rng):
    yy, xx = np.mgrid[0:ALTO, 0:ANCHO].astype(np.float32)
    cx = ANCHO / 2 + rng.uniform(-50, 50)
    cy = ALTO / 2 + rng.uniform(-35, 35)
    dx, dy = xx - cx, yy - cy
    h = np.zeros_like(xx)

    if nombre == "liso":
        r = rng.uniform(22, 32)
        h = np.exp(-(dx**2 + dy**2) / (2 * r**2)) * rng.uniform(12, 16)

    elif nombre == "rugoso":
        for _ in range(rng.integers(18, 30)):
            ox, oy = rng.uniform(-30, 30), rng.uniform(-30, 30)
            h += np.exp(-((dx - ox) ** 2 + (dy - oy) ** 2) / (2 * 3.0**2))
        h *= rng.uniform(8, 12)

    elif nombre == "filo":
        a = rng.uniform(0, np.pi)
        perp = -dx * np.sin(a) + dy * np.cos(a)
        par = dx * np.cos(a) + dy * np.sin(a)
        h = np.exp(-(perp**2) / (2 * 4.5**2)) * np.exp(-(par**2) / (2 * 50**2))
        h *= rng.uniform(13, 17)

    elif nombre == "tela":
        paso = rng.uniform(10, 14)
        trama = (np.cos(dx / paso * 2 * np.pi) * np.cos(dy / paso * 2 * np.pi)) ** 2
        ventana = np.exp(-(dx**2 + dy**2) / (2 * 34**2))
        h = trama * ventana * rng.uniform(6, 9)

    elif nombre == "blando":
        r = rng.uniform(45, 60)
        h = np.exp(-(dx**2 + dy**2) / (2 * r**2)) * rng.uniform(5, 7)

    return h


def imagen_material(nombre, gel=None, rng=None):
    """Devuelve una imagen BGR del gel tocado por ese material."""
    if nombre not in MATERIALES:
        raise ValueError(f"Material desconocido: {nombre}. Usa uno de {MATERIALES}.")
    rng = rng or np.random.default_rng()
    gel = gel or GelSimulado(ruido=2.0)
    return gel.render(_mapa_hundimiento(nombre, rng))
