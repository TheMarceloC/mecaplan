"""
Descarga UNA secuencia del dataset Sparsh-X (Digit 360) y la grafica.

El dataset completo son ~89.5 GB en pocos .tar.gz grandes (19–39 GB). Este
script NO baja todo: abre un archivo en streaming y se detiene en cuanto saca
la primera secuencia con datos reales (unos cientos de MB), luego la grafica.

Sirve para que Programación tenga una demostración con datos REALES del sensor
sin tener la placa ni bajar el dataset entero.

Uso:
    python descargar_secuencia.py
    python descargar_secuencia.py --archivo d360/20241126-fre-trash_picker.tar.gz
    python descargar_secuencia.py --limite-mb 1200

Dataset: https://huggingface.co/datasets/facebook/sparsh-x-dataset  (CC BY-NC 4.0)
Hay que citar a Meta/GelSight y es solo para uso académico, no comercial.
"""

import argparse
import io
import os
import pickle
import posixpath
import tarfile

import numpy as np
import requests
import yaml

BASE = "https://huggingface.co/datasets/facebook/sparsh-x-dataset/resolve/main/"
# Archivo grande por defecto: el más chico de los que tienen datos reales.
ARCHIVO_DEFECTO = "d360/20241126-fre-trash_picker.tar.gz"
SALIDA = os.path.join(os.path.dirname(__file__), "data", "secuencia")


class LimiteAlcanzado(Exception):
    pass


class LectorConLimite:
    """Envuelve el flujo de descarga para contar MB y cortar si se pasa del límite."""

    def __init__(self, fuente, limite_bytes):
        self.fuente = fuente
        self.limite = limite_bytes
        self.leidos = 0
        self._ultimo_aviso = 0

    def read(self, n):
        if self.leidos >= self.limite:
            raise LimiteAlcanzado()
        datos = self.fuente.read(n)
        self.leidos += len(datos)
        mb = self.leidos // (1024 * 1024)
        if mb >= self._ultimo_aviso + 25:
            self._ultimo_aviso = mb
            print(f"  descargados ~{mb} MB…", flush=True)
        return datos


def descargar_archivo(archivo: str) -> str:
    """Baja el .tar.gz completo (reanudable) y devuelve la ruta local.

    OJO: los archivos con datos reales pesan 19–39 GB. El dataset NO ofrece una
    secuencia suelta pequeña: los chiquitos son solo metadatos. Esto baja uno
    entero una vez; después se puede sacar cuantas secuencias se quiera sin red.
    """
    from huggingface_hub import hf_hub_download

    print(f"Descargando {archivo} (reanudable). Es grande: 19–39 GB.")
    return hf_hub_download(
        repo_id="facebook/sparsh-x-dataset",
        filename=archivo,
        repo_type="dataset",
        local_dir=os.path.join(os.path.dirname(__file__), "data", "descargas"),
    )


def extraer_primera_secuencia(ruta_tar: str) -> str:
    """Saca del .tar.gz local la primera secuencia con datos reales."""
    os.makedirs(SALIDA, exist_ok=True)
    with tarfile.open(ruta_tar, "r:gz") as tar:
        for miembro in tar:
            if miembro.issym() or miembro.islnk() or not miembro.isfile():
                continue
            if not posixpath.basename(miembro.name).endswith(".pickle"):
                continue
            datos = tar.extractfile(miembro).read()
            carpeta = posixpath.basename(posixpath.dirname(miembro.name))
            partes = carpeta.split("-")
            etiquetas = (
                {"object": partes[1], "action": partes[2], "surface": "-".join(partes[3:])}
                if len(partes) >= 4
                else {}
            )
            with open(os.path.join(SALIDA, "data.pickle"), "wb") as f:
                f.write(datos)
            with open(os.path.join(SALIDA, "etiquetas.yaml"), "w", encoding="utf-8") as f:
                yaml.safe_dump({"secuencia": carpeta, **etiquetas}, f, allow_unicode=True)
            print(f"Secuencia extraída: {carpeta}")
            return SALIDA
    raise SystemExit("No encontré ninguna secuencia con datos reales en el archivo.")


def descargar_una_secuencia_streaming(archivo: str, limite_mb: int) -> str:
    """Alternativa sin bajar todo: streaming con tope. En ESTE dataset los datos
    reales quedan muy adentro del .tar.gz, así que casi siempre toca subir mucho
    el límite; se deja como opción, no como camino recomendado."""
    url = BASE + archivo
    print(f"Streaming de {archivo} con tope de {limite_mb} MB…")
    respuesta = requests.get(url, stream=True, timeout=60)
    respuesta.raise_for_status()
    lector = LectorConLimite(respuesta.raw, limite_mb * 1024 * 1024)

    os.makedirs(SALIDA, exist_ok=True)
    try:
        with tarfile.open(fileobj=lector, mode="r|gz") as tar:
            for miembro in tar:
                # El archivo de datos real termina en ".pickle" (p. ej. knife-cut-cake.pickle).
                # El "data.pickle" del esqueleto es un enlace simbólico: se salta.
                if miembro.issym() or miembro.islnk() or not miembro.isfile():
                    continue
                if not posixpath.basename(miembro.name).endswith(".pickle"):
                    continue
                datos = tar.extractfile(miembro).read()
                carpeta = posixpath.basename(posixpath.dirname(miembro.name))
                # La carpeta codifica las etiquetas: <indice>-<objeto>-<accion>-<superficie>
                partes = carpeta.split("-")
                etiquetas = {}
                if len(partes) >= 4:
                    etiquetas = {
                        "object": partes[1],
                        "action": partes[2],
                        "surface": "-".join(partes[3:]),
                    }
                with open(os.path.join(SALIDA, "data.pickle"), "wb") as f:
                    f.write(datos)
                with open(os.path.join(SALIDA, "etiquetas.yaml"), "w", encoding="utf-8") as f:
                    yaml.safe_dump({"secuencia": carpeta, **etiquetas}, f, allow_unicode=True)
                print(f"Secuencia obtenida: {carpeta}")
                print(f"  (~{lector.leidos // (1024 * 1024)} MB descargados en total)")
                return SALIDA
    except LimiteAlcanzado:
        print(f"Se alcanzó el límite de {limite_mb} MB sin completar una secuencia.")
    finally:
        respuesta.close()

    raise SystemExit(
        "No encontré una secuencia con datos reales. Si usaste un archivo chico "
        "(solo metadatos), prueba uno grande con --archivo, o sube --limite-mb."
    )


def cargar_pickle(ruta: str):
    try:
        import pandas as pd

        return pd.read_pickle(ruta)
    except Exception:
        with open(ruta, "rb") as f:
            return pickle.load(f)


def explorar(obj, prefijo="", prof=0) -> None:
    """Imprime la estructura del pickle para saber qué contiene y cómo graficarlo."""
    if prof > 3:
        return
    if isinstance(obj, dict):
        for k in list(obj)[:16]:
            v = obj[k]
            extra = getattr(v, "shape", "")
            if isinstance(v, (list, tuple)):
                extra = f"len={len(v)}"
            print(f"{prefijo}{k!r} -> {type(v).__name__} {extra}")
            explorar(v, prefijo + "    ", prof + 1)
    elif isinstance(obj, (list, tuple)) and obj:
        print(f"{prefijo}[0] de {len(obj)} -> {type(obj[0]).__name__} "
              f"{getattr(obj[0], 'shape', '')}")
        explorar(obj[0], prefijo + "    ", prof + 1)


def graficar(ruta_carpeta: str) -> None:
    import matplotlib.pyplot as plt

    ruta_meta = os.path.join(ruta_carpeta, "metadata.yaml")
    if not os.path.exists(ruta_meta):
        ruta_meta = os.path.join(ruta_carpeta, "etiquetas.yaml")
    with open(ruta_meta, "rb") as f:
        meta = yaml.safe_load(f)
    print("\n=== Etiquetas de la secuencia ===")
    for clave in ("object", "action", "surface"):
        print(f"  {clave}: {meta.get(clave)}")

    datos = cargar_pickle(os.path.join(ruta_carpeta, "data.pickle"))
    print("\n=== Estructura del data.pickle ===")
    explorar(datos)

    # Busca, de forma tolerante, señales típicas para graficarlas.
    señales = buscar_señales(datos)
    if not señales:
        print("\nNo reconocí señales automáticamente. Revisa la estructura de arriba "
              "y ajustamos `buscar_señales` para este formato.")
        return

    n = len(señales)
    fig, ejes = plt.subplots(n, 1, figsize=(9, 2.2 * n))
    if n == 1:
        ejes = [ejes]
    for eje, (titulo, tipo, valor) in zip(ejes, señales):
        if tipo == "imagen":
            eje.imshow(valor)
            eje.set_axis_off()
        else:
            eje.plot(np.asarray(valor).reshape(-1)[:20000])
        eje.set_title(titulo, fontsize=10, loc="left")
    fig.suptitle(f"{meta.get('object')} · {meta.get('action')} · {meta.get('surface')}")
    plt.tight_layout()
    salida_png = os.path.join(ruta_carpeta, "resumen.png")
    plt.savefig(salida_png, dpi=110)
    print(f"\nGuardé un resumen en {salida_png}")
    plt.show()


def buscar_señales(datos):
    """Recorre el pickle y arma una lista (titulo, tipo, valor) con lo graficable."""
    señales = []

    def recorrer(o, camino=""):
        if len(señales) >= 4:
            return
        if isinstance(o, dict):
            for k, v in o.items():
                recorrer(v, f"{camino}/{k}")
        elif isinstance(o, (list, tuple)) and o:
            recorrer(o[0], camino + "[0]")
        else:
            arr = a_array(o)
            if arr is None:
                return
            c = camino.lower()
            if arr.ndim >= 2 and arr.shape[-1] in (1, 3) and arr.shape[0] > 8:
                señales.append((camino, "imagen", normaliza_imagen(arr)))
            elif "img" in c and arr.ndim >= 2:
                señales.append((camino, "imagen", normaliza_imagen(arr)))
            elif arr.ndim == 1 and arr.size > 10:
                tipo = "mic" if "mic" in c else "imu" if "imu" in c else "presión" if "pres" in c else "señal"
                señales.append((f"{camino} ({tipo})", "serie", arr))

    recorrer(datos)
    return señales


def a_array(o):
    try:
        arr = np.asarray(o)
        return arr if arr.dtype != object and arr.size else None
    except Exception:
        return None


def normaliza_imagen(arr):
    arr = np.squeeze(arr)
    if arr.ndim == 3 and arr.shape[0] in (1, 3) and arr.shape[2] not in (1, 3):
        arr = np.moveaxis(arr, 0, -1)
    arr = arr.astype("float32")
    arr -= arr.min()
    if arr.max() > 0:
        arr /= arr.max()
    return arr


def main():
    ap = argparse.ArgumentParser(description="Baja una secuencia del dataset Sparsh-X")
    ap.add_argument("--archivo", default=ARCHIVO_DEFECTO, help="Ruta del .tar.gz en el repo")
    ap.add_argument("--limite-mb", type=int, default=1500,
                    help="Solo con --streaming: corta la descarga a estos MB")
    ap.add_argument("--streaming", action="store_true",
                    help="No baja todo; intenta sacar 1 secuencia en vuelo (los datos van muy adentro)")
    ap.add_argument("--solo-graficar", action="store_true",
                    help="No baja nada; grafica la secuencia ya guardada en data/secuencia")
    args = ap.parse_args()

    if args.solo_graficar:
        carpeta = SALIDA
    elif args.streaming:
        carpeta = descargar_una_secuencia_streaming(args.archivo, args.limite_mb)
    else:
        ruta_tar = descargar_archivo(args.archivo)
        carpeta = extraer_primera_secuencia(ruta_tar)
    graficar(carpeta)


if __name__ == "__main__":
    main()
