# Sensor táctil — base de software (Digit 360)

> **Estado:** software de prueba con **simulador**, todavía **sin placa**. No
> requiere hardware para correr. Cuando lleguen las placas, el mismo código se
> conecta a la ESP32 real cambiando una línea.

Punto de partida para el equipo de Programación mientras se fabrican las placas.
Separa el software del hardware: un **simulador** hace de placa, así que todo el
lado de la PC se puede construir y probar **sin tener ninguna placa**. Cuando
llegue la ESP32 real, se cambia una sola línea y todo lo demás sirve igual.

## Idea actual: domo con marcadores

El proyecto se decidió por un **domo de silicona con marcadores** visto por una
cámara USB (estilo TacTip). Su simulador, el seguimiento de marcadores y las
pruebas de aceptación están en [`marcadores/`](marcadores/README.md).

Las carpetas `vision/`, `integracion/` y `demo/` son del enfoque fotométrico
(gel con luces de colores) que se exploró antes. De ahí sigue sirviendo la idea
de la detección de contacto, la grabación, el reproductor y el tablero.

## Qué hay aquí

| Archivo | Para qué |
|---|---|
| `protocolo.py` | El **contrato de datos**: qué manda la placa y en qué formato. Lo comparten el simulador, el receptor y el firmware. |
| `simulador.py` | Hace de cuenta que es la ESP32: genera presión, IMU y micrófono falsos. |
| `receptor.py` | Recibe los datos y los grafica en vivo. Funciona con el simulador o con la placa real. |
| `firmware/firmware.ino` | Esqueleto del firmware de la ESP32, que manda los datos con el mismo formato. |

## Cómo probarlo (sin placa)

1. Instala Python 3 y las dependencias:
   ```bash
   pip install -r requirements.txt
   ```
2. En una terminal, arranca el simulador:
   ```bash
   python simulador.py
   ```
3. En **otra** terminal, arranca el receptor:
   ```bash
   python receptor.py
   ```

Deberías ver tres gráficas moviéndose. Cada 4 segundos el simulador hace un
"toque": la presión sube, la IMU vibra y aparece sonido en el micrófono.

## Cuando llegue la placa real

Sube `firmware/firmware.ino` a la ESP32 (Arduino IDE o PlatformIO), conéctale
los sensores donde dicen los `TODO`, y en vez del simulador usa:

```bash
python receptor.py --serial COM5
```

(En Windows es `COM5`, `COM6`…; en Linux `/dev/ttyUSB0`.)

El receptor no cambia: lo único distinto es de dónde vienen los bytes.

## Grabar sesiones

Para guardar los datos (y usarlos después en la IA), agrega `--guardar`:

```bash
python receptor.py --guardar
python receptor.py --serial COM5 --guardar
```

Mientras ves las gráficas, se graba todo. **Cierra la ventana para terminar la
sesión.** Cada sesión queda en su propia carpeta:

```
data/sesiones/AAAAmmdd-HHMMSS/
    presion.csv   ts_ms, presion_kpa, temp_c
    imu.csv       ts_ms, ax, ay, az, gx, gy, gz
    audio.wav     micrófono (16 bits, mono, 16 kHz)
    meta.json     duración y conteos de la sesión
```

La carpeta `data/` está en el `.gitignore`: las grabaciones no se suben al repo.

## Por dónde seguir

- **Cámara**: agregar un script aparte con OpenCV (`cv2.VideoCapture`) para la
  parte de visión; no depende de la placa. Luego grabar también el video en la
  carpeta de la sesión, para tener imagen + presión + audio juntos.
- **Firmware real**: reemplazar los valores de prueba por las lecturas de los
  sensores (presión por I2C, IMU por I2C, micrófono por I2S).
- **Entrenar la IA**: leer las carpetas de `data/sesiones/` para clasificar
  materiales o tipos de contacto.
