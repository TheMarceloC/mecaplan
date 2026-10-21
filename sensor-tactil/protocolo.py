"""
Protocolo de datos del sensor táctil (contrato entre la ESP32 y la PC).

La MISMA estructura la usan el simulador, el receptor y el firmware. Si cambian
algo aquí, cámbienlo también en firmware/firmware.ino.

Formato de cada paquete (bytes):

    0xAA 0x55 | TIPO(1) | LONGITUD(2, little-endian) | PAYLOAD(LONGITUD) | CHK(1)

    - 0xAA 0x55 : marca de inicio ("sincronía"), sirve para reengancharse si se
      pierde un byte por el cable.
    - CHK       : XOR de TIPO + todos los bytes del PAYLOAD. Detecta corrupción.

Tipos de paquete y su payload (todo en little-endian):

    PRESION (0x01): ts_ms(uint32) presion_kpa(float32) temp_c(float32)
    IMU     (0x02): ts_ms(uint32) ax ay az gx gy gz (6 x float32)
    AUDIO   (0x03): ts_ms(uint32) n(uint16) n muestras(int16)
"""

import struct

SYNC = b"\xAA\x55"

TIPO_PRESION = 0x01
TIPO_IMU = 0x02
TIPO_AUDIO = 0x03

# Parámetros del micrófono acordados con el equipo de firmware.
AUDIO_FS = 16000  # Hz (muestras por segundo)
AUDIO_BLOQUE = 256  # muestras por paquete de audio


def _checksum(tipo: int, payload: bytes) -> int:
    chk = tipo
    for b in payload:
        chk ^= b
    return chk & 0xFF


def empaquetar(tipo: int, payload: bytes) -> bytes:
    cabecera = struct.pack("<BH", tipo, len(payload))
    return SYNC + cabecera + payload + bytes([_checksum(tipo, payload)])


# --- Construir paquetes (lo usa el simulador; el firmware hace lo mismo en C) ---


def pack_presion(ts_ms: int, presion_kpa: float, temp_c: float) -> bytes:
    return empaquetar(TIPO_PRESION, struct.pack("<Iff", ts_ms, presion_kpa, temp_c))


def pack_imu(ts_ms, ax, ay, az, gx, gy, gz) -> bytes:
    return empaquetar(TIPO_IMU, struct.pack("<Iffffff", ts_ms, ax, ay, az, gx, gy, gz))


def pack_audio(ts_ms: int, muestras) -> bytes:
    cuerpo = struct.pack("<IH", ts_ms, len(muestras))
    cuerpo += struct.pack("<%dh" % len(muestras), *muestras)
    return empaquetar(TIPO_AUDIO, cuerpo)


# --- Leer paquetes del cable (lo usa el receptor) ---


def unpack_presion(payload: bytes) -> dict:
    ts, presion, temp = struct.unpack("<Iff", payload)
    return {"ts": ts, "presion": presion, "temp": temp}


def unpack_imu(payload: bytes) -> dict:
    ts, ax, ay, az, gx, gy, gz = struct.unpack("<Iffffff", payload)
    return {"ts": ts, "ax": ax, "ay": ay, "az": az, "gx": gx, "gy": gy, "gz": gz}


def unpack_audio(payload: bytes) -> dict:
    ts, n = struct.unpack_from("<IH", payload, 0)
    muestras = struct.unpack_from("<%dh" % n, payload, 6)
    return {"ts": ts, "muestras": muestras}


class LectorTramas:
    """
    Arma paquetes completos a partir de un flujo de bytes, venga de donde venga
    (socket del simulador o puerto serial de la ESP32 real).

    `leer(n)` debe devolver entre 1 y n bytes, o b"" si la fuente se cerró.
    """

    def __init__(self, leer):
        self._leer = leer
        self._buf = bytearray()

    def _asegurar(self, n: int) -> None:
        while len(self._buf) < n:
            trozo = self._leer(n - len(self._buf))
            if not trozo:
                raise ConnectionError("La fuente de datos se cerró.")
            self._buf.extend(trozo)

    def siguiente(self):
        """Devuelve (tipo, payload) del próximo paquete, o None si venía corrupto."""
        # Avanzar byte a byte hasta encontrar la marca de inicio.
        while True:
            self._asegurar(2)
            if self._buf[0:2] == SYNC:
                break
            del self._buf[0]
        self._asegurar(5)  # SYNC(2) + TIPO(1) + LONGITUD(2)
        tipo = self._buf[2]
        longitud = self._buf[3] | (self._buf[4] << 8)
        self._asegurar(5 + longitud + 1)
        payload = bytes(self._buf[5 : 5 + longitud])
        chk = self._buf[5 + longitud]
        del self._buf[: 5 + longitud + 1]
        if chk != _checksum(tipo, payload):
            return None  # paquete dañado: se descarta y se sigue
        return tipo, payload
