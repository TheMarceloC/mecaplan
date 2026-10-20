# Estado vigente — MecaPlan 0.4.0

20 de octubre de 2026. La petición actual añade Tablero Kanban al menú principal y prepara Vercel + Supabase. El usuario confirmó OneDrive como almacenamiento de documentos.

## Disponible

Kanban principal con las seis categorías existentes y las mismas reglas de estado/permisos. Se conservan las funciones y correcciones de 0.3.2. Backend asíncrono compatible con SQLite local y PostgreSQL de Supabase; esquema privado, transacciones, CAS de proyectos y revisión de actividades, sesiones persistidas y bloqueo entre instancias.

Preparación de despliegue: vercel.json, .env.vercel.example, esquema en supabase/migrations, herramientas cloud:setup, cloud:migrate y cloud:check, exclusiones de archivos privados y guía VERCEL_SUPABASE.md. La demo se deshabilita y oculta al utilizar PostgreSQL/Vercel.

## Datos y corte

La base local conserva 4 proyectos y 27 usuarios. El 20 de octubre de 2026 se copiaron al proyecto Supabase configurado por el responsable; la herramienta verificó el contenido de todas las tablas migradas. El respaldo previo 0.3.2 está en outputs/Actualizacion_0.4.0_2026-10-20/backup-0.3.2 y los respaldos de este corte están en backups/; todos son privados.

El responsable eligió enlaces manuales de OneDrive, sin OAuth ni subida automática. Se sustituyó la referencia local de la matriz Digit360 por el enlace del archivo proporcionado, conservando su ID y el binario local. La migración no tiene adjuntos locales pendientes y conserva hashes/roles/datos privados; las sesiones no se copian. No repetir la importación: el destino ya está ocupado. Evitar editar simultáneamente el SQLite y Supabase; no se sincronizan.

## Pendiente externo

Supabase está conectado y cloud:check --database pasó contra el servicio real: 15 tablas con RLS habilitado, cuenta docente activa y sin referencias locales. .env.cloud.local contiene la conexión y el certificado CA; es privado y está excluido de Git. Falta subir el código a GitHub, configurar Vercel y validar la aplicación desplegada. Microsoft OAuth no se requiere para los enlaces manuales. No se verificó el contenido ni los permisos del documento OneDrive desde otra cuenta.

Las pruebas automatizadas PostgreSQL usan PGlite; además, se verificó la conexión TLS y migración al Supabase real. Los contextos descargados y los Excel siguen requiriendo descarga/reimportación; no hay sincronización automática. Correo, PDF dedicado, horas e importación automática de propuestas permanecen fuera de esta ampliación.

