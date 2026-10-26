"""
Pruebas de aceptación del domo con marcadores, corridas en simulación.

Replica las metas propuestas en el Avance 1 y en la propuesta de evaluación:
  A. Contacto: ≥ 18 aciertos de 20 toques, y sin falsas detecciones en reposo.
  B. Zonas: ≥ 8 de 10 por zona (izquierda, centro, derecha).
  C. Ubicación: error medio y máximo en mm (meta del Avance 1: ≤ 3 mm).
  D. Carga: el desplazamiento crece con la fuerza (como con pesas de 100, 200 y 500 g).
Todo se repite con luz exterior (domo translúcido) para ver si afecta.

IMPORTANTE: pasa en simulación no significa que pase con el domo real. Sirve
para probar el SOFTWARE y dejar listo el procedimiento de prueba.

Uso:
    python evaluar.py
"""

import math

import numpy as np

from domo_simulado import CENTRO, DomoSimulado, a_mm
from seguimiento import SeguidorMarcadores

PASOS_SUBIDA = 15  # cuadros para llegar a la fuerza máxima (0.5 s a 30 fps)


def presionar(domo, seguidor, x, y, fmax, t, cizalla=(0.0, 0.0)):
    """Sube y baja la fuerza en (x, y). Devuelve el resultado en el pico."""
    pico = None
    for k in range(1, 2 * PASOS_SUBIDA + 1):
        f = fmax * math.sin(math.pi * k / (2 * PASOS_SUBIDA))
        t += 1 / 30
        res = seguidor.actualizar(domo.render(
            {"x": x, "y": y, "fuerza": f, "cizalla": cizalla}, t))
        if k == PASOS_SUBIDA:
            pico = res
    for _ in range(10):  # reposo entre toques
        t += 1 / 30
        seguidor.actualizar(domo.render(None, t))
    return pico, t


def preparar(luz_exterior, semilla):
    domo = DomoSimulado(luz_exterior, semilla=semilla)
    seguidor = SeguidorMarcadores()
    seguidor.fijar_referencia(domo.render(None, 0.0))
    return domo, seguidor


def prueba_contacto(luz, rng):
    domo, seg = preparar(luz, 1)
    t, aciertos, errores = 0.0, 0, []
    for _ in range(20):
        ang, rad = rng.uniform(0, 2 * math.pi), rng.uniform(0, 150)
        x, y = CENTRO[0] + rad * math.cos(ang), CENTRO[1] + rad * math.sin(ang)
        res, t = presionar(domo, seg, x, y, rng.uniform(0.3, 1.0), t)
        if res["contacto"]:
            aciertos += 1
            rx, ry = a_mm(x, y)
            errores.append(math.hypot(res["centro_mm"][0] - rx, res["centro_mm"][1] - ry))
    falsos = 0
    for _ in range(300):  # 10 s en reposo
        t += 1 / 30
        falsos += seg.actualizar(domo.render(None, t))["contacto"]
    return aciertos, falsos, errores


def prueba_zonas(luz, rng):
    domo, seg = preparar(luz, 2)
    t, resultado = 0.0, {}
    for zona, dx in (("izquierda", -130), ("centro", 0), ("derecha", 130)):
        bien = 0
        for _ in range(10):
            x = CENTRO[0] + dx + rng.uniform(-20, 20)
            y = CENTRO[1] + rng.uniform(-60, 60)
            res, t = presionar(domo, seg, x, y, rng.uniform(0.4, 1.0), t)
            bien += res["contacto"] and res["zona"] == zona
        resultado[zona] = bien
    return resultado


def prueba_carga(luz):
    domo, seg = preparar(luz, 3)
    t, valores = 0.0, []
    for f in (0.2, 0.4, 1.0):  # como pesas de 100, 200 y 500 g
        res, t = presionar(domo, seg, CENTRO[0] + 40, CENTRO[1] - 30, f, t)
        valores.append(res["fuerza_rel"])
    return valores


def main():
    for luz in (False, True):
        rng = np.random.default_rng(7)
        titulo = "CON luz exterior (domo translúcido)" if luz else "Luz controlada"
        print(f"\n=== {titulo} ===")

        aciertos, falsos, errores = prueba_contacto(luz, rng)
        print(f"A. Contacto: {aciertos}/20 detectados "
              f"[{'OK' if aciertos >= 18 else 'NO'} meta 18/20]; "
              f"falsas detecciones en 10 s de reposo: {falsos} cuadros")
        if errores:
            print(f"C. Ubicación: error medio {np.mean(errores):.2f} mm, "
                  f"máximo {np.max(errores):.2f} mm "
                  f"[{'OK' if np.max(errores) <= 3 else 'NO'} meta ≤ 3 mm]")

        zonas = prueba_zonas(luz, rng)
        texto = ", ".join(f"{z} {n}/10" for z, n in zonas.items())
        ok = all(n >= 8 for n in zonas.values())
        print(f"B. Zonas: {texto} [{'OK' if ok else 'NO'} meta 8/10 por zona]")

        carga = prueba_carga(luz)
        crece = carga[0] < carga[1] < carga[2]
        print("D. Carga (fuerza relativa en px): "
              + " < ".join(f"{v:.2f}" for v in carga)
              + f" [{'OK' if crece else 'NO'} crece con la carga]")


if __name__ == "__main__":
    main()
