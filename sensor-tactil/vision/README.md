# Visión táctil (cámara simulada + detección de contacto)

La parte "visual" del sensor, **sin cámara ni gel**: una cámara **simulada**
genera imágenes de la yema iluminada por tres LEDs (rojo, verde y azul), y la
detección de contacto las procesa como lo hará con la cámara real.

Es el principio del Digit/GelSight: cuando algo presiona el gel, su superficie
se hunde y cada LED la ilumina distinto, produciendo una "huella" de colores.

## Archivos

| Archivo | Para qué |
|---|---|
| `camara_simulada.py` | Genera imágenes falsas de la yema. `FuenteSimulada` (sin hardware) y `FuenteCamara` (USB real) se usan igual: `leer()`. |
| `deteccion_contacto.py` | Guarda una imagen de **referencia** del gel en reposo y, restándola, detecta dónde y cuánto se toca. |
| `demo_contacto.py` | Une las dos cosas y muestra en vivo: gel, diferencia y contacto marcado. |
| `materiales.py` | Cinco materiales simulados, cada uno con su huella: liso, rugoso, filo, tela, blando. |
| `clasificador.py` | Genera un dataset, saca rasgos de cada huella y entrena un modelo para reconocer el material. |
| `demo_clasificador.py` | Demo en vivo: toca materiales al azar y muestra el real vs. el predicho. |

## Cómo probarlo (sin hardware)

```bash
pip install opencv-python numpy
python demo_contacto.py
python demo_contacto.py --forma borde
python demo_contacto.py --forma puntos
```

Se abre una ventana con tres paneles (gel · diferencia · contacto). Cada 4 s hay
un "toque" que se desliza. Cerrar con la tecla **Q**.

## Con la cámara real (el día que exista)

```bash
python demo_contacto.py --camara 0
```

No cambia nada más: la detección usa la misma imagen de referencia + resta.

## Reconocer el material (IA)

Primero se entrena una vez (genera el dataset, entrena y guarda el modelo):

```bash
pip install opencv-python numpy scikit-learn
python clasificador.py --entrenar
```

Imprime el acierto y una matriz de confusión. Luego, la demo en vivo:

```bash
python demo_clasificador.py
```

Cada ~2 s toca un material al azar y muestra el real vs. el predicho (verde si
acierta). Cerrar con **Q**.

## Qué se puede y qué no

- **Sirve para** desarrollar y probar todo el software de visión (referencia,
  resta, detección de contacto, centro, área) sin esperar la placa ni el gel.
- **No sirve para** medir el sensor real: la "fuerza" es una aproximación de
  cuánto cambió la imagen, no newtons. Eso exige la yema real y calibración.
- El acierto alto del clasificador (≈99 %) es porque las huellas simuladas son
  muy limpias y distintas. **Con datos reales será más bajo**: habrá ruido,
  materiales parecidos y menos ejemplos. Lo valioso aquí es que **el flujo de la
  IA ya está armado y probado**, listo para datos reales.

## Siguiente paso

Grabar el contacto junto a presión, IMU y audio en la misma sesión (ver
`sensor-tactil/`), para tener imagen + sensores juntos y alimentar la IA.
