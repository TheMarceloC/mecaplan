"""
Clasificar el material por imagen, por sonido y por los dos juntos (fusión).

Compara tres clasificadores con el mismo dataset simulado:
  - solo imagen (la huella en el gel),
  - solo audio (cómo suena el toque),
  - fusión (imagen + audio).

La idea del Digit 360 / Sparsh-X: juntar modalidades da robustez. Para mostrarlo,
se prueba con el micrófono limpio y con ruido de ambiente: el audio solo se cae
cuando hay ruido, pero la fusión se mantiene porque la imagen la sostiene. Aquí
los datos son simulados; con datos reales los números serán otros, pero el flujo
de fusión queda armado y probado.

Uso:
    python clasificador_fusion.py --entrenar
    python clasificador_fusion.py --entrenar --n 300
"""

import argparse
import os
import pickle

import numpy as np

from camara_simulada import GelSimulado
from clasificador import extraer_rasgos as rasgos_imagen
from deteccion_contacto import DetectorContacto
from materiales import MATERIALES, audio_material, imagen_material
from rasgos_audio import rasgos_audio

MODELO = os.path.join(os.path.dirname(__file__), "modelo_fusion.pkl")


def generar_dataset(n_por_material=250, semilla=0):
    """Genera rasgos de imagen y los clips de audio (crudos) de cada toque."""
    rng = np.random.default_rng(semilla)
    gel = GelSimulado(ruido=2.0, semilla=semilla)
    detector = DetectorContacto()
    detector.fijar_referencia(gel.render(None))

    Ximg, clips, y = [], [], []
    for etiqueta, nombre in enumerate(MATERIALES):
        for _ in range(n_por_material):
            img = imagen_material(nombre, gel=gel, rng=rng)
            Ximg.append(rasgos_imagen(detector.detectar(img)))
            clips.append(audio_material(nombre, rng=rng))
            y.append(etiqueta)
    return np.array(Ximg), clips, np.array(y)


def rasgos_de_clips(clips, ruido_mic, semilla=1):
    """Rasgos de audio, sumándole ruido de ambiente al micrófono (0 = limpio)."""
    rng = np.random.default_rng(semilla)
    X = []
    for clip in clips:
        señal = clip.astype(np.float32)
        if ruido_mic:
            señal = señal + rng.normal(0, ruido_mic, señal.shape)
        X.append(rasgos_audio(señal))
    return np.array(X)


def nuevo_modelo():
    try:
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(n_estimators=120, random_state=0)
    except Exception:
        from clasificador import ClasificadorCentroides

        return ClasificadorCentroides()


def _entrenar_y_medir(Xtr, ytr, Xte, yte):
    modelo = nuevo_modelo()
    modelo.fit(Xtr, ytr)
    acierto = float((modelo.predict(Xte) == yte).mean())
    return modelo, acierto


def _confusion(modelo, Xte, yte):
    pred = modelo.predict(Xte)
    conf = np.zeros((len(MATERIALES), len(MATERIALES)), int)
    for r, p in zip(yte, pred):
        conf[r, p] += 1
    return conf


def entrenar(n_por_material=250):
    Ximg, clips, y = generar_dataset(n_por_material)

    rng = np.random.default_rng(0)
    orden = rng.permutation(len(y))
    corte = int(0.75 * len(y))
    tr, te = orden[:corte], orden[corte:]

    print(f"Muestras: {len(y)} ({n_por_material} por material)\n")
    _, ac_img = _entrenar_y_medir(Ximg[tr], y[tr], Ximg[te], y[te])
    print("La imagen no depende del ruido del micrófono:")
    print(f"  solo imagen : {ac_img * 100:5.1f}%\n")

    print("Comparación según el ruido de ambiente en el micrófono:")
    print(f"  {'escenario':<18}{'solo audio':>12}{'FUSIÓN':>10}")
    modelo_limpio = None
    escenarios = (("micrófono limpio", 0), ("ambiente moderado", 4000),
                  ("taller ruidoso", 8000))
    for etiqueta, ruido_mic in escenarios:
        Xaud = rasgos_de_clips(clips, ruido_mic)
        Xfus = np.hstack([Ximg, Xaud])
        _, ac_aud = _entrenar_y_medir(Xaud[tr], y[tr], Xaud[te], y[te])
        modelo_fus, ac_fus = _entrenar_y_medir(Xfus[tr], y[tr], Xfus[te], y[te])
        print(f"  {etiqueta:<18}{ac_aud * 100:>11.1f}%{ac_fus * 100:>9.1f}%")
        if ruido_mic == 0:
            modelo_limpio = modelo_fus

    print("\nLectura: con el micrófono ruidoso, el audio solo cae, pero la fusión\n"
          "se mantiene porque la imagen la sostiene.")

    with open(MODELO, "wb") as f:
        pickle.dump({"modelo": modelo_limpio, "materiales": MATERIALES}, f)
    print(f"\nModelo de fusión guardado en {MODELO}")


def main():
    ap = argparse.ArgumentParser(description="Clasificar material: imagen, audio y fusión")
    ap.add_argument("--entrenar", action="store_true")
    ap.add_argument("--n", type=int, default=250, help="Muestras por material")
    args = ap.parse_args()
    if args.entrenar:
        entrenar(args.n)
    else:
        print("Usa --entrenar para generar el dataset, entrenar y comparar.")


if __name__ == "__main__":
    main()
