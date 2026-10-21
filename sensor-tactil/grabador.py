"""
Grabador de sesiones del sensor táctil.

Guarda lo que llega del sensor (simulador o placa real) en archivos, para
después entrenar la IA o revisar los datos. Cada sesión va en su propia carpeta
con la fecha y hora:

    data/sesiones/AAAAmmdd-HHMMSS/
        presion.csv   ts_ms, presion_kpa, temp_c
        imu.csv       ts_ms, ax, ay, az, gx, gy, gz
        audio.wav     micrófono (16 bits, mono, a AUDIO_FS)
        meta.json     resumen de la sesión (duración y conteos)

Los CSV se escriben al vuelo, así que aunque se corte el programa, lo grabado
hasta ese momento queda legible. El WAV se cierra correctamente al terminar.
"""

import csv
import json
import os
import struct
import time
import wave

import protocolo as proto


class GrabadorSesion:
    def __init__(self, carpeta_base="data/sesiones"):
        nombre = time.strftime("%Y%m%d-%H%M%S")
        self.ruta = os.path.join(carpeta_base, nombre)
        os.makedirs(self.ruta, exist_ok=True)

        self._fp_pres = open(
            os.path.join(self.ruta, "presion.csv"), "w", newline="", encoding="utf-8"
        )
        self._pres = csv.writer(self._fp_pres)
        self._pres.writerow(["ts_ms", "presion_kpa", "temp_c"])

        self._fp_imu = open(
            os.path.join(self.ruta, "imu.csv"), "w", newline="", encoding="utf-8"
        )
        self._imu = csv.writer(self._fp_imu)
        self._imu.writerow(["ts_ms", "ax", "ay", "az", "gx", "gy", "gz"])

        self._wav = wave.open(os.path.join(self.ruta, "audio.wav"), "wb")
        self._wav.setnchannels(1)
        self._wav.setsampwidth(2)  # int16
        self._wav.setframerate(proto.AUDIO_FS)

        self._cuenta = {"presion": 0, "imu": 0, "audio_muestras": 0}
        self._inicio = time.strftime("%Y-%m-%d %H:%M:%S")
        self._t0 = time.time()
        self._cerrado = False
        print("Grabando sesión en", self.ruta)

    def presion(self, d: dict) -> None:
        self._pres.writerow([d["ts"], f'{d["presion"]:.3f}', f'{d["temp"]:.3f}'])
        self._cuenta["presion"] += 1

    def imu(self, d: dict) -> None:
        self._imu.writerow(
            [d["ts"], *[f"{d[k]:.5f}" for k in ("ax", "ay", "az", "gx", "gy", "gz")]]
        )
        self._cuenta["imu"] += 1

    def audio(self, d: dict) -> None:
        muestras = d["muestras"]
        self._wav.writeframes(struct.pack("<%dh" % len(muestras), *muestras))
        self._cuenta["audio_muestras"] += len(muestras)

    def cerrar(self) -> None:
        if self._cerrado:
            return
        self._cerrado = True
        self._fp_pres.close()
        self._fp_imu.close()
        self._wav.close()
        meta = {
            "inicio": self._inicio,
            "duracion_s": round(time.time() - self._t0, 1),
            "audio_fs": proto.AUDIO_FS,
            **self._cuenta,
        }
        with open(
            os.path.join(self.ruta, "meta.json"), "w", encoding="utf-8"
        ) as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print(
            f"Sesión guardada en {self.ruta}  "
            f"({self._cuenta['presion']} presión, {self._cuenta['imu']} IMU, "
            f"{self._cuenta['audio_muestras']} muestras de audio, "
            f"{meta['duracion_s']} s)."
        )
