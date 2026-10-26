/*
 * Firmware del sensor táctil para ESP32 (esqueleto).
 *
 * Manda presión, IMU y micrófono por USB (serial) con el MISMO formato que el
 * simulador (ver ../protocolo.py). Así, el programa receptor.py funciona igual
 * con el simulador y con esta placa: solo se cambia `python receptor.py` por
 * `python receptor.py --serial COMx`.
 *
 * Por ahora envía valores de PRUEBA (como el simulador). Donde dice TODO, se
 * conectan los sensores reales cuando lleguen las placas. La estructura de los
 * paquetes NO cambia al poner los sensores de verdad.
 *
 * Sensores previstos (ajústenlos a los de su placa):
 *   - Presión: BMP280 / BMP585 por I2C
 *   - IMU:     por I2C (acelerómetro + giroscopio)
 *   - Micrófono: ICS-43434 por I2S
 */

#include <Arduino.h>

// --- Protocolo (igual que protocolo.py) ---
static const uint8_t SYNC0 = 0xAA, SYNC1 = 0x55;
static const uint8_t TIPO_PRESION = 0x01;
static const uint8_t TIPO_IMU = 0x02;
static const uint8_t TIPO_AUDIO = 0x03;

static const uint16_t AUDIO_FS = 16000;   // Hz
static const uint16_t AUDIO_BLOQUE = 256; // muestras por paquete

// Envía un paquete con su marca de inicio, longitud y checksum.
void enviarPaquete(uint8_t tipo, const uint8_t *payload, uint16_t len) {
  uint8_t chk = tipo;
  for (uint16_t i = 0; i < len; i++) chk ^= payload[i];
  Serial.write(SYNC0);
  Serial.write(SYNC1);
  Serial.write(tipo);
  Serial.write((uint8_t)(len & 0xFF));
  Serial.write((uint8_t)(len >> 8));
  Serial.write(payload, len);
  Serial.write(chk);
}

void enviarPresion(uint32_t ts, float presion, float temp) {
  uint8_t p[12];
  memcpy(p + 0, &ts, 4);
  memcpy(p + 4, &presion, 4);
  memcpy(p + 8, &temp, 4);
  enviarPaquete(TIPO_PRESION, p, sizeof(p));
}

void enviarImu(uint32_t ts, float ax, float ay, float az, float gx, float gy, float gz) {
  uint8_t p[28];
  memcpy(p + 0, &ts, 4);
  float v[6] = {ax, ay, az, gx, gy, gz};
  memcpy(p + 4, v, sizeof(v));
  enviarPaquete(TIPO_IMU, p, sizeof(p));
}

void enviarAudio(uint32_t ts, const int16_t *muestras, uint16_t n) {
  static uint8_t p[6 + AUDIO_BLOQUE * 2];
  memcpy(p + 0, &ts, 4);
  memcpy(p + 4, &n, 2);
  memcpy(p + 6, muestras, n * 2);
  enviarPaquete(TIPO_AUDIO, p, 6 + n * 2);
}

// --- Temporización ---
uint32_t ultimoPT = 0;  // presión e IMU a 100 Hz
uint32_t ultimoAudio = 0;
uint32_t muestrasAudio = 0;

void setup() {
  Serial.begin(921600);
  // TODO: inicializar I2C y los sensores (Wire.begin(), bmp.begin(), imu.begin()).
  // TODO: inicializar I2S para el micrófono ICS-43434.
}

void loop() {
  uint32_t ahora = millis();

  // Presión e IMU cada 10 ms (100 Hz).
  if (ahora - ultimoPT >= 10) {
    ultimoPT = ahora;

    // TODO: leer sensores reales. Por ahora, valores de prueba.
    float presion = 101.3f;  // = bmp.readPressure() / 1000.0f;
    float temp = 24.0f;      // = bmp.readTemperature();
    enviarPresion(ahora, presion, temp);

    float ax = 0, ay = 0, az = 9.81f, gx = 0, gy = 0, gz = 0;  // = imu.read...
    enviarImu(ahora, ax, ay, az, gx, gy, gz);
  }

  // Un bloque de audio cada AUDIO_BLOQUE/AUDIO_FS segundos (~16 ms).
  if (ahora - ultimoAudio >= (1000UL * AUDIO_BLOQUE) / AUDIO_FS) {
    ultimoAudio = ahora;

    int16_t bloque[AUDIO_BLOQUE];
    // TODO: leer AUDIO_BLOQUE muestras reales del I2S. Por ahora, silencio.
    for (uint16_t i = 0; i < AUDIO_BLOQUE; i++) bloque[i] = 0;

    enviarAudio(ahora, bloque, AUDIO_BLOQUE);
    muestrasAudio += AUDIO_BLOQUE;
  }
}
