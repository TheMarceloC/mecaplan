"""
Sesión integrada: imagen + presión + IMU + audio, todo del MISMO toque.

Un solo "toque" (cada 4 s, de 1 s) genera a la vez la deformación que ve la
cámara, la subida de presión, la vibración de la IMU y el sonido del micrófono,
sincronizados por un mismo reloj. Todo se guarda en una sola carpeta, con el
formato parecido al del dataset Digit 360:

    data/sesiones_integradas/AAAAmmdd-HHMMSS/
        video.avi     imagen de la yema (30 fps)
        presion.csv   ts_ms, presion_kpa, temp_c
        imu.csv       ts_ms, ax, ay, az, gx, gy, gz
        audio.wav     micrófono (16 bits, mono, 16 kHz)
        metadata.yaml objeto/acción/superficie, modalidades, tasas y duración

Es simulado (sin placa ni cámara), pero deja listo el formato y el flujo para
grabar imagen + sensores juntos y alimentar la IA.

Uso:
    python sesion_integrada.py
    python sesion_integrada.py --material rugoso --segundos 12 --ver
"""

import argparse
import math
import os
import sys
import time

import cv2
import numpy as np

# Permite importar los módulos de sensor-tactil/ y sensor-tactil/vision/.
AQUI = os.path.dirname(__file__)
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "vision"))

import protocolo as proto  # noqa: E402
from grabador import GrabadorSesion  # noqa: E402
from camara_simulada import ALTO, ANCHO, GelSimulado  # noqa: E402
from materiales import MATERIALES, _mapa_hundimiento  # noqa: E402

FPS = 30
FREC_SENSOR = 100  # presión e IMU


def fuerza_en(t):
    """Perfil de contacto compartido: toque de 1 s cada 4 s, fuerza 0→1→0."""
    ciclo = t % 4.0
    return math.sin(ciclo * math.pi) if ciclo < 1.0 else 0.0


class GrabadorIntegrado:
    """Guarda las cuatro modalidades en una misma carpeta."""

    def __init__(self, material, base="data/sesiones_integradas"):
        carpeta = os.path.join(AQUI, base, time.strftime("%Y%m%d-%H%M%S"))
        self.sensores = GrabadorSesion(carpeta=carpeta)  # presión, IMU, audio
        self.ruta = self.sensores.ruta
        self.material = material
        self._video = cv2.VideoWriter(
            os.path.join(self.ruta, "video.avi"),
            cv2.VideoWriter_fourcc(*"MJPG"), FPS, (ANCHO, ALTO),
        )
        self._n_frames = 0

    presion = property(lambda self: self.sensores.presion)
    imu = property(lambda self: self.sensores.imu)
    audio = property(lambda self: self.sensores.audio)

    def imagen(self, bgr):
        self._video.write(bgr)
        self._n_frames += 1

    def cerrar(self):
        self._video.release()
        self.sensores.cerrar()
        # El grabador de sensores deja su propio meta.json (con duración de reloj);
        # aquí se escribe un metadata.yaml completo y se quita el redundante.
        meta_json = os.path.join(self.ruta, "meta.json")
        if os.path.exists(meta_json):
            os.remove(meta_json)
        import yaml

        meta = {
            "object": self.material,
            "action": "tap",
            "surface": None,
            "duracion_s": round(self._n_frames / FPS, 2),
            "modalidades": {
                "video": {"fps": FPS, "frames": self._n_frames, "tam": [ANCHO, ALTO]},
                "presion_hz": FREC_SENSOR,
                "imu_hz": FREC_SENSOR,
                "audio_fs": proto.AUDIO_FS,
            },
            "nota": "Datos simulados (sin placa ni cámara).",
        }
        with open(os.path.join(self.ruta, "metadata.yaml"), "w", encoding="utf-8") as f:
            yaml.safe_dump(meta, f, allow_unicode=True, sort_keys=False)


def grabar(material, segundos, ver=False):
    rng = np.random.default_rng()
    gel = GelSimulado(ruido=2.0)
    base_material = _mapa_hundimiento(material, rng)  # huella a fuerza plena
    grab = GrabadorIntegrado(material)
    print(f"Grabando sesión integrada de '{material}' en {grab.ruta}")

    prox_sensor = prox_audio = 0.0
    muestras_audio = 0
    t = 0.0
    while t < segundos:
        f = fuerza_en(t)
        ts_ms = int(t * 1000)

        # --- Imagen (30 fps): la huella del material, escalada por la fuerza ---
        bgr = gel.render(f * base_material)
        grab.imagen(bgr)
        if ver:
            cv2.imshow("Sesión integrada", bgr)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

        # --- Presión e IMU (100 Hz) ---
        while prox_sensor <= t:
            tm = int(prox_sensor * 1000)
            grab.presion({"ts": tm, "presion": 101.3 + f * 8.0 + rng.normal(0, 0.05),
                          "temp": 24.0 + rng.normal(0, 0.02)})
            vib = f * 0.4
            grab.imu({"ts": tm,
                      "ax": rng.normal(0, 0.02 + vib), "ay": rng.normal(0, 0.02 + vib),
                      "az": 9.81 + rng.normal(0, 0.02 + vib),
                      "gx": rng.normal(0, 0.5), "gy": rng.normal(0, 0.5), "gz": rng.normal(0, 0.5)})
            prox_sensor += 1 / FREC_SENSOR

        # --- Audio (bloques a 16 kHz) ---
        while prox_audio <= t:
            n = proto.AUDIO_BLOQUE
            tt = (np.arange(n) + muestras_audio) / proto.AUDIO_FS
            señal = rng.normal(0, 250, n) + f * 1500 * np.sin(2 * math.pi * 220 * tt)
            grab.audio({"ts": ts_ms,
                        "muestras": np.clip(señal, -32767, 32767).astype(np.int16).tolist()})
            muestras_audio += n
            prox_audio += n / proto.AUDIO_FS

        t += 1 / FPS

    grab.cerrar()
    if ver:
        cv2.destroyAllWindows()
    return grab.ruta


def main():
    ap = argparse.ArgumentParser(description="Graba una sesión con imagen + sensores")
    ap.add_argument("--material", default="liso", choices=MATERIALES)
    ap.add_argument("--segundos", type=float, default=8.0)
    ap.add_argument("--ver", action="store_true", help="Muestra la cámara mientras graba")
    args = ap.parse_args()

    ruta = grabar(args.material, args.segundos, args.ver)
    print("\nSesión guardada. Contenido:")
    for nombre in sorted(os.listdir(ruta)):
        tam = os.path.getsize(os.path.join(ruta, nombre))
        print(f"  {nombre:14} {tam:>10} bytes")


if __name__ == "__main__":
    main()
