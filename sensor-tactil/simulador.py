"""
Simulador de la placa del sensor táctil.

Hace de cuenta que es la ESP32: genera datos falsos de presión, IMU y micrófono
y los manda por una conexión de red local (TCP), con el MISMO formato que usará
la placa real. Sirve para desarrollar y probar todo el lado de la PC sin tener
ninguna placa en la mano.

Simula un "toque" en la yema cada 4 segundos, durante 1 segundo: la presión
sube, aparece vibración en la IMU y un sonido en el micrófono.

Uso:
    python simulador.py
Después, en otra terminal:
    python receptor.py
"""

import math
import random
import socket
import time

import numpy as np

import protocolo as proto

HOST, PUERTO = "127.0.0.1", 9000
FREC_PT = 100  # presión e IMU: 100 veces por segundo


def transmitir(conexion: socket.socket) -> None:
    t0 = time.time()
    proximo_pt = 0.0
    proximo_audio = 0.0
    muestras_enviadas = 0

    while True:
        ahora = time.time() - t0
        ts_ms = int(ahora * 1000)

        # Un toque de 1 s al inicio de cada ciclo de 4 s. `fuerza` va de 0 a 1 a 0.
        ciclo = ahora % 4.0
        hay_contacto = ciclo < 1.0
        fuerza = math.sin(ciclo * math.pi) if hay_contacto else 0.0

        # --- Presión e IMU a 100 Hz ---
        if ahora >= proximo_pt:
            presion = 101.3 + fuerza * 8.0 + random.gauss(0, 0.05)  # kPa
            temp = 24.0 + random.gauss(0, 0.02)  # °C
            conexion.sendall(proto.pack_presion(ts_ms, presion, temp))

            vib = fuerza * 0.4  # la vibración crece con el contacto
            ax = random.gauss(0, 0.02) + random.gauss(0, vib)
            ay = random.gauss(0, 0.02) + random.gauss(0, vib)
            az = 9.81 + random.gauss(0, 0.02) + random.gauss(0, vib)  # gravedad en Z
            gx, gy, gz = (random.gauss(0, 0.5) for _ in range(3))  # °/s
            conexion.sendall(proto.pack_imu(ts_ms, ax, ay, az, gx, gy, gz))

            proximo_pt += 1.0 / FREC_PT

        # --- Audio por bloques, al ritmo real del micrófono ---
        if ahora >= proximo_audio:
            n = proto.AUDIO_BLOQUE
            t = (np.arange(n) + muestras_enviadas) / proto.AUDIO_FS
            ruido = np.random.normal(0, 250, n)
            tono = fuerza * 1500 * np.sin(2 * math.pi * 220 * t)  # "zumbido" del toque
            muestras = np.clip(ruido + tono, -32767, 32767).astype(np.int16)
            conexion.sendall(proto.pack_audio(ts_ms, muestras.tolist()))

            muestras_enviadas += n
            proximo_audio += n / proto.AUDIO_FS

        time.sleep(0.0005)  # no saturar el CPU


def main() -> None:
    servidor = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    servidor.bind((HOST, PUERTO))
    servidor.listen(1)
    print(f"Simulador escuchando en {HOST}:{PUERTO}. Abre el receptor en otra terminal.")
    try:
        while True:
            conexion, direccion = servidor.accept()
            print("Receptor conectado desde", direccion)
            try:
                transmitir(conexion)
            except (ConnectionError, BrokenPipeError, OSError):
                print("Receptor desconectado. Esperando otro…")
            finally:
                conexion.close()
    except KeyboardInterrupt:
        print("\nSimulador detenido.")
    finally:
        servidor.close()


if __name__ == "__main__":
    main()
