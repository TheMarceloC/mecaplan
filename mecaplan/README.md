# MecaPlan 0.4.0

Gestión de proyectos de diseño mecatrónico en español. Integra las mejoras de 0.3.1 y corrige los cuatro hallazgos de la revisión independiente: ediciones obsoletas, aprobación docente al restaurar, consulta del historial privado archivado y redondeo de carga. El estado vigente es `docs/ESTADO_ENTREGA.md`; la actualización local se detalla en `docs/UPGRADE_0.3.2.md`.

## Instalar y abrir

Necesitas **Node.js 24 o superior** y **pnpm 11.25.0**. Si todavía no tienes pnpm, instala primero Node y ejecuta una vez:

```powershell
npm install --global pnpm@11.25.0
```

Extrae el ZIP completo, abre una terminal dentro de la carpeta `mecaplan` y ejecuta:

```powershell
pnpm install --frozen-lockfile
pnpm run seed:demo
pnpm run dev
```

Abre **http://127.0.0.1:3000** y pulsa **Explorar proyecto de demostración**. La demo contiene datos sintéticos; este ZIP no incluye las cuentas, sesiones ni evaluaciones reales del curso. La matriz original proporcionada se conserva en `referencias/` como documento de referencia.

En Windows también puedes abrir `INICIAR_MECAPLAN.cmd` después de instalar Node y pnpm. Instala dependencias si faltan y arranca la aplicación; conserva tus datos existentes. Detén el servidor con Ctrl+C antes de cerrar la terminal.

## Qué incluye

- Varios proyectos, equipos configurables, WBS, RACI, lista, Kanban, filtros y comentarios con historial.
- CPM, dependencias/desfases, Gantt, línea base, curva S, días hábiles y carga semanal corregida. Se puede indicar esfuerzo en días-persona separado de la duración.
- Preparación guiada del proyecto: cobertura de responsables y planificación, confirmación de duraciones y línea base.
- Entregas entre equipos: criterios, evidencia, fecha y recepción confirmada por el equipo receptor.
- Reunión semanal con compromisos, bloqueos, decisiones, mitigaciones y comparación base/plan/real, imprimible.
- Presupuesto, BOM, gastos pendientes, correcciones con historial y aprobaciones. Un comprobante de OneDrive se puede asociar desde el formulario del gasto.
- Riesgos con próxima acción y fecha, actas, bitácoras, recepción, aceptación y listas de revisión.
- Excel de nueve tablas: vista previa, referencias estables, detección de conflictos, reimportación sin duplicados y filas sin cambios.
- Contexto Markdown/JSON actual, depuración de campos libres y alcance por equipo.
- Autenticación y permisos corregidos; historial global de seguridad. Los miembros entran directamente a Mis tareas.
- Evaluación docente privada con versiones. Eliminar un proyecto conserva sus evaluaciones en el archivo exclusivo del docente.
- OneDrive con correlación OAuth ligada a sesión, PKCE, cookie compatible con retorno externo y operaciones de subida recuperables fuera de la cola de proyectos.
- Diagnóstico de datos de solo lectura, respaldo privado de instalación y restauración en carpeta nueva.

## Crear tu administrador

No hay un superusuario con contraseña conocida. En PowerShell 7:

```powershell
$env:SUPERUSER_EMAIL = 'tu-correo@ejemplo.com'
$env:SUPERUSER_NAME = 'Tu nombre'
$env:SUPERUSER_PASSWORD = Read-Host 'Contraseña de al menos 12 caracteres' -MaskInput
pnpm run seed:superuser
Remove-Item Env:SUPERUSER_PASSWORD
```

Para crear la cuenta que debe evaluar en privado, agrega antes del comando:

```powershell
$env:SUPERUSER_IS_INSTRUCTOR = '1'
```

Después elimina esa variable con `Remove-Item Env:SUPERUSER_IS_INSTRUCTOR`. Esa opción solo existe en el script local; la aplicación no permite que un alumno se convierta en docente. Si actualizas una cuenta existente mediante este script, conserva sus atributos y cierra sus sesiones previas.

En Windows PowerShell 5 puedes obtener la contraseña así:

```powershell
$taskPassword = Read-Host 'Contraseña' -AsSecureString
$env:SUPERUSER_PASSWORD = [System.Net.NetworkCredential]::new('', $taskPassword).Password
```

Registra a los demás usuarios desde la pantalla de acceso y asígnalos desde Administración. Una cuenta pendiente carece de capacidades privilegiadas, incluso si se le asignó el rol global antes de activarla.

## Actualizar una instalación existente

1. Detén su servidor. Conserva una copia privada de `data/` completa y de `.env.local` antes de reemplazar código.
2. Extrae esta versión en una carpeta nueva. No mezcles `node_modules` ni compilaciones de versiones anteriores.
3. Copia allí tu `data/` y tu `.env.local`, o configura `MECAPLAN_DATA_DIR` para apuntar a una copia de los datos.
4. Ejecuta `pnpm install --frozen-lockfile`, `pnpm run diagnose` y `pnpm run dev`.
5. Revisa el diagnóstico antes de corregir datos. Los cambios de esquema son aditivos; no se regeneran cuentas ni contraseñas.

No ejecutes `seed:demo` para migrar datos reales: ese comando restaura expresamente los proyectos de ejemplo. El importador histórico Digit 360 requiere archivos privados ausentes del ZIP y no forma parte del arranque. No se inventan duraciones, responsables, precios ni revisiones para completar información faltante.

## Seguridad y datos docentes

La evaluación se consulta únicamente desde una cuenta docente activa. Sus notas y versiones no se incluyen en contexto, CSV ni respaldo ordinario de proyecto. El docente puede consultar el archivo de proyectos eliminados desde Evaluación; si no queda ningún proyecto, el acceso al archivo privado sigue disponible en la pantalla inicial.

Los alumnos con administración global conservan la capacidad de administrar proyectos, pero no de recuperar/reactivar cuentas docentes ni leer sus notas. La protección de la aplicación no sustituye el control de acceso a la computadora y a sus archivos SQLite.

La demo se deshabilita por defecto con `NODE_ENV=production`. Puedes deshabilitarla también en desarrollo con `ENABLE_DEMO=0` en `.env.local`. El modo local escucha en `127.0.0.1`; un celular en otra computadora no accede a esa dirección. Una instalación en red necesita HTTPS, persistencia, permisos y respaldo. Esta entrega no está desplegada.

## OneDrive y documentos

Asociar enlaces HTTPS de Microsoft funciona sin OAuth. La subida directa requiere registrar y autorizar la aplicación institucional siguiendo `docs/ONEDRIVE.md`. Para conectar, inicia sesión desde el mismo origen de `ONEDRIVE_REDIRECT_URI`; la guía usa **http://localhost:3000**. Las sesiones de localhost y 127.0.0.1 son distintas.

Las subidas guardan identidad de operación y metadatos de recuperación. Si la red falla después de subir, reintenta el mismo archivo sin cambiarlo; el servidor reutiliza la operación. Los documentos no se eliminan de Microsoft al retirar enlaces o proyectos. La referencia no concede permisos Microsoft a otros estudiantes.

No se ha autorizado ni probado una cuenta institucional real en este entorno. El ZIP incluye implementación y pruebas locales, no credenciales Microsoft ni una conexión preconfigurada. Editar un Excel en OneDrive requiere nueva importación; los contextos descargados tampoco se sincronizan.

## Copias y restauración

Detén el servidor para obtener también una copia consistente de adjuntos locales. El respaldo incluye cuentas, sesiones, evaluaciones, versiones y tokens cifrados; es privado y no debe enviarse junto al código.

```powershell
pnpm run backup work/mi-respaldo-privado
pnpm exec tsx scripts/restore-installation.ts work/mi-respaldo-privado work/datos-restaurados
```

El destino de restauración debe ser nuevo. Se verifica SHA-256 y la integridad SQLite. Para abrir esa copia:

```powershell
$env:MECAPLAN_DATA_DIR = (Resolve-Path 'work/datos-restaurados').Path
pnpm run dev
```

Conserva `.env.local` y cualquier `ONEDRIVE_TOKEN_KEY` externo por separado. El respaldo ordinario del proyecto JSON conserva datos/referencias y adjuntos locales dentro del límite, pero no notas docentes ni los bytes de los documentos Microsoft.

## Comprobar la entrega

```powershell
pnpm test
pnpm run typecheck
pnpm run build
pnpm exec playwright install chromium
pnpm run test:e2e
```

`test:e2e` inicia un servidor independiente en el puerto 3101 con datos temporales en `work/`; no utiliza tu instalación del curso. Las pruebas HTTP y webhook usan usuarios/proyectos sintéticos y limpian sus registros. Para una comprobación completa con un solo comando, incluidos los servidores temporales:

```powershell
pnpm run verify
```

Necesita libres los puertos 3101 y 3102. El informe de esta entrega está en `docs/VALIDATION.md`; el diagnóstico no modifica datos:

```powershell
pnpm run diagnose
```

## Alcance siguiente

Vercel + Supabase están preparados con backend PostgreSQL, esquema privado y migración verificada. Su activación requiere configuración externa: consulta docs/VERCEL_SUPABASE.md. OneDrive conserva los documentos. GitHub real, propuestas IA automáticas, correo, PDF dedicado y horas siguen fuera de esta entrega.


## Vercel + Supabase y Kanban principal

Tablero Kanban aparece como opción principal y conserva las seis categorías de actividad. Para desplegar, sigue docs/VERCEL_SUPABASE.md y .env.vercel.example. La instalación local sigue usando SQLite. La demo permanece deshabilitada en PostgreSQL/Vercel. El análisis de migración detectó una matriz local de Digit360 pendiente de pasar a OneDrive; no se migraron datos ni se publicó la aplicación.

