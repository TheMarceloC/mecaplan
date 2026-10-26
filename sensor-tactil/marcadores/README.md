# Domo con marcadores (la idea que quedó)

Simulador y software del sensor tipo **TacTip**: un domo de silicona con puntos
oscuros en su cara interna, iluminado por dentro y visto por una cámara USB
(640×480). Al presionar, los marcadores se desplazan; el software los sigue y
calcula contacto, ubicación, zona, fuerza relativa y cizalla.

## Archivos

| Archivo | Para qué |
|---|---|
| `domo_simulado.py` | Genera lo que vería la cámara: 217 marcadores en anillos, que se abren al presionar. `FuenteDomo` hace toques al azar. Opción de luz exterior (domo translúcido). |
| `seguimiento.py` | Detecta los marcadores, los sigue cuadro a cuadro y calcula el campo de desplazamientos → contacto, ubicación (px y mm), zona, fuerza relativa y cizalla. |
| `demo_marcadores.py` | Demo en vivo con flechas de desplazamiento y un panel de resultados. Funciona con el simulador o con la cámara USB real. |
| `evaluar.py` | Corre en simulación las pruebas de aceptación propuestas. |

## Cómo probarlo

```bash
pip install opencv-python numpy
python demo_marcadores.py
python demo_marcadores.py --luz-exterior
python evaluar.py
```

En la demo: **Q** cierra y **R** vuelve a tomar la referencia (sin tocar el
domo). Con la cámara real: `python demo_marcadores.py --camara 0`.

## Resultados en simulación

| Prueba | Meta propuesta | Luz controlada | Con luz exterior |
|---|---|---|---|
| A. Contacto | ≥ 18 de 20 | 20/20, 0 falsas en 10 s | 20/20, 0 falsas en 10 s |
| B. Zonas | ≥ 8 de 10 por zona | 10/10 en las tres | 10/10 en las tres |
| C. Ubicación | ≤ 3 mm | media 0.33 mm, máx. 1.48 mm | media 0.36 mm, máx. 1.51 mm |
| D. Carga | crece con la fuerza | 0.31 < 0.64 < 2.45 px | 0.33 < 0.65 < 2.46 px |

**Lectura:** el seguimiento por **posición** de los marcadores tolera bien los
cambios de luz y la sombra de la mano, porque no depende del brillo sino de
dónde está cada punto. Es una ventaja real frente a comparar intensidades.

## Lo que la simulación NO cubre (importante)

Estos números son **demasiado buenos** porque el modelo es ideal:

- Patrón de marcadores perfecto y proyección plana (sin curvatura del domo).
- Desplazamiento suave e inventado: sin histéresis, relajación ni deriva de la
  silicona, y sin variación entre membranas.
- La luz exterior es una mancha y una sombra; en un domo translúcido real
  también se verían **texturas y bordes de afuera**, que pueden confundirse con
  marcadores.
- La escala px → mm es supuesta (`PX_POR_MM = 11`); con el domo real hay que
  calibrarla.
- La "fuerza" es **relativa** (px). En newtons solo después de calibrar con pesas.

Sirve para dejar listo el **software y el procedimiento de prueba**. Los
resultados válidos solo salen del domo real.

## Para pasar al hardware real

1. Elegir la cámara y medir su enfoque mínimo.
2. Ajustar `umbral`, `area_min` y `area_max` de `SeguidorMarcadores` a la imagen
   real.
3. Calibrar `PX_POR_MM` con una regla o una plantilla.
4. Calibrar la fuerza con pesas (100, 200 y 500 g).
