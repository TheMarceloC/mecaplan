# Actualización local a 0.3.2

La versión anterior era 0.3.0. Se conserva el código original y un respaldo consistente de SQLite, adjuntos y clave de tokens en outputs/Actualizacion_0.3.2_2026-10-19/backup-0.3.0. El respaldo es privado y no debe compartirse ni publicarse.

Antes de activar la actualización se restauró una copia independiente, se abrieron sus datos con el código nuevo y se compararon íntegramente usuarios, proyectos, evaluaciones, sesiones, conexiones y auditoría con el respaldo. Se conservaron 27 usuarios y 4 proyectos, sin cambios en contraseñas, membresías, actividades ni fechas. SQLite aprobó integrity_check y el diagnóstico de estructura no encontró problemas. Las tablas de historial/retención/operaciones se agregan de forma transaccional.

Para futuras actualizaciones: detener el servidor, crear un respaldo con pnpm run backup en una carpeta nueva, conservar también código/configuración y los archivos privados de importación/credenciales, restaurar primero en una carpeta de prueba y ejecutar diagnose. No ejecutar seeds o importadores históricos sobre datos existentes para migrar.

El respaldo de instalación incluye la base, uploads y onedrive-token-key.bin cuando existe. Los archivos auxiliares de credenciales y la configuración .env.local requieren copia privada separada; no debe copiarse indiscriminadamente data/artifact-work, que puede contener dependencias y enlaces de directorio.

La restauración de JSON desde la interfaz y una migración SQLite son operaciones distintas. Los JSON restaurados requieren nueva aprobación de hitos por el ingeniero. La migración de esta instalación conserva el contenido original de los proyectos.
