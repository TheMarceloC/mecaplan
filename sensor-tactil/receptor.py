"""
Receptor del sensor táctil.

Lee los paquetes de presión, IMU y micrófono y los muestra en vivo en tres
gráficas. Por defecto se conecta al simulador; cuando llegue la placa real, se
usa el mismo programa con `--serial`.

Uso con el simulador (en otra terminal corre primero `python simulador.py`):
    python receptor.py

Uso con la ESP32 real (cambia COM5 por tu puerto; en Linux es /dev/ttyUSB0):
    python receptor.py --serial COM5

Para grabar la sesión a archivos (data/sesiones/...), agrega --guardar:
    python receptor.py --guardar
    python receptor.py --serial COM5 --guardar

Lo único que cambia entre simulador y placa real es la "fuente" de bytes.
Todo lo demás (decodificar, graficar, guardar) es idéntico.
"""

import argparse
import collections
import socket
import threading
import time

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.animation import FuncAnimation

import protocolo as proto
from grabador import GrabadorSesion

BAUD = 921600  # debe coincidir con Serial.begin(...) del firmware

# Buffers que comparte el hilo de lectura con las gráficas.
presion = collections.deque(maxlen=500)  # ~5 s a 100 Hz
acel = collections.deque(maxlen=500)  # magnitud de la aceleración
audio = collections.deque(maxlen=proto.AUDIO_FS // 4)  # últimos ~0.25 s
contadores = {"PRESION": 0, "IMU": 0, "AUDIO": 0}


# Cada fuente devuelve (leer, cerrar): leer(n) entrega bytes, cerrar() corta la
# conexión para poder terminar de forma limpia (y cerrar bien la grabación).


def fuente_simulador(host="127.0.0.1", puerto=9000):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, puerto))
    print(f"Conectado al simulador en {host}:{puerto}.")
    return s.recv, s.close  # recv(n) devuelve b"" si se cierra -> se detecta


def fuente_serial(puerto, baud=BAUD):
    import serial  # pyserial

    ser = serial.Serial(puerto, baud, timeout=1)
    print(f"Conectado a la placa en {puerto} a {baud} baudios.")

    def leer(n):
        # read() puede devolver vacío por timeout; eso NO es desconexión, reintenta.
        while True:
            datos = ser.read(n)
            if datos:
                return datos
            if ser.closed:
                return b""

    return leer, ser.close


def hilo_lectura(lector: proto.LectorTramas, grabador=None) -> None:
    ultimo_reporte = time.time()
    try:
        while True:
            try:
                paquete = lector.siguiente()
            except ConnectionError:
                return  # la fuente se cerró (o terminamos nosotros)
            if paquete is None:
                continue  # paquete corrupto, se descarta
            tipo, payload = paquete

            if tipo == proto.TIPO_PRESION:
                d = proto.unpack_presion(payload)
                presion.append(d["presion"])
                contadores["PRESION"] += 1
                if grabador:
                    grabador.presion(d)
            elif tipo == proto.TIPO_IMU:
                d = proto.unpack_imu(payload)
                acel.append((d["ax"] ** 2 + d["ay"] ** 2 + d["az"] ** 2) ** 0.5)
                contadores["IMU"] += 1
                if grabador:
                    grabador.imu(d)
            elif tipo == proto.TIPO_AUDIO:
                d = proto.unpack_audio(payload)
                audio.extend(d["muestras"])
                contadores["AUDIO"] += 1
                if grabador:
                    grabador.audio(d)

            # Reporte de ritmo cada 2 s, para confirmar que los datos llegan.
            if time.time() - ultimo_reporte >= 2.0:
                hz = {k: v / 2 for k, v in contadores.items()}
                print(f"Recibiendo  presión: {hz['PRESION']:.0f} Hz   "
                      f"IMU: {hz['IMU']:.0f} Hz   audio: {hz['AUDIO']:.0f} bloques/s")
                for k in contadores:
                    contadores[k] = 0
                ultimo_reporte = time.time()
    finally:
        if grabador:
            grabador.cerrar()  # finaliza CSV y WAV aunque se cierre la ventana


def main() -> None:
    ap = argparse.ArgumentParser(description="Receptor del sensor táctil")
    ap.add_argument("--serial", help="Puerto de la placa real, p. ej. COM5 o /dev/ttyUSB0")
    ap.add_argument(
        "--guardar",
        action="store_true",
        help="Graba la sesión a data/sesiones/ (presión y IMU en CSV, audio en WAV)",
    )
    args = ap.parse_args()

    try:
        leer, cerrar_fuente = (
            fuente_serial(args.serial) if args.serial else fuente_simulador()
        )
    except (ConnectionRefusedError, OSError) as e:
        destino = args.serial or "el simulador"
        print(f"No se pudo conectar a {destino}: {e}")
        print("¿Arrancaste primero `python simulador.py` (o conectaste la placa)?")
        return

    grabador = GrabadorSesion() if args.guardar else None
    if grabador:
        print("Grabando. Cierra la ventana de las gráficas para terminar la sesión.")

    lector = proto.LectorTramas(leer)
    hilo = threading.Thread(
        target=hilo_lectura, args=(lector, grabador), daemon=True
    )
    hilo.start()

    # --- Gráficas en vivo (deben correr en el hilo principal) ---
    fig, (axp, axi, axa) = plt.subplots(3, 1, figsize=(9, 7))
    fig.suptitle("Sensor táctil — datos en vivo")

    (linea_p,) = axp.plot([], [], color="#0f49b6")
    axp.set_ylabel("Presión (kPa)")
    axp.set_xlim(0, presion.maxlen)
    axp.set_ylim(100, 112)

    (linea_i,) = axi.plot([], [], color="#03aed2")
    axi.set_ylabel("|Aceleración| (m/s²)")
    axi.set_xlim(0, acel.maxlen)
    axi.set_ylim(9, 11)

    (linea_a,) = axa.plot([], [], color="#05065c")
    axa.set_ylabel("Micrófono")
    axa.set_xlabel("muestras")
    axa.set_xlim(0, audio.maxlen)
    axa.set_ylim(-5000, 5000)

    def actualizar(_):
        linea_p.set_data(range(len(presion)), list(presion))
        linea_i.set_data(range(len(acel)), list(acel))
        linea_a.set_data(range(len(audio)), list(audio))
        return linea_p, linea_i, linea_a

    # cache_frame_data=False porque los datos cambian en tiempo real.
    _anim = FuncAnimation(fig, actualizar, interval=50, cache_frame_data=False)
    plt.tight_layout()
    try:
        plt.show()  # bloquea hasta que se cierra la ventana
    finally:
        # Al cerrar la ventana: corta la fuente para que el hilo termine y, si
        # se estaba grabando, cierre bien los archivos de la sesión.
        cerrar_fuente()
        hilo.join(timeout=3)


if __name__ == "__main__":
    main()
