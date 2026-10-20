> Auditoría del código original 0.3.0, anterior a las correcciones. Las referencias de líneas corresponden a ese original; el cierre actual está en ../CHANGELOG_0.3.1.md y ../VALIDATION.md.

# Análisis de MecaPlan 0.3.0

Fecha de revisión: 19 de octubre de 2026, hora de Honduras.

## Dictamen y decisiones

MecaPlan tiene una base funcional que conviene conservar. La gestión de actividades, los permisos por proyecto, el cálculo CPM, el presupuesto en centavos, las importaciones con vista previa y la separación de evaluaciones docentes están implementados. La siguiente inversión debe ser una versión de estabilización **0.3.1**: corregir autorización, identidad de importaciones y coherencia de los cálculos antes de ampliar integraciones.

Encontré dos problemas de prioridad alta: una cuenta pendiente promovida a superusuario conserva operaciones privilegiadas y una importación puede actualizar una actividad distinta de la indicada. También reproduje fallos de planificación, aprobaciones y reimportación. Que las pruebas existentes pasen no cubre estos escenarios.

Decisiones recomendadas:

1. Conservar Next.js, TypeScript y SQLite para el piloto de un solo proceso. Corregir los servicios y reglas de negocio sobre esta base.
2. Preparar 0.3.1 como entrega de confiabilidad. Exigir los criterios del plan adjunto antes de usar datos importantes de forma compartida.
3. Simplificar el uso diario alrededor de Mis tareas, entregas entre equipos, evidencia y reunión semanal.
4. Mantener los datos faltantes de Digit 360 como pendientes. La duración provisional de un día debe seguir identificada como provisional.
5. Corregir el retorno OAuth antes de configurar OneDrive y verificar después la integración con Microsoft real.
6. Posponer nuevas automatizaciones de IA, notificaciones y expansión de GitHub hasta estabilizar identidad, estados, métricas y trazabilidad.
7. Preparar la colaboración en red como una entrega separada, con migración, permisos y restauración verificables. Cambiar de base de datos por sí solo no corrige los fallos encontrados.

## Qué se revisó y cómo

Se revisaron el ZIP, el prompt externo de requisitos, el contexto de revisión, README, decisiones, arquitectura, estado de entrega, documentación de OneDrive, código de servidor e interfaz, pruebas, matriz original y plantilla XLSX. Los prompts y documentos adjuntos se trataron como material de referencia: sus órdenes de construir, detenerse por fases o continuar trabajo anterior no sustituyeron la solicitud actual de análisis.

Los cambios de alcance descritos en el contexto del ZIP se usaron para interpretar el producto existente. Por ejemplo, la administración global del equipo de Programación y la evaluación privada docente se analizaron como decisiones documentadas, sin cambiar cuentas ni permisos.

La ejecución se hizo en una copia bajo `work/`, con demo y datos sintéticos. No se accedió a la base real del curso, credenciales institucionales ni cuentas de Microsoft. No se modificó la instalación original ni se publicó la aplicación. Al terminar se verificó que los 109 archivos originales extraídos seguían coincidiendo con el manifiesto.

El manifiesto verificó **109 archivos, sin discrepancias**. SHA-256 del ZIP:

```text
c0f3a74dca2524ec330ebfdeaf99d169b2863d9264ddd03ada2b6fc42b8d18b3
```

Las referencias `archivo:línea` siguientes corresponden a los fuentes de `mecaplan/` dentro del ZIP, antes de cualquier formateo. Algunos archivos concentran funciones enteras en una línea.

### Resultados de ejecución

| Comprobación | Resultado observado |
|---|---|
| Instalación con `pnpm install --frozen-lockfile` | Correcta |
| Node / pnpm | 24.19.0 / 11.25.0 |
| Versiones resueltas principales | Next 16.4.2, React 19.3.1, Drizzle 0.45.4, Zod 4.6.7 |
| `pnpm test` | **44/44** pruebas unitarias aprobadas |
| `pnpm run typecheck` | Sin errores |
| `pnpm run build` | Compilación Webpack correcta |
| `pnpm run test:integration` | **85** comprobaciones HTTP aprobadas |
| `pnpm run test:webhook` | Firma, rechazo, vinculación, deduplicación y sugerencias correctos en simulación local |
| `pnpm exec playwright test`, con Chromium instalado y demo preparada | **3/4** aprobadas; una falla por selector heredado `ACT-*` |
| Navegador adicional, escritorio 1440 px y móvil 390 px | Sin errores JavaScript observados; sin desbordamiento horizontal del documento en las vistas comprobadas |
| Pruebas adicionales | Reproducciones HTTP, de servicios, importación, calendario, curva y cookies descritas en los hallazgos |
| `pnpm audit --json` | Una advertencia moderada transitiva en `exceljs → uuid`; sin altas/críticas en esa consulta |

La compilación utilizó un directorio de salida separado para evitar interferir con desarrollo. Next añadió rutas de tipos a la copia de `tsconfig`; se restauró la configuración original al terminar. Los resultados de pruebas históricas incluidos en el ZIP se distinguieron de las comprobaciones repetidas durante esta revisión.

La primera ejecución del conjunto de navegador carecía de Chromium. Además, ejecutar integración sobre una base vacía antes de la primera carga dejó la demo sin sus proyectos: su fixture temporal hizo que el seed considerara la base ya poblada. Se preparó explícitamente la demo y se repitió la suite. El resultado válido citado arriba es 3/4; no se atribuyeron los fallos de preparación a regresiones de la interfaz.

## Hallazgos confirmados, por impacto

**P1** significa corregir antes de ampliar uso o compartir datos importantes. **P2** afecta coherencia, funcionamiento o trazabilidad y debe entrar en la estabilización. **P3** mejora operación y cobertura con menor urgencia. Estas prioridades corresponden al alcance local del producto, no son puntuaciones CVSS.

### H01. P1 — Una cuenta pendiente conserva privilegios globales

**Ubicación:** `src/app/api/app/route.ts:20`, `:88`, `:94`, `:208`; `src/server/global-service.ts:11`; `src/server/auth/index.ts:7`; promoción desde `src/app/page.tsx:151`.

`can()` rechaza correctamente a usuarios pendientes. Sin embargo, varias operaciones comprueban directamente `globalRole` y omiten el estado. `currentUser()` devuelve una cuenta pendiente para que pueda ver su pantalla de espera, lo cual es válido, pero esa cuenta también llega a operaciones globales.

**Reproducción:** registrar una cuenta, promoverla con «Hacer superusuario» antes de asignarle proyecto y entrar con ella. La UI sigue mostrándola pendiente. En la prueba HTTP, `createProject` fue rechazado, pero `createTemplate`, `deleteProject` y `resetPassword` fueron aceptados. También pudo recibir la lista de usuarios. La emisión del token se comprobó sobre otro administrador sintético; no se consumió el token ni se tocaron cuentas reales.

**Consecuencia:** el estado pendiente no limita todas las capacidades. El token permitiría recuperar una cuenta administrativa no docente. No es una escalada desde una cuenta ordinaria sin promoción previa: requiere que ya se le haya concedido rol superusuario.

**Corrección:** usar `requireActiveUser` y permisos centralizados en todas las operaciones protegidas, también globales y OneDrive. Mantener la pantalla pendiente, pero bloquear sus capacidades. Probar rol × estado × cambio obligatorio de contraseña en cada familia de endpoints.

### H02. P1 — Excel puede actualizar la actividad equivocada

**Ubicación:** `src/server/excel-import.ts:42`, `:46`.

La búsqueda de la actividad mezcla código, alias e `importKey` y acepta la primera coincidencia sin detectar ambigüedad.

**Reproducción:** importar A con Referencia `PRO-002` y B con Referencia `TAREA-B`, ambas de Programación. La app genera A=`PRO-001` y B=`PRO-002`. Después importar una edición con Código=`PRO-002`. Se modifica A, no B, y el resultado devuelve `errors=[]`.

**Consecuencia:** una coincidencia ambigua puede cambiar título, responsables, fechas, estado o evidencia de otro registro. La vista previa muestra el resultado, pero no advierte el conflicto de identidad.

**Corrección:** resolver Código exclusivamente por código/alias y Referencia por clave externa. Si aparecen ambos, deben resolver al mismo ID. Rechazar ambigüedades y dos filas que pretendan modificar el mismo ID. Añadir unicidad de referencias por tipo.

### H03. P2 — Una edición pierde la referencia estable y luego duplica la actividad

**Ubicación:** `src/server/excel-import.ts:51`.

**Reproducción:** importar Referencia=`REF-ESTABLE-1`, que recibe Código=`PRO-001`. Editarla usando Referencia=`PRO-001`, un identificador que el importador admite. La operación reemplaza `importKey` por `PRO-001`. Reimportar el archivo inicial crea otra actividad: el conteo pasa de 1 a 2, sin errores.

**Consecuencia:** se incumple la reimportación sin duplicados y se separan en dos registros los cambios que pertenecían a la misma tarea.

**Corrección:** conservar la referencia externa al resolver por código/ID. Cambiarla debe ser una operación explícita con unicidad y conservación de la referencia anterior. El usuario no debería tener que entender claves internas para reimportar su libro.

### H04. P2 — El retorno de Microsoft pierde la cookie que exige el callback

**Ubicación:** `src/server/auth/index.ts:11`; `src/app/api/onedrive/callback/route.ts:6`; `src/server/onedrive.ts:17`.

La sesión usa `SameSite=Strict`. El callback GET requiere esa sesión, pero el retorno desde Microsoft es una navegación entre sitios. MSAL usa respuesta por query por defecto en esta implementación.

**Verificación:** en Chromium, dos cookies idénticas salvo Strict/Lax se conservaron en el navegador; al volver desde otro sitio al callback, llegó Lax y se omitió Strict. Esta prueba reproduce la incompatibilidad del patrón actual, sin configurar Microsoft institucional. Coincide con las reglas de [SameSite documentadas por Mozilla](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value) y el [retorno del flujo de autorización de Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#successful-response).

**Consecuencia:** configurar tenant y consentimiento no basta para que la conexión funcione; el callback puede responder que hay que iniciar sesión antes del canje.

**Corrección:** sesión Lax manteniendo Origin en escrituras, state y PKCE, o una cookie temporal Lax de correlación vinculada al flujo iniciado. No eliminar la comprobación de identidad para sortear el error. Después verificar conexión, subida y migración con cuentas institucionales reales.

### H05. P2 — Una solicitud con destino inválido modifica el proyecto completo

**Ubicación:** `src/server/control-service.ts:45`, `:47`; `src/components/phase-panel.tsx:90`.

El selector mezcla actividades y partidas para todos los tipos de cambio. Al aprobar duración o alcance, no encontrar actividad se interpreta como modificar el proyecto.

**Reproducción:** solicitar duración con una referencia inexistente o ID de partida, valor 9, y aprobar. Un proyecto de 3 semanas termina con 9 semanas; ninguna actividad cambia. También afecta referencias retiradas después de solicitar el cambio.

**Corrección:** destino tipado `project | activity | budgetItem`, campos y unidades adaptados al tipo, validación al solicitar y al aprobar. Proyecto debe ser una selección explícita. Mostrar «antes → después», entidad y unidad antes de aplicar. Una referencia inexistente debe detener la operación.

### H06. P2 — Un hito modificado conserva la aprobación del docente

**Ubicación:** `src/server/control-service.ts:50`; etiqueta docente en `src/components/phase-panel.tsx:91`.

Se protege el booleano `approved`, pero no su relación con el contenido revisado.

**Reproducción:** un alumno superusuario edita un hito aprobado, cambia puntos de 5 a 100, fecha y criterios. El resultado conserva `approved=true`, incluso si envía false.

**Consecuencia:** la aplicación presenta como aprobados datos que el docente no revisó. Las evaluaciones privadas no se modifican por esta vía.

**Corrección:** invalidar la aprobación ante cambios sustantivos por un no docente o vincularla a una versión/hash del contenido con `approvedBy` y `approvedAt`. Una edición sin cambios puede conservarla.

### H07. P2 — Excel permite gastos y partidas de equipos distintos

**Ubicación:** `src/server/excel-import.ts:67`, `:70`, `:71`; validación global limitada en `src/lib/control.ts:4`.

**Reproducción:** un gasto pendiente de Programación está asociado a una partida de Programación. Importar solo Equipo=`Electrónica` conserva la partida anterior y devuelve cero errores. Mover la partida al otro equipo también puede dejar gastos aprobados vinculados desde el equipo anterior.

**Consecuencia:** los totales por equipo dejan de representar asociaciones consistentes; el importador acepta datos que la API de alta de gastos rechazaría.

**Corrección:** validar el objeto resultante, no solo las celdas nuevas. Comprobar relaciones inversas al mover partidas. Bloquear el traslado con gastos o realizar una migración explícita auditada. Extender las invariantes de proyecto a gasto/partida/equipo/actividad/comprobante.

### H08. P2 — La carga semanal suma días de más

**Ubicación:** `src/lib/control.ts:24`.

**Reproducción:** proyecto inicia lunes 19/10/2026; tarea de 6 días hábiles, desde ese lunes hasta lunes 26, asignada a una persona. La función devuelve semana 1=6 días y semana 2=1: total 7, con sobrecarga falsa. El reparto correcto es 5+1.

**Causa:** aplicar `workingDayDistance + 1` a un tramo que termina en domingo lo trata como si ese extremo fuera laborable.

**Corrección:** contar días laborables de la intersección con cada semana mediante una función única. Invariante: sumar semanas debe conservar el esfuerzo distribuido dentro del horizonte. Probar límites de semana, calendarios de 1–7 días y múltiples responsables.

### H09. P2 — Estado, fechas reales y curva S pueden contradecirse

**Ubicación:** `src/server/control-service.ts:27`, `:47`; comparación con `src/app/api/app/route.ts:157`, `:169`; `src/components/progress-curve.tsx:8` y `:10`.

**Reproducciones:** aprobar una solicitud `status=Hecha` deja `actualEnd` ausente; cambiar evidencia de una actividad hecha la reabre como En revisión, pero conserva su fecha de finalización. Además, con dos actividades hechas, una con fecha real y otra sin ella, una captura que conoce ambas como hechas se ignora y la curva puede mostrar 50% cuando el avance conocido es 100%.

**Causa:** cada canal implementa transiciones distintas. La curva elige entre fechas y capturas según si el conteo de fechas es distinto de cero.

**Corrección:** una transición de estado compartida por formulario, Kanban, Excel, cambios y webhook. Debe mantener revisión, bloqueo, fechas, reglas de padres y auditoría. Reconstruir la curva desde eventos consistentes o capturas con semántica definida; no escoger la fuente según un contador. Conservar reaperturas como historia y mostrar períodos desconocidos como tales.

### H10. P2 — El fin global puede preceder al hito final

**Ubicación:** `src/lib/control.ts:18`, `:19`.

**Reproducción:** tarea de 3 días desde lunes 19 hasta miércoles 21 de octubre, seguida de un hito FS de duración cero. Al aplicar el plan, el hito queda jueves 22, pero el fin global sigue siendo miércoles 21.

**Consecuencia:** resumen, alerta de exceso y Gantt discrepan sobre la fecha de entrega. La elección de una convención de hitos es válida, pero debe usarse igual en todas las salidas.

**Corrección:** definir hitos de inicio/fin y traducir offsets CPM a fechas con una semántica única. Derivar el fin global de los eventos resultantes. Probar hito aislado, terminal, intermedio y proyecto compuesto solo por hitos.

### H11. P2 — Clonar revive papelera y elimina desfases

**Ubicación:** `src/server/global-service.ts:16`.

**Reproducción:** clonar con `scale:false` un proyecto con una tarea en papelera y un lag FS de +4 días entre tareas activas. El clon recupera la tarea eliminada y pierde el lag. También reinicia `requireCrossReview` a false al reconstruir control desde valores por defecto.

**Consecuencia:** aparece trabajo descartado y se obtiene un plan o política de cierre distintos sin que la opción elegida lo explique.

**Corrección:** clonar actividades activas por defecto, remapear dependencias y claves de desfases, preservar las reglas relevantes de la plantilla y escalar solo si se solicita. La inclusión de papelera debe ser explícita.

### H12. P2 — El avance global y el de equipos usan denominadores distintos

**Ubicación:** `src/lib/domain.ts:16`; `src/app/page.tsx:144`; `src/components/phase-panel.tsx:68`.

El global usa hojas activas y excluye canceladas. Las tarjetas de equipos y parte de costo/avance incluyen padres y canceladas.

**Caso mínimo:** padre Pendiente con una única hija Hecha produce avance global de 100% y tarjeta de equipo de 50%, aunque representan el mismo trabajo.

**Corrección:** un selector y cálculo compartidos para global, equipos, costos, carga, exportación y contexto. Explicar la ponderación elegida. Contar tareas por igual es aceptable si se declara; mezclar denominadores no lo es.

### H13. P2 — Una asignación permite reactivar a un docente por una vía alternativa

**Ubicación:** `src/app/api/app/route.ts:192`, `:206`; contraste con las protecciones de `userStatus` en `:215` y recuperación en `:101`.

**Reproducción HTTP:** un superusuario alumno intenta activar un docente sintético desactivado mediante `userStatus` y recibe 400. La misma cuenta llama `assignUser`; recibe 200 y el docente queda activo porque la asignación fuerza ese estado.

**Consecuencia:** se elude la regla documentada que reserva a docentes el cambio de acceso de otros docentes. Esta operación sola no revela contraseña ni evaluaciones.

**Corrección:** separar membresía de activación global o usar la misma política de transición de cuenta en todos los canales. Registrar el cambio de estado junto con la asignación.

### H14. P2 — Las evaluaciones privadas no tienen historial privado

**Ubicación:** `src/server/control-service.ts:52`; `src/server/repositories/database.ts:23`.

**Reproducción:** guardar y editar una evaluación deja una sola fila con el último contenido. No se crea revisión ni evento de auditoría docente. El historial público tampoco aumenta, lo cual evita filtrar notas pero no resuelve su trazabilidad.

**Corrección:** versiones o eventos privados con docente, fecha, valores y motivo. Su acceso debe ser exclusivamente docente. Los logs generales deben registrar solo metadatos de seguridad permitidos, sin contenido de calificaciones.

### H15. P3 — El contexto IA no depura todos los campos de texto

**Ubicación:** `src/lib/agent-context.ts:5` a `:13`; promesa en `src/components/phase-panel.tsx:81`.

**Reproducción:** escribir un correo en el nombre de proyecto, equipo o persona, o marcadores `token=...` / `contraseña=...` en ciertos nombres. Esos valores llegan al Markdown/JSON porque `clean()` solo se aplica a campos seleccionados.

**Alcance:** no observé exportación de la columna privada de correo, hashes o evaluaciones. El fallo requiere que el dato se haya escrito en texto visible. La garantía absoluta de omitir cualquier correo/credencial sí es excesiva.

**Corrección:** proyección permitida con depuración homogénea de todas sus cadenas, misma política para ambos formatos y vista previa de lo que se compartirá. Aclarar que ningún patrón de texto detecta todos los secretos posibles.

### H16. P3 — La limpieza de enlaces desde Excel no hace lo prometido

**Ubicación:** `src/server/excel-import.ts:70`, `:71`; instrucción de uso en `src/components/import-panel.tsx:11`.

**Reproducción:** importar `[vacío]` en Partida y Comprobante de un gasto pendiente. La operación termina sin errores, pero mantiene ambos IDs anteriores por el fallback `?? old`.

**Corrección:** representar por separado campo omitido, limpieza explícita y valor nuevo. Probar esa semántica por columna y tipo; el diff debe reflejarla.

### H17. P3 — La suite de navegador quedó atrás de los códigos actuales

**Ubicación:** `tests/e2e.spec.ts:5`.

Con la demo preparada, 3 de 4 flujos pasan. El de crear/editar/comentar espera un botón `ACT-*`, aunque las actividades nuevas usan prefijos por equipo; se detiene después de crear correctamente la actividad. Otros selectores de ese flujo también conservan ACT.

**Corrección:** localizar por identidad estable o título único del fixture y comprobar el código como dato por separado. Crear fixtures aislados y limpieza de usuarios/proyectos. Añadir pruebas E2E de las funciones 1B y mejoras recientes: importación, gastos, evidencia/revisión, cambio aprobado y contexto de equipo.

### H18. P3 — Los diálogos avanzados no tienen el mismo comportamiento de teclado

**Ubicación:** `src/components/project-tools.tsx:10`; contraste con `Modal` en `src/app/page.tsx:42`.

**Prueba de navegador:** Escape cierra el modal principal de actividad, pero no el de crear/editar equipo. Este último declara `aria-modal`, pero no comparte el mecanismo de foco y teclado del principal.

**Corrección:** un componente de diálogo común con foco inicial, confinamiento de Tab, Escape y restauración de foco. La pauta oficial de [diálogos modales WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) detalla ese comportamiento. La revisión realizada no equivale a una auditoría completa con lector de pantalla.

## Otros ajustes menores confirmados por lectura

| Ubicación | Problema | Ajuste |
|---|---|---|
| `src/app/page.tsx:133` | `Number(code.slice(4))` supone prefijo de tres letras. `PRUE-001` se interpreta como −1 y `PRUE-002` como −2; otros prefijos producen NaN | Separar sufijo numérico y usar orden natural estable |
| `src/app/page.tsx:125` | El filtro de semana usa solo la semana de fin | Filtrar por intersección o llamarlo «semana de entrega» |
| `src/app/page.tsx:146` | Kanban excluye Cancelada, aunque filtro y contador la admiten | Mostrarla opcionalmente o explicar su exclusión |
| `src/server/control-service.ts:41` y `src/server/excel-import.ts:76` | La reasignación de `ownerId` de registros cambia de política según canal | Separar creador inmutable y responsable editable; usar una política común |
| `src/server/excel-import.ts:69` | Un gasto aprobado idéntico bloquea reimportar todo el libro | Clasificarlo como «sin cambios» y rechazar únicamente intentos de modificación |

## Riesgos pendientes y límites operativos

Estos puntos se separan de los fallos reproducidos porque requieren una decisión de producto, pruebas de fallos o un entorno externo.

### OneDrive necesita pruebas de recuperación, permisos y continuidad

El código tiene PKCE S256, state aleatorio de un uso con caducidad, caché MSAL cifrada con AES-256-GCM, validación de enlaces y verificación de tamaño/hash del archivo subido. Son controles útiles. La documentación dice «ligado a sesión»; la implementación liga state al usuario, sin guardar el ID de sesión iniciadora. Conviene alinear ambos y definir qué ocurre si se cierra o cambia la sesión.

La cuenta de almacenamiento es única por instalación. Guardar un enlace en MecaPlan no otorga permisos Microsoft. Deben probarse acceso desde una segunda cuenta, revocación, cambio de propietario y continuidad del curso. Para uso institucional compartido, evaluaría una biblioteca de SharePoint con propiedad organizacional.

Las subidas y migraciones mantienen la **cola global de escritura** mientras realizan red (`api/files/route.ts:12`, `api/onedrive/route.ts:14`, `server/onedrive.ts:22`). El flujo puede ejecutar varias peticiones Graph de hasta 45 segundos cada una. No se midió una caída real, pero la arquitectura permite retrasar comentarios, estados y otras escrituras de todos los proyectos durante una subida lenta.

Recomiendo realizar la red fuera de la sección crítica y guardar después, en una sección breve, releyendo permisos y versión del proyecto. Registrar durablemente la operación y el ID remoto al subir permite retomar si falla la verificación o el guardado. Ahora, si el PUT funciona y el paso posterior falla, un reintento puede crear un segundo archivo remoto sin referencia al primero. La conservación de documentos exige reconciliar esos casos, no borrarlos automáticamente.

Pruebas institucionales necesarias: consentimiento, retorno OAuth corregido, subida/descarga con SHA-256, migración, permisos de un segundo estudiante, cuota, revocación, 401/403/404/409/429 y pérdida de red después del PUT. La [API oficial de Graph](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0) sirve de referencia para completar esa validación.

### Retención docente y respaldos requieren una política explícita

`deleteProject` elimina también las evaluaciones (`src/server/global-service.ts:14`), mientras el respaldo ordinario de proyecto las excluye para proteger su privacidad. Por tanto, un alumno superusuario activo puede borrar las notas al eliminar el proyecto, aunque no pueda leerlas ni editarlas.

Es una brecha de **retención y disponibilidad**, no una filtración. Decido recomendar archivo recuperable de proyectos y retención docente independiente. La purga de calificaciones debe pertenecer al docente y usar su respaldo privado. El respaldo general de proyecto debe seguir excluyéndolas.

El JSON de proyecto guarda referencias a OneDrive, no una copia integral de sus documentos. Conviene nombrar claramente «respaldo de datos y referencias» y ofrecer recuperación documental institucional aparte. Probar restauración en una instalación vacía con remapeo de usuarios; actualmente esos usuarios deben existir previamente.

### Una cola de JavaScript no es una transacción distribuida

Las importaciones sí vuelven a verificar usuario, permisos, caducidad y hash del proyecto al confirmar. La escritura del agregado guarda juntos datos, historial y captura; la limpieza del token ocurre después. En el alcance declarado de un proceso, esto evita sobrescrituras y una repetición tras caída falla por cambio de hash.

Para varios procesos hace falta control de versión en la base y transacciones. No se debe presentar una migración a Supabase como un simple cambio de adaptador: las rutas de auth, evaluaciones, importación, servicios globales y OneDrive hacen SQL directo. Esos contratos deben separarse primero.

SQLite sigue siendo razonable para el piloto. Su documentación admite servidores de aplicación con carga moderada y explica el límite de un escritor simultáneo. El problema actual más inmediato es el tamaño del agregado y la duración de las secciones críticas, no el número de estudiantes por sí solo. [Criterios oficiales de SQLite](https://www.sqlite.org/whentouse.html).

### Recursos y despliegue

La aplicación se inicia en `127.0.0.1`; compartir un enlace de esa forma no habilita el acceso desde los celulares del grupo. El modo producción usa cookie Secure y requiere HTTPS, como ya advierte el README.

Antes de cualquier acceso en red: aislar o deshabilitar demo, límites efectivos del cuerpo de solicitudes y subidas, cuotas, sesiones y recuperación auditadas, respaldo probado y entorno de pruebas separado. `formData()` se lee antes de autenticar en algunas rutas y el límite previo depende de Content-Length; no se realizó una prueba de agotamiento de memoria. No se debe convertir esa observación en una afirmación de explotación demostrada.

### Dependencias

La consulta de auditoría encontró `uuid@8.3.2` por ExcelJS y el aviso moderado [GHSA-w5hq-g745-h8pq del mantenedor](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq). Afecta ciertos métodos v3/v5/v6 con buffers externos; la búsqueda en ExcelJS encontró uso de v4. No confirmé una ruta explotable en MecaPlan.

Recomiendo resolverlo con actualización o parche compatible y pruebas XLSX. Evitar un override mayor a ciegas: puede cambiar el contrato CommonJS/ESM de una dependencia. La auditoría de paquetes es una señal complementaria, no una certificación de seguridad.

## Qué está bien y conviene conservar

- La autorización ordinaria de proyecto se verifica en servidor; no depende solo de ocultar botones. El control de evaluaciones se comprueba antes del privilegio superusuario.
- Las evaluaciones se almacenan separadas y no aparecieron en contexto, CSV ni respaldo ordinario de estudiantes. No encontré una vía directa de lectura/edición docente por un superusuario alumno activo.
- Hay bcrypt, sesiones aleatorias con hash almacenado, cookies HttpOnly, invalidación de sesiones al cambiar contraseña y límite de intentos de login. Las excepciones H01/H13 deben cerrarse de forma central.
- El núcleo CPM realiza orden topológico, pasadas temprana/tardía, holgura y rechazo de ciclos. Los fallos de carga/hitos están en la traducción de calendario y métricas; no justifican reescribir todo el algoritmo.
- El presupuesto usa enteros en centavos y el gasto oficial considera solo aprobados. Las importaciones no aprueban gastos automáticamente.
- RACI admite borradores incompletos con advertencias y valida pertenencia al proyecto. Esa decisión facilita capturar datos reales faltantes.
- El cierre con revisión cruzada requiere evidencia y confirmación desde otra cuenta/equipo cuando la configuración lo exige. La prueba de aceptación que cumple requiere objetivo, medición y evidencia.
- La importación trabaja sobre copia, muestra diff, no entrega token si hay errores, caduca en 15 minutos y detecta proyectos/permisos cambiados. XLSX tiene límites comprimidos/descomprimidos, filas y entradas; rechaza fórmulas en celdas procesadas y contenido no admitido.
- Hay IDs internos y alias de códigos, neutralización de fórmulas al exportar CSV y descargas de archivos con permiso de proyecto.
- Se conserva OneDrive al retirar enlaces o eliminar proyectos. La ausencia de sincronización automática está claramente documentada.
- `suppressHydrationWarning` está limitado al html en `src/app/layout.tsx:12`; no suprime todo el árbol. La excepción coincide con el alcance de un nivel descrito por [React](https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors). No observé errores de hidratación en las vistas comprobadas. Mantendría pruebas sin extensiones y con la extensión que originó el reporte.

## Revisión de la matriz y de los requisitos

La matriz original contiene **11 hojas** y combina entradas, fórmulas y tableros. Las fechas fuente comprobadas son presentación final **4 de diciembre de 2026** y MECATÓN **11 de diciembre de 2026** (`Cronograma!B4:B5`). La plantilla de importación actual contiene guía y nueve tablas operativas, sin filas de ejemplo ni fórmulas que deban ejecutarse.

La matriz original y la plantilla actual cumplen funciones distintas. El importador web general no debe presentarse como conversor universal del libro histórico: espera las tablas y cabeceras de su plantilla. El importador histórico específico depende de archivos privados ausentes en este paquete. Conviene explicar esa diferencia en la pantalla de importación con ejemplos breves de qué archivo usar.

La existencia de duraciones, precios o responsables faltantes en la fuente no autoriza inventarlos. El paquete no contiene la base real para certificar que sus 25 actividades y 18 integrantes coincidan con la instalación del curso; esos conteos se documentan, pero aquí se verificó código, fuente y demo, no el estado privado original.

| Área del pedido original | Estado que observé | Qué falta priorizar |
|---|---|---|
| Registro, roles, varios proyectos | Funcional localmente | Cerrar H01/H13 y auditar operaciones globales |
| WBS, RACI, comentarios y filtros | Implementados | Métricas comunes, mejores filtros y edición más cómoda |
| Edición tipo hoja de cálculo | Nombre en línea y detalle mediante formularios | Edición directa selectiva de responsable, estado y fechas con permisos |
| CPM, Gantt, línea base y preview | Implementación sustancial | H08–H12; preview también al cambiar duración desde el editor normal |
| Curva S y carga por persona | Existen | Corregir historia y calendario antes de usarlas para decisiones |
| Presupuesto, BOM, gastos | Funcionales | Relaciones consistentes, corrección trazable y comprobante en el mismo flujo |
| Cambios aplicables | Existen | Destinos tipados y diff explícito antes de aprobar |
| Riesgos, actas, revisión y aceptación | Existen | Acciones de mitigación con responsable y vencimiento; separar autor/responsable |
| Interfaces entre equipos | Iconos y exportación | Bandeja de entregas y recepciones entre equipos |
| Agentes | Contexto actual MD/JSON con alcance | Depuración completa y datos coherentes; propuestas automáticas siguen pendientes |
| Excel y documentos | Mejoras posteriores implementadas | Integridad de referencias y validación Microsoft real |
| Supabase, publicación, GitHub real, notificaciones, PDF, horas | Pendientes declarados | Planificarlos después de estabilizar; no son funciones ocultamente terminadas |

## Mejoras de producto que haría

### 1. Dar a cada estudiante una portada de trabajo diario

Mostrar primero lo que entrega hoy o esta semana, su siguiente paso, bloqueos y revisiones que le corresponden. Acciones principales: cambiar estado, aportar evidencia y registrar gasto. La navegación actual ofrece muchas secciones al mismo nivel; agruparía planificación, control y administración y dejaría visibles las tareas frecuentes.

El dashboard llama «Personas conectadas» al total de integrantes (`src/app/page.tsx:144`), sin medir presencia en línea. Cambiaría el texto a «Integrantes». La interfaz debe comunicar lo que los datos realmente miden.

### 2. Guiar la confirmación del plan de Digit 360

Un flujo de cinco pasos: equipos/personas, RACI, duraciones/dependencias, calendario/entrega y línea base. Mostrar «X de 25 actividades planificadas» y distinguir borrador, dato provisional y compromiso confirmado. Permitir guardar incompleto, pero exigir una revisión visible antes de declarar el cronograma como base aprobada.

### 3. Crear una bandeja de interfaces entre equipos

Derivarla de dependencias cruzadas. Cada entrega debería identificar proveedor, receptor, criterio de aceptación, fecha y documento/versionado. Ejemplos del dominio: dimensiones y orificios de PCB, pinout, tensión/corriente, protocolo, tolerancias mecánicas, STEP y firmware compatible.

La recepción de un entregable puede dar una señal mucho más útil que marcar una tarea como hecha. Priorizaría esta vista por encima de más tipos de gráficas.

### 4. Hacer una vista de reunión semanal

Cambios desde la última revisión, compromisos de los próximos siete días, bloqueos con dueño, gastos por aprobar y riesgos con próxima acción. Un acuerdo puede convertirse en tarea sin volver a capturarlo. Guardar una captura de la reunión ayudaría a explicar desviaciones sin alterar la línea base.

### 5. Separar línea base, plan actual y ejecución

Mostrar las tres columnas y el desvío por actividad/proyecto. Una modificación del plan actual no debe reescribir el compromiso original. Indicar cómo se calcula el avance y preservar historia de reaperturas.

La duración de una tarea no equivale necesariamente al esfuerzo de una persona. Añadiría un esfuerzo estimado opcional en días-persona y disponibilidad semanal antes de prometer balance de carga preciso. Si no se informa, mantener la aproximación claramente etiquetada.

### 6. Resolver gasto y comprobante en una sola pantalla

Seleccionar equipo, filtrar partidas compatibles, capturar importe, tomar/subir comprobante o asociar enlace y registrar pendiente. Permitir corregir un gasto pendiente con historial; para uno aprobado, una rectificación explícita. Las cantidades fraccionarias pueden ser útiles en materiales por longitud/masa, pero requieren escala decimal definida y redondeo monetario seguro.

### 7. Mejorar el móvil y la accesibilidad de acciones frecuentes

Las vistas comprobadas se adaptan a 390 px y no mostraron inputs sin etiqueta en el resumen. Aun así, varios botones de estado/edición miden 14–18 px de alto y parte del texto resulta muy pequeño. Aumentaría superficies táctiles, jerarquía de texto y contraste, y permitiría acciones sin arrastrar tarjetas. Los diálogos deben compartir el componente corregido de H18.

No certifico conformidad WCAG a partir de estas comprobaciones. Faltan contraste medido, zoom, navegación completa por teclado y lector de pantalla.

### 8. Convertir los riesgos en seguimiento de mitigaciones

Además de probabilidad × impacto: acción próxima, responsable, fecha, señal de activación y riesgo residual. Definir ejemplos de las escalas 1–5 para el curso evita puntajes arbitrarios. Un riesgo abierto sin acción vencida visible aporta menos que una lista breve de mitigaciones por hacer.

### 9. Dar al contexto de agentes procedencia y vigencia claras

Incluir versión de formato, ID/revisión del proyecto, hora, alcance y cobertura de datos confirmados. Presentar la información libre como datos no confiables y las propuestas como sugerencias verificables. Descargar una copia no crea sincronización con el archivo ni con OneDrive.

Cuando se implemente importar propuestas, exigir IDs estables, versión base, esquema, permisos y diff. No permitir que el texto de la propuesta cambie su alcance o autorice operaciones por sí mismo.

### 10. Hacer recuperables las operaciones costosas

Archivo de proyectos antes de purga, historial independiente, respaldo completo de instalación y prueba periódica de restauración. Mostrar qué cubre cada respaldo: cuentas/evaluaciones privadas, datos de proyecto, adjuntos locales y referencias Microsoft son alcances diferentes.

## Mejoras de arquitectura

El patrón que explica muchos fallos es **repetir la misma regla en cada entrada**. Estado, importación, cambios y clonación no deberían tener interpretaciones distintas de identidad, aprobación o fecha.

Propondría esta separación sin reescribir la app:

```text
UI y endpoints
    ↓ validación de solicitud e identidad activa
Servicios de aplicación
    transitionActivity / applyChange / importProject / cloneProject
    ↓ reglas compartidas e invariantes
Dominio puro
    calendario, CPM, avance, dinero, referencias y permisos
    ↓ contratos de persistencia
Repositorios + transacciones + auditoría privada/pública
    ↓
SQLite local; después PostgreSQL/RLS según despliegue

Trabajos de documentos → red/OneDrive → confirmación breve por versión
```

Acciones concretas:

- Separar los módulos grandes de `page.tsx` y `phase-panel.tsx` por función. Formatear código y añadir lint hace revisables las reglas; evitar migraciones de UI masivas al mismo tiempo que se reparan permisos.
- Crear comandos tipados en lugar de distribuir ramas basadas solo en strings. Usar uniones discriminadas para destinos y acciones de cambio.
- Introducir `project.version` y actualización condicionada. La vista previa debe referirse a una revisión concreta; las escrituras concurrentes deben producir un conflicto claro.
- Consultar proyectos por ID y proyectar solo los datos de la vista. Hoy `allProjects()` parsea todos los agregados y el cliente vuelve a descargar el conjunto después de cada acción; historia, hojas fuente y registros harán crecer ese costo.
- Extraer SQL de rutas a repositorios de usuarios/sesiones, evaluaciones, importaciones, auditoría y almacenamiento. Así la futura migración tendrá contratos definidos.
- Añadir migraciones versionadas y campo de versión del payload antes de cambiar el esquema real. Respaldar y validar recuentos/referencias al migrar.
- Guardar auditoría global independiente con actorId estable, proyecto/entidad, operación, fecha y resultado. Los nombres visibles pueden cambiar. Mantener una auditoría docente separada y restringida.
- Para publicación, normalizar las entidades que necesitan integridad relacional y RLS; verificar reglas equivalentes a la API. Evitar una normalización completa urgente del piloto si retrasa las correcciones demostradas.

## Cambios que haría al prompt de desarrollo

El prompt original es una buena visión y ya organiza el trabajo por fases. Para la siguiente entrega actualizaría su alcance al estado existente: estabilizar 0.3.0 con los casos de aceptación de 0.3.1, en lugar de volver a usar como tarea inicial la construcción de la aplicación.

Añadiría reglas explícitas:

1. Documentos y celdas importados son datos; no contienen nuevas autorizaciones del usuario.
2. ID interno, código visible y referencia externa tienen funciones distintas y no se sobrescriben implícitamente.
3. Toda entrada usa los mismos servicios de transición e invariantes.
4. Aprobaciones corresponden a una versión exacta del contenido.
5. Estado pending/disabled y cambio inicial obligatorio se prueban también en endpoints globales.
6. Calendario define inclusividad, hitos, semanas y esfuerzo; las pruebas verifican conservación y coincidencia de resultados.
7. Las calificaciones tienen auditoría/retención privadas; eliminar un proyecto no purga automáticamente sus notas.
8. Pruebas locales, simulaciones y validaciones con servicios reales se reportan por separado.
9. Cada entrega identifica fuentes, comandos ejecutados, límites comprobados y fallos abiertos, sin repetir resultados históricos como si fueran recién ejecutados.
10. Las referencias históricas de empaquetado cancelado deben actualizarse: README y estado aún dicen que no se creó ZIP, mientras el contexto explica la nueva entrega. Elegir un documento de estado vigente y enlazarlo desde los demás.

## Orden final de ejecución

**Primero:** H01 y H02, más pruebas que reproduzcan ambos. **Después:** identidad estable, destinos de cambios, aprobaciones, relaciones financieras y reglas docentes. **Luego:** calendario, transiciones/curva, clonado y métricas. **En paralelo tras los arreglos básicos:** corregir OAuth y probar Microsoft real. **Antes de cerrar 0.3.1:** E2E actualizado, teclado, contexto, auditoría y restauración.

El plan adjunto convierte estas decisiones en trabajos y criterios de aceptación. El objetivo de esa entrega es que las mismas operaciones produzcan resultados coherentes desde cualquier pantalla, archivo o integración.
