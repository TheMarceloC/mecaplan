"""
Demostración en vivo: reconocer el material por la imagen de la huella.

Cada ~2 segundos toca un material al azar, lo clasifica con el modelo entrenado y
muestra en pantalla el material REAL y el PREDICHO (verde si acierta, rojo si no).

Antes de usarlo hay que entrenar una vez:
    python clasificador.py --entrenar

Luego:
    python demo_clasificador.py

Cerrar con la tecla Q.
"""

import os
import time

import cv2
import numpy as np

from camara_simulada import GelSimulado
from clasificador import MODELO, cargar_modelo, extraer_rasgos
from deteccion_contacto import DetectorContacto
from materiales import MATERIALES, imagen_material


def main():
    if not os.path.exists(MODELO):
        raise SystemExit("No hay modelo. Entrena primero: python clasificador.py --entrenar")

    datos = cargar_modelo()
    modelo, materiales = datos["modelo"], datos["materiales"]
    rng = np.random.default_rng()
    gel = GelSimulado(ruido=2.0)
    detector = DetectorContacto()
    detector.fijar_referencia(gel.render(None))

    material_real = None
    imagen = gel.render(None)
    predicho = "—"
    proximo_cambio = 0.0
    print("Ventana abierta; cierra con la tecla Q.")

    while True:
        ahora = time.time()
        if ahora >= proximo_cambio:
            material_real = rng.choice(MATERIALES)
            imagen = imagen_material(material_real, gel=gel, rng=rng)
            rasgos = extraer_rasgos(detector.detectar(imagen))
            predicho = materiales[int(modelo.predict(rasgos[None])[0])]
            proximo_cambio = ahora + 2.0

        acierto = material_real == predicho
        color = (0, 180, 0) if acierto else (0, 0, 255)
        panel = imagen.copy()
        cv2.putText(panel, f"real:     {material_real}", (10, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(panel, f"predicho: {predicho}", (10, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)
        cv2.imshow("Reconocer material por la huella", panel)
        if cv2.waitKey(30) & 0xFF == ord("q"):
            break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
