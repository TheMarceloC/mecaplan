# Entorno compartido del panel Digit 360

Cada integrante ejecuta una copia local del mismo repositorio. La interfaz y la API se sirven desde un solo proceso de Python en `127.0.0.1`. La base de arranque usa únicamente la biblioteca estándar y sirve para desarrollo local y demostración en la computadora conectada al sensor.

## Arranque

Desde la raíz del repositorio, con Python 3.10 o posterior:

```powershell
python sensor-tactil/panel-web/backend/server.py
```

En Windows también se puede usar `py -3` en lugar de `python`. Abrir [el panel local](http://127.0.0.1:8000). Para usar otro puerto, agregar `--port 8001`.

El modo **Demo** alterna reposo, toque y liberación con una secuencia de ejemplo. **Hardware** muestra desconectado mientras se implementa el adaptador físico. El seguimiento existente de Vargas está en [marcadores](../marcadores/README.md).

## Contrato compartido

`GET /api/sensors?origen=simulado` devuelve la fuente de ejemplo. `origen=real` solicita la fuente física. Si se omite, el valor es `simulado`. La respuesta incluye `version` y `sensors`. Cada sensor tiene `id`, `nombre`, `estado`, `origen`, `timestamp` en ISO 8601 UTC y `lecturas`. Cada lectura lleva `valor` y `unidad`.

```json
{
  "version": 1,
  "sensors": [{
    "id": "tactil",
    "nombre": "Sensor táctil",
    "estado": "en_linea",
    "origen": "simulado",
    "timestamp": "2026-11-08T16:00:00.000+00:00",
    "lecturas": {
      "contacto": {"valor": true, "unidad": null},
      "zona": {"valor": "centro", "unidad": null},
      "desplazamiento": {"valor": 2.4, "unidad": "px"}
    }
  }]
}
```

Los estados acordados son `conectando`, `en_linea` y `desconectado`. Sin una muestra vigente, el tiempo y los valores se representan con `null`. El campo `origen` permite que el panel indique cómo se obtuvo cada lectura. Daniel y Marcelo coordinan cualquier cambio en este contrato.

## Flujo del equipo

Cuando la base se integre en `progra-digit360`, cada persona se actualiza desde esa rama y crea su propia rama de tarea. Ejemplo:

```bash
git fetch origin
git switch -c panel/frontend-tarjetas origin/progra-digit360
```

| Persona | Rama sugerida | Primera entrega |
| --- | --- | --- |
| Marcelo | `panel/frontend-integracion` | Estructura de la página y conexión al contrato |
| Fernando | `panel/frontend-tarjetas` | Tarjetas y gráfica de desplazamiento |
| Omar | `panel/frontend-estados` | Selector, estados de conexión y revisión de la experiencia |
| Daniel | `panel/backend-api` | Contrato y unión de las fuentes |
| Vargas | `panel/backend-hardware` | Adaptador de cámara y prueba de reconexión |
| Rafael | `panel/backend-simulacion` | Integración del simulador de marcadores y guion repetible |

Cada PR apunta a `progra-digit360`. Revisar en pareja frontend/backend si el PR cambia la API. Para cerrar una entrega, arrancar el panel, ver una lectura simulada, cambiar a Hardware y comprobar que el estado corresponde a la fuente disponible.
