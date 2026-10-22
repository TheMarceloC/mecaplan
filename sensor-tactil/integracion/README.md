# Sesión integrada (imagen + presión + IMU + audio)

Junta las dos partes del sensor en una sola grabación: un mismo **toque** genera
a la vez la imagen de la yema, la presión, la vibración de la IMU y el sonido del
micrófono, **sincronizados** por un mismo reloj. Todo se guarda en una carpeta,
con un formato parecido al del dataset Digit 360.

Es simulado (sin placa ni cámara), pero deja listo el formato y el flujo para
grabar imagen + sensores juntos y alimentar la IA.

## Cómo grabar

```bash
pip install opencv-python numpy pyyaml
python sesion_integrada.py
python sesion_integrada.py --material rugoso --segundos 12 --ver
```

Con `--ver` se muestra la cámara mientras graba. Material: uno de
`liso, rugoso, filo, tela, blando`.

## Qué queda en la carpeta

```
data/sesiones_integradas/AAAAmmdd-HHMMSS/
    video.avi      imagen de la yema (30 fps)
    presion.csv    ts_ms, presion_kpa, temp_c      (100 Hz)
    imu.csv        ts_ms, ax, ay, az, gx, gy, gz   (100 Hz)
    audio.wav      micrófono (16 bits, mono, 16 kHz)
    metadata.yaml  objeto/acción/superficie, modalidades, tasas y duración
```

Las cuatro modalidades cubren la misma duración; el toque (presión arriba,
vibración, sonido y huella en la imagen) ocurre en el mismo instante en todas.

## Qué se puede y qué no

- **Sirve para** desarrollar el registro multimodal y la demo integrada, y para
  preparar los datos de la IA, sin esperar la placa.
- **No sirve para** medir el sensor real ni para afirmar sincronía física exacta:
  aquí los canales salen de un mismo reloj simulado. En el sensor real hay que
  medir y alinear los tiempos de verdad.

La carpeta `data/` está en el `.gitignore`: las grabaciones no se suben al repo.
