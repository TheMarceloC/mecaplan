"""
Clasificador de material por la imagen de la huella.

Flujo completo de la IA, sin hardware:
  1. Genera un dataset de huellas simuladas y etiquetadas (ver materiales.py).
  2. De cada huella saca unos pocos RASGOS (área, fuerza, nº de bultos, etc.).
  3. Entrena un clasificador y reporta su acierto.
  4. Guarda el modelo para usarlo en vivo (ver demo_clasificador.py).

El día que haya datos reales, se cambia la fuente de imágenes y el flujo queda
igual. Recordar: estas huellas son simuladas; el acierto aquí no es el acierto
con el sensor real.

Uso:
    python clasificador.py --entrenar          # genera datos, entrena y guarda
    python clasificador.py --entrenar --n 300  # más muestras por material
"""

import argparse
import os
import pickle

import cv2
import numpy as np

from camara_simulada import ALTO, ANCHO, GelSimulado
from deteccion_contacto import DetectorContacto
from materiales import MATERIALES, imagen_material

MODELO = os.path.join(os.path.dirname(__file__), "modelo_material.pkl")
RASGOS = ("area", "fuerza_media", "fuerza_max", "num_bultos",
          "densidad_bultos", "compacidad", "elongacion")


def extraer_rasgos(resultado) -> np.ndarray:
    """Convierte el resultado del detector en un vector de rasgos."""
    if not resultado["contacto"]:
        return np.zeros(len(RASGOS), dtype=np.float32)

    mascara = resultado["mascara"].astype(np.uint8)
    dif = resultado["diferencia"]
    area = resultado["area"]
    area_frac = area / (ALTO * ANCHO)

    n, _ = cv2.connectedComponents(mascara)
    num_bultos = n - 1  # se descuenta el fondo

    ys, xs = np.nonzero(mascara)
    cx, cy = xs.mean(), ys.mean()
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    compacidad = dist.std() / (np.sqrt(area) + 1e-6)
    alto = ys.max() - ys.min() + 1
    ancho = xs.max() - xs.min() + 1
    elongacion = max(alto, ancho) / min(alto, ancho)

    return np.array([
        area_frac,
        resultado["fuerza"],
        float(dif[resultado["mascara"]].max()),
        num_bultos,
        num_bultos / (area_frac + 1e-6),
        compacidad,
        elongacion,
    ], dtype=np.float32)


def generar_dataset(n_por_material=200, semilla=0):
    rng = np.random.default_rng(semilla)
    gel = GelSimulado(ruido=2.0, semilla=semilla)
    detector = DetectorContacto()
    detector.fijar_referencia(gel.render(None))  # gel en reposo

    X, y = [], []
    for etiqueta, nombre in enumerate(MATERIALES):
        for _ in range(n_por_material):
            img = imagen_material(nombre, gel=gel, rng=rng)
            X.append(extraer_rasgos(detector.detectar(img)))
            y.append(etiqueta)
    return np.array(X), np.array(y)


class ClasificadorCentroides:
    """Respaldo en numpy por si no hay scikit-learn: compara con el promedio
    (estandarizado) de cada material."""

    def fit(self, X, y):
        self.media = X.mean(0)
        self.desv = X.std(0) + 1e-6
        Xz = (X - self.media) / self.desv
        self.centroides = np.array([Xz[y == c].mean(0) for c in np.unique(y)])
        return self

    def predict(self, X):
        Xz = (X - self.media) / self.desv
        d = ((Xz[:, None, :] - self.centroides[None]) ** 2).sum(-1)
        return d.argmin(1)


def nuevo_modelo():
    try:
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(n_estimators=120, random_state=0), "RandomForest"
    except Exception:
        return ClasificadorCentroides(), "Centroides (numpy)"


def entrenar(n_por_material=200):
    X, y = generar_dataset(n_por_material)
    # Mezcla y separa 75% entrenamiento / 25% prueba.
    rng = np.random.default_rng(0)
    orden = rng.permutation(len(X))
    X, y = X[orden], y[orden]
    corte = int(0.75 * len(X))
    Xtr, ytr, Xte, yte = X[:corte], y[:corte], X[corte:], y[corte:]

    modelo, tipo = nuevo_modelo()
    modelo.fit(Xtr, ytr)
    pred = modelo.predict(Xte)
    acierto = float((pred == yte).mean())

    print(f"Modelo: {tipo}")
    print(f"Muestras: {len(X)} ({n_por_material} por material)")
    print(f"Acierto en prueba: {acierto * 100:.1f}%\n")
    print("Matriz de confusión (filas = real, columnas = predicho):")
    conf = np.zeros((len(MATERIALES), len(MATERIALES)), int)
    for r, p in zip(yte, pred):
        conf[r, p] += 1
    print("          " + " ".join(f"{m[:6]:>6}" for m in MATERIALES))
    for i, m in enumerate(MATERIALES):
        print(f"{m:>8}  " + " ".join(f"{conf[i, j]:>6}" for j in range(len(MATERIALES))))

    with open(MODELO, "wb") as f:
        pickle.dump({"modelo": modelo, "materiales": MATERIALES}, f)
    print(f"\nModelo guardado en {MODELO}")


def cargar_modelo():
    with open(MODELO, "rb") as f:
        return pickle.load(f)


def main():
    ap = argparse.ArgumentParser(description="Clasificador de material por imagen")
    ap.add_argument("--entrenar", action="store_true", help="Genera datos, entrena y guarda")
    ap.add_argument("--n", type=int, default=200, help="Muestras por material")
    args = ap.parse_args()
    if args.entrenar:
        entrenar(args.n)
    else:
        print("Usa --entrenar para generar el dataset y entrenar. "
              "Para la demo en vivo: python demo_clasificador.py")


if __name__ == "__main__":
    main()
