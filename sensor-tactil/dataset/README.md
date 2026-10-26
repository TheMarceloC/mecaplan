# Datos reales del Digit 360 (dataset Sparsh-X)

Script para traer datos **reales** del sensor Digit 360 (sin tener la placa) y
graficarlos, usando el dataset público **Sparsh-X** de Meta.

Dataset: https://huggingface.co/datasets/facebook/sparsh-x-dataset · licencia
**CC BY-NC 4.0** (uso académico, con atribución, no comercial).

## La realidad del dataset (importante)

- El dataset completo son **~89.5 GB**, empaquetado en pocos `.tar.gz` **grandes
  (19–39 GB)**.
- Los dos archivos chiquitos (2.4 MB y 626 KB) son **solo metadatos con enlaces
  simbólicos**: no traen datos usables.
- **No existe una "secuencia suelta" pequeña para bajar.** Para tener datos
  reales hay que descargar un archivo grande (el más chico es ~19.6 GB).
- Cada secuencia trae: imagen táctil (30 Hz), micrófono (48 kHz ×2), IMU (400 Hz)
  y presión (200 Hz), con etiquetas de **objeto · acción · superficie**.

## Uso recomendado (descarga reanudable)

Baja un archivo completo una vez (se puede reanudar si se corta) y saca de él la
primera secuencia para graficarla:

```bash
pip install huggingface_hub pandas pyyaml numpy matplotlib requests
python descargar_secuencia.py --archivo d360/20241126-fre-trash_picker.tar.gz
```

Después, para volver a graficar sin bajar nada:

```bash
python descargar_secuencia.py --solo-graficar
```

## Alternativa sin bajar todo (limitada)

Hay un modo `--streaming` que intenta sacar una secuencia en vuelo con un tope de
MB. En **este** dataset los datos reales quedan muy adentro del `.tar.gz`, así que
normalmente no alcanza con unos cientos de MB. Úsese solo como experimento:

```bash
python descargar_secuencia.py --streaming --limite-mb 4000
```

## Recomendación para el Avance 1

Bajar 19.6 GB puede no valer la pena solo para el primer avance. Para empezar sin
esperar, usen el **simulador y el grabador** de la carpeta de arriba
(`sensor-tactil/`), que ya dan datos y gráficas. El dataset Sparsh-X conviene
como **extensión**: cuando tengan disco y tiempo, para comparar con datos reales
o entrenar la IA. No condicionen la primera demostración a bajar el dataset.
