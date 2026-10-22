# Proyecto MEC402 · Diseño Mecatrónico

Repositorio del equipo para el proyecto de la clase (Digit 360). Reúne dos
partes, cada una en su carpeta:

## 📁 `mecaplan/`

**MecaPlan** — aplicación web para gestionar el proyecto: actividades, equipos y
RACI, cronograma y ruta crítica (CPM), presupuesto y gastos, riesgos, bitácoras
y evaluación. Hecha con Next.js, React y TypeScript.

Su documentación está en [`mecaplan/README.md`](mecaplan/README.md).

## 📁 `sensor-tactil/`

**Software del sensor táctil (Digit 360)** — la parte de programación del
sensor. Incluye el protocolo de datos, un **simulador** que hace de placa
(presión, IMU y micrófono), el receptor con gráficas en vivo y grabación de
sesiones, y el esqueleto del firmware para la ESP32.

> Es software de prueba con simulador: **corre sin placa**. Cuando lleguen las
> placas, el mismo código se conecta a la ESP32 real.

Cómo correrlo y qué hace cada archivo: [`sensor-tactil/README.md`](sensor-tactil/README.md).

## Ramas

- `codex/vercel-supabase` — rama principal de MecaPlan.
- `mejoras-interfaz` — mejoras de interfaz de MecaPlan.
- `progra-digit360` — programación del sensor Digit 360 (esta rama).
