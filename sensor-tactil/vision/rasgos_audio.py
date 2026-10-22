"""
Rasgos del sonido de un toque, para clasificar el material por audio.

De un clip corto saca unos pocos números que resumen "cómo suena": qué tan
fuerte es, qué tan agudo, cuánta energía hay en graves/medios/agudos, etc. Son
los que usará el clasificador de audio y la fusión.
"""

import numpy as np

RASGOS_AUDIO = ("rms", "cruces_cero", "centroide", "rolloff",
                "grave", "medio", "agudo", "planitud")


def rasgos_audio(muestras, fs=16000) -> np.ndarray:
    x = np.asarray(muestras, dtype=np.float32)
    if x.size == 0 or np.allclose(x, 0):
        return np.zeros(len(RASGOS_AUDIO), dtype=np.float32)

    rms = float(np.sqrt(np.mean(x**2)))
    cruces = float(np.mean(np.abs(np.diff(np.sign(x))) > 0))  # tasa de cruces por cero

    esp = np.abs(np.fft.rfft(x)) + 1e-9
    frec = np.fft.rfftfreq(len(x), 1 / fs)
    centroide = float((frec * esp).sum() / esp.sum())  # "agudeza" media
    acum = np.cumsum(esp)
    rolloff = float(frec[np.searchsorted(acum, 0.85 * acum[-1])])  # dónde está el 85%

    total = esp.sum()
    grave = float(esp[frec < 500].sum() / total)
    medio = float(esp[(frec >= 500) & (frec < 2000)].sum() / total)
    agudo = float(esp[frec >= 2000].sum() / total)
    # Planitud: ruido de banda ancha → cerca de 1; tono puro → cerca de 0.
    planitud = float(np.exp(np.mean(np.log(esp))) / np.mean(esp))

    return np.array([rms, cruces, centroide, rolloff,
                     grave, medio, agudo, planitud], dtype=np.float32)
