# Tablero de demostración

Junta todo en una sola pantalla, en vivo:

- la **yema** de la cámara con el **contacto** marcado,
- el **material** reconocido por la IA (en grande),
- las curvas de **presión**, **aceleración** (IMU) y **nivel de micrófono**.

Cada ~4 s toca un material al azar y, en el pico del toque, la IA lo reconoce.
Es simulado (sin placa ni cámara). Pensado para la presentación del Avance.

## Cómo usarlo

Entrena el modelo una vez (si no lo has hecho):

```bash
cd ../vision
python clasificador.py --entrenar
```

Y abre el tablero:

```bash
cd ../demo
python tablero.py
```

Cerrar con **Q**. Con `--frame 0.5` guarda un cuadro del tablero sin abrir
ventana (útil para el informe).

## Qué se puede y qué no

- **Sirve para** presentar de un vistazo todo el software funcionando junto.
- **No mide** el sensor real: los datos son simulados. Con la placa y la cámara
  reales, el mismo tablero muestra datos de verdad cambiando la fuente.
