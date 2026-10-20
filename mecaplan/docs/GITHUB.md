# Commits y simulación local

## Código de MecaPlan para Vercel

Repositorio de publicación: https://github.com/TheMarceloC/mecaplan. La aplicación está en la carpeta mecaplan; seleccionarla como Root Directory al importar en Vercel. La rama inicial preparada es codex/vercel-supabase. No se incluyen bases, respaldos, configuración privada ni el Excel real del curso.

Esto publica el código de la aplicación. La sincronización de actividades mediante webhooks de los proyectos sigue siendo una función local de prueba, descrita a continuación. Puedes guardar `organizacion/repositorio` en Agentes, plantillas y respaldo como configuración local.

## Convención de mensajes

- `DIG-12 agrega lectura del sensor` vincula el commit y propone/inicia En progreso si estaba Pendiente.
- `DIG-12 #review` deja una solicitud pendiente de En revisión.
- `DIG-12 #done` deja una solicitud pendiente de Hecha. La aprobación conserva las reglas de evidencia y revisión cruzada.
- También se reconoce `ACT-12` para otros proyectos. Un mensaje puede mencionar varias actividades.

Para empezar con GitHub Desktop: agrega tu carpeta como repositorio, revisa los archivos modificados, escribe el mensaje con el código de actividad, guarda el commit y usa Push origin cuando corresponda. No incluyas contraseñas, bases de datos locales ni el libro de accesos. Una organización posible es `/electronica`, `/firmware`, `/cad` y `/docs`. Para binarios CAD grandes, configura Git LFS con tu equipo antes de agregarlos; no convierte los archivos ya guardados en el historial automáticamente.

## Probar sin internet

```powershell
npm run test:webhook
```

El script llama al handler real con eventos sintéticos firmados y un secreto aleatorio temporal. Comprueba firma inválida, push, pull request, deduplicación, sugerencias y modo deshabilitado. Crea y elimina un proyecto temporal y no realiza peticiones a GitHub.

El endpoint `/api/github/webhook` responde 503 por defecto. Para una prueba HTTP local explícita, usa `ENABLE_LOCAL_WEBHOOK=1` y `GITHUB_WEBHOOK_SECRET` de al menos 16 caracteres en el entorno del servidor. La firma es HMAC-SHA256 sobre el cuerpo exacto, enviada como `X-Hub-Signature-256: sha256=<hex>`. No registres ni compartas el secreto. Este modo local usa un secreto del entorno para la instalación; la gestión de secretos por repositorio y la sincronización real quedan para la fase 3.
