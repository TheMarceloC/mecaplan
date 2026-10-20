# Publicar MecaPlan 0.4.0 en Vercel + Supabase

Estado verificado el 20 de octubre de 2026: el responsable creó Supabase, se comprobó su conexión TLS con el certificado CA y se copiaron 27 usuarios y 4 proyectos con verificación de contenido. La matriz original quedó asociada al enlace de OneDrive proporcionado por el responsable; la copia local permanece en el respaldo. La publicación en Vercel sigue pendiente. No volver a ejecutar la importación sobre este destino ocupado.

## Qué se conserva

- El inicio de sesión de MecaPlan, sus contraseñas cifradas con hash, el cambio obligatorio inicial, roles y permisos. No se utiliza Supabase Auth: no hay que recrear los estudiantes en Authentication.
- PostgreSQL almacena usuarios, proyectos, sesiones nuevas, evaluaciones privadas, versiones, auditoría y referencias. Las sesiones y enlaces de recuperación locales no se migran: cada persona vuelve a iniciar sesión.
- OneDrive institucional conserva los documentos. Supabase Storage no se utiliza. El servidor de Vercel no escribe SQLite ni adjuntos en disco.
- Las seis categorías del tablero siguen siendo Pendiente, En progreso, Bloqueada, En revisión, Hecha y Cancelada.

La revisión actual confirma 27 cuentas, 4 proyectos y ningún adjunto local pendiente. El acceso al documento OneDrive desde otras cuentas institucionales debe comprobarlo el responsable.

## 1. Configurar y verificar OneDrive en local

Decisión actual: subir los documentos manualmente a las carpetas de OneDrive existentes y asociar sus enlaces en MecaPlan. No se requiere registrar una aplicación Microsoft ni configurar OAuth para este modo. Las variables MICROSOFT_* se dejan vacías; ONEDRIVE_REDIRECT_URI y ONEDRIVE_TOKEN_KEY no se requieren mientras no exista una conexión guardada. La comprobación de despliegue admite este modo.

Antes de migrar los datos, la matriz original de Digit360 debe subirse manualmente a OneDrive y su referencia local debe sustituirse por el enlace del archivo, conservando el respaldo local y las referencias de evidencias. Añadir otro enlace sin sustituir la referencia local no elimina ese requisito. Las instrucciones siguientes de conexión automática son opcionales.

Sigue ONEDRIVE.md. Registra en Microsoft Entra una aplicación Web de la cuenta UNITEC. Para la conexión inicial utiliza http://localhost:3000 y el callback http://localhost:3000/api/onedrive/callback. Abre la aplicación desde ese mismo origen. Añade también el callback HTTPS del dominio definitivo que tendrá Vercel.

Conecta OneDrive con un superusuario. En Digit360 → OneDrive y archivos, utiliza Migrar para la matriz original. La aplicación verifica la copia antes de cambiar el enlace y conserva los documentos externos al eliminar proyectos.

Conserva la clave de cifrado de tokens. Si ONEDRIVE_TOKEN_KEY ya está en .env.local, usa exactamente ese valor en Vercel. Si se generó automáticamente, los 32 bytes están en data/onedrive-token-key.bin: el responsable debe convertirlos a base64 e introducirlos como secreto de Vercel. No generar una clave diferente después de conectar; la migración verifica que pueda descifrarse el caché existente.

## 2. Preparar Supabase

Crea un proyecto de Supabase y conserva su contraseña de base de datos de forma privada. En Connect copia la conexión Transaction pooler para el servidor. No inventar el host del pooler. Node 24 y el cliente pg están incluidos en la preparación; no usan prepared statements con nombre.

Copia .env.vercel.example a .env.cloud.local, archivo ignorado por Git y Vercel. Completa DATABASE_URL con la conexión del pooler y los campos de Microsoft y cifrado. DATABASE_SSL_CA permite aportar el certificado CA de Supabase si la conexión lo requiere; la verificación TLS permanece activada.

Para aplicar el esquema puedes añadir a .env.cloud.local DATABASE_ADMIN_URL con la conexión directa o de sesión destinada a migraciones. El comando de esquema usa esa conexión cuando existe. No es necesario copiar DATABASE_ADMIN_URL a Vercel.

Desde la carpeta mecaplan:

```powershell
pnpm run cloud:setup
pnpm run cloud:setup --apply
```

El primer comando muestra el archivo SQL sin conectarse. El segundo aplica supabase/migrations/202610200001_mecaplan.sql. También puede ejecutarse ese SQL en el SQL Editor del proyecto. Es aditivo y transaccional; no importa datos ni crea estudiantes.

El esquema mecaplan es privado, con RLS habilitado y sin permisos para anon/authenticated. No lo añadas a los esquemas expuestos por Data API. La conexión PostgreSQL del servidor puede acceder a las tablas; la separación por proyecto y la exclusividad de las evaluaciones se verifican en las API de MecaPlan. No se afirma que auth.uid() aplique las reglas de los usuarios de MecaPlan, porque la autenticación existente es propia.

## 3. Copiar los datos verificados

Primero revisa el origen sin escribir en Supabase:

```powershell
pnpm run cloud:migrate --source=data/mecaplan.sqlite
```

Si ready es false, termina la migración de los archivos a OneDrive. Cuando esté listo, detén el servidor local para hacer el corte; crea un respaldo privado nuevo con pnpm run backup en una carpeta nueva. Conserva también código, clave de cifrado y configuración.

```powershell
pnpm run cloud:migrate --source=data/mecaplan.sqlite --apply
pnpm run cloud:check --database
```

La copia usa una transacción, verifica el contenido de las tablas y rechaza un destino ocupado. No existe una opción que sobrescriba una instalación remota. Se conservan IDs, hashes de contraseña, banderas, membresías, alias, fechas, notas privadas e historial. No se copian sesiones, vistas previas de importación, intentos de acceso ni estados OAuth temporales. Se requiere iniciar sesión nuevamente.

No reutilices un respaldo tomado antes de migrar la matriz: mantendría una referencia local. Guarda el respaldo original por separado para poder volver al entorno anterior. Para respaldar PostgreSQL posteriormente utiliza una exportación privada con pg_dump y conserva la clave de cifrado junto a su procedimiento de recuperación.

## 4. Configurar Vercel

Importa el código desde tu repositorio. Si el repositorio contiene una carpeta superior, selecciona mecaplan como Root Directory. Usa Next.js y Node.js 24.x. vercel.json define instalación con lockfile, comprobación del destino y compilación. No ejecutar seed:demo ni import:digit360 en los comandos de construcción.

Configura en Settings → Environment Variables los campos de .env.vercel.example. Ningún secreto debe llevar NEXT_PUBLIC_. Ajusta ONEDRIVE_REDIRECT_URI al dominio HTTPS definitivo y registra exactamente esa URI en Microsoft Entra. Mantén ENABLE_DEMO=0. No establecer BUILD_OUT, MECAPLAN_DATA_DIR ni DATABASE_ADMIN_URL en Vercel.

La construcción ejecuta build:vercel, que comprueba configuración, esquema, cuenta docente y ausencia de adjuntos locales antes de compilar. El despliegue se detiene si falta alguno de esos requisitos.

Las vistas previas deben usar otro proyecto o rama de Supabase y datos sintéticos; no conectar una vista previa de desarrollo a la base real del curso. Conserva los secretos de Production separados de Preview.

## 5. Comprobación posterior

En el dominio final verifica: inicio de sesión/cambio obligatorio; proyectos e integrantes; Kanban y filtros; edición con evidencia y revisión cruzada; importación Excel; acceso exclusivo del ingeniero a evaluaciones y versiones; apertura y subida de un documento OneDrive. No dar por probada la integración real hasta terminar estos pasos.

La subida a través de la aplicación se limita a 3 MiB en el modo PostgreSQL, dejando margen al límite de petición de Vercel. El límite se muestra en la interfaz. Para documentos mayores, subir directamente a OneDrive y asociar el enlace. Los Excel grandes deben dividirse para importarlos. El cuerpo JSON de operaciones se limita a 4.000.000 bytes en este modo.

## Referencias verificadas

- [Conexiones y pooler de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres): transaction mode para funciones y conexión directa para migraciones.
- [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security): acceso denegado sin políticas aplicables; la app utiliza un esquema privado y permisos de servidor.
- [Límites de Vercel Functions](https://vercel.com/docs/functions/limitations): 4,5 MB para petición/respuesta; por ello se reduce el tamaño de subida.
- [Versiones Node de Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): Node 24.x disponible.
- [TLS en node-postgres](https://node-postgres.com/features/ssl): no mezclar opciones sslmode de la URL con una configuración de CA que deba conservarse.

Las pruebas locales usan SQLite y PostgreSQL mediante PGlite. No sustituyen la prueba de conectividad TLS/pooler con el proyecto Supabase real ni el consentimiento institucional de Microsoft.
