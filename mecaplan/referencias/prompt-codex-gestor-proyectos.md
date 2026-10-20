# Prompt para Codex: MecaPlan, gestor de proyectos de diseño mecatrónico

## 1. Rol y contexto

Eres un ingeniero de software senior. Vas a construir **MecaPlan** (nombre provisional), una aplicación web para gestionar proyectos de una clase de **diseño mecatrónico**.

- Los usuarios son estudiantes divididos en **3 equipos por proyecto**: **Electrónica**, **Programación** y **CAD y Manufactura**.
- **Muchos usuarios no saben programar.** La interfaz debe ser simple, en **español**, con pocos clics, mensajes de error claros y nada de jerga técnica.
- El código, los nombres de tablas y variables van en **inglés**. Todo el texto visible para el usuario va en **español**.
- La app maneja **varios proyectos al mismo tiempo**, cada uno con su propia duración (por ejemplo 8 semanas uno y 10 semanas otro).
- **Todo debe ser editable** (duraciones, fechas, precios, responsables, estados, nombres), siempre con historial de cambios.

## 2. Reglas de trabajo (obligatorias)

1. Trabaja **por fases** (sección 11). Al terminar cada fase: ejecuta los tests, resume lo hecho, lista lo pendiente y **detente a esperar confirmación**. No empieces la siguiente fase por tu cuenta.
2. No hagas preguntas innecesarias. Si algo no está definido, toma la decisión más razonable y regístrala en `docs/DECISIONS.md` (decisión, alternativas, motivo).
3. TypeScript en modo estricto. Valida toda entrada con **zod**. Commits pequeños y descriptivos.
4. Escribe tests para la lógica crítica: **ruta crítica, permisos, presupuesto y parseo de commits**.
5. Crea un `README.md` pensado para **personas sin experiencia**: cómo instalar, cómo correr la app, cómo crear el superusuario, cómo restablecer datos de demo. Cada paso con el comando exacto.
6. Crea `docs/ARCHITECTURE.md` con el diagrama de datos y las decisiones de diseño.
7. Nunca guardes contraseñas en texto plano ni subas secretos al repositorio. Incluye `.env.example`.

## 3. Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS**.
- **Drizzle ORM**. En la Fase 1 usa **SQLite** local (cero configuración). En la Fase 2 se migra a **PostgreSQL de Supabase**.
- **Capa de acceso a datos separada** (`/src/server/repositories`) y **capa de autenticación separada** (`/src/server/auth`), de modo que cambiar de SQLite a Supabase y de auth local a Supabase Auth afecte solo esas capas y no las pantallas.
- Dinero: **enteros en centavos** (nunca decimales flotantes). Fechas en ISO 8601.
- Gráficas: Recharts o similar. Gantt: componente propio sencillo (SVG/CSS) o librería ligera.
- La app debe ser **responsive** (se usará mucho desde el celular) y accesible (contraste, foco visible, etiquetas).
- Pruebas: Vitest para unidades y Playwright para 3 o 4 flujos clave.

## 4. Usuarios, registro y roles

### Registro y aprobación
- Cualquier persona puede **registrarse** con nombre, correo y contraseña.
- Una cuenta nueva queda en estado **"sin asignar"**: solo ve una pantalla que dice que está pendiente de que un administrador le asigne rol y proyecto.
- Después, un **superusuario** o el **administrador de un proyecto** la asigna a un proyecto, con equipo y rol.
- Se puede **desactivar** o **rechazar** una cuenta. Opcional por configuración: lista de dominios de correo permitidos.
- El **primer superusuario** se crea con un script de seed (`npm run seed:superuser`), leyendo correo y contraseña de variables de entorno o de un prompt interactivo. No debe existir un superusuario por defecto con contraseña conocida.
- Incluye restablecimiento de contraseña (en la Fase 1 puede ser un token mostrado al superusuario; en la Fase 2 usa el flujo de Supabase).

### Dos niveles de rol
- **Rol global:** `superuser` o `user`.
- **Rol por proyecto:** `admin` (líder del proyecto) o `member`. Además, una marca opcional `is_team_lead` por equipo.
- Una persona puede ser administradora en un proyecto y miembro en otro.

### Matriz de permisos

| Acción | Superusuario | Admin del proyecto | Líder de equipo | Miembro |
|---|---|---|---|---|
| Crear, archivar y borrar proyectos | Sí | No | No | No |
| Asignar roles globales | Sí | No | No | No |
| Asignar usuarios a su proyecto, equipo y rol | Sí | Sí | No | No |
| Editar duración, fechas y configuración del proyecto | Sí | Sí | No | No |
| Crear y editar actividades, dependencias y RACI | Sí | Sí | Solo de su equipo | No |
| Cambiar estado de una actividad | Sí | Sí | Las de su equipo | Solo donde es R o A |
| Comentar y adjuntar archivos | Sí | Sí | Sí | Sí |
| Solicitar un cambio (alcance, fechas, presupuesto) | Sí | Sí | Sí | Sí |
| Aprobar o rechazar cambios y gastos | Sí | Sí | No | No |
| Registrar gastos (quedan pendientes de aprobación) | Sí | Sí | Sí | Sí |
| Editar presupuesto y partidas | Sí | Sí | Solo de su equipo | No |
| Descargar el contexto para agentes | Sí | Sí | De su equipo | No |
| Ver el panel de administración | Sí | De su proyecto | No | No |

**Toda autorización se valida en el servidor** con funciones centralizadas (`can(user, action, resource)`), con tests. Ocultar un botón en la interfaz nunca es suficiente.

## 5. Modelo de datos (mínimo; amplíalo si hace falta)

- **users**: id, name, email, password_hash (solo en modo local), global_role, status (`pending`, `active`, `disabled`), created_at.
- **projects**: id, name, description, start_date, **duration_weeks (editable)**, working_days_per_week (default 5), currency, status (`planning`, `active`, `closed`, `archived`), baseline_saved_at, cloned_from_id.
- **teams**: id, project_id, name, color (por defecto: Electrónica, Programación, CAD y Manufactura; nombres editables).
- **memberships**: id, project_id, user_id, team_id, project_role (`admin` o `member`), is_team_lead.
- **activities**: id, project_id, code (`ACT-1`, `ACT-2`... único por proyecto), parent_id (jerarquía WBS), title, description, team_id, status, priority, duration_days, planned_start, planned_end, actual_start, actual_end, is_milestone, deliverable, blocked_reason, sort_order, deleted_at.
- **activity_dependencies**: id, predecessor_id, successor_id, type (`FS` por defecto), lag_days, is_cross_team (calculado).
- **raci**: id, activity_id, user_id, letter (`R`, `A`, `C`, `I`).
- **change_requests**: id, project_id, activity_id (opcional), type, description, reason, impact, status (`pending`, `approved`, `rejected`), requested_by, decided_by, decided_at.
- **baselines** y **baseline_items**: foto del plan (fechas y duraciones) para comparar plan vs. real.
- **budget_items** (partidas): id, project_id, team_id, activity_id (opcional), category, name, quantity, unit_price_cents, supplier, url, notes, is_bom.
- **expenses**: id, project_id, budget_item_id (opcional), team_id, activity_id (opcional), amount_cents, date, paid_by, description, receipt_file_id, status (`pending`, `approved`, `rejected`), decided_by.
- **risks**: id, project_id, description, probability (1 a 5), impact (1 a 5), mitigation, owner_id, status.
- **checklists** y **checklist_items**: revisiones de diseño y entregables.
- **meeting_notes**: id, project_id, date, attendees, summary, agreements.
- **comments**: id, activity_id, user_id, body, created_at.
- **files**: id, project_id, activity_id (opcional), path, name, size, uploaded_by.
- **repositories**: id, project_id, team_id, github_owner, github_repo, webhook_secret_ref.
- **commit_links**: id, activity_id, repository_id, sha, message, author, url, committed_at.
- **audit_log**: id, user_id, entity, entity_id, action, before (JSON), after (JSON), created_at. **Todo cambio se registra.**

Usa **borrado lógico** (`deleted_at`) en entidades importantes. Nada se pierde por accidente.

## 6. Funcionalidades principales

### 6.1 Proyectos
- Crear varios proyectos a la vez. Duración en semanas **editable en cualquier momento** (8, 10, 12, etc.).
- Si al cambiar la duración hay actividades fuera del rango o la ruta crítica no cabe, muestra **advertencia clara** con cuántas semanas o días sobran. No bloquees, solo avisa y deja decidir.
- **Clonar proyecto / plantillas:** "Proyecto mecatrónico estándar" con WBS base (requisitos, concepto, diseño detallado, fabricación, integración, pruebas, documentación) por equipo. Al clonar se elige la duración en semanas y se reescalan las duraciones proporcionalmente (opción).
- Selector de proyecto siempre visible. Cada usuario ve solo sus proyectos.

### 6.2 Actividades, WBS y RACI
- Árbol de actividades (padre e hijas) con edición en línea tipo hoja de cálculo.
- Estados: `Pendiente`, `En progreso`, `Bloqueada`, `En revisión`, `Hecha` (y `Cancelada`). Si es `Bloqueada`, exige motivo.
- El progreso de una actividad padre se calcula a partir de sus hijas.
- **Matriz RACI** por actividad. Validaciones: **exactamente una A** y **al menos una R**. Muestra advertencia visible en actividades que no cumplan.
- **Dependencias entre equipos:** si el predecesor y el sucesor son de equipos distintos, márcalo con un ícono y muéstralo en una vista "Interfaces entre equipos" (ej. CAD necesita dimensiones de la PCB, firmware necesita el pinout).
- Vista **"Mis tareas"**: lo que me toca (R o A), ordenado por fecha, con acciones rápidas para cambiar el estado.

### 6.3 Filtros (en todas las listas, Kanban y Gantt)
Filtros combinables y guardables en la URL:
- **Estado**, incluyendo **"Completadas"** y **"No completadas"**
- Equipo, persona, letra RACI (R/A/C/I)
- Prioridad
- **Crítica** (en la ruta crítica)
- **Vencidas**, **bloqueadas**, **próximas a vencer** (7 días)
- **Semana** del proyecto, rango de fechas
- **Con commits** / **sin commits** (programación)
- Búsqueda de texto
- Chips de filtros rápidos arriba y botón "Limpiar filtros". Mostrar el conteo de resultados.

### 6.4 Ruta crítica (CPM)
Implementa el cálculo en un módulo puro y testeado (`/src/lib/cpm.ts`):
- Entrada: actividades hoja, duraciones en días hábiles, dependencias FS con lag.
- **Pasada hacia adelante** (inicio y fin más temprano) y **hacia atrás** (inicio y fin más tardío); **holgura total = tardío − temprano**. **Ruta crítica = holgura 0.**
- **Detecta ciclos** y rechaza la dependencia con un mensaje claro.
- Calcula la **fecha fin del proyecto** y la compara con `start_date + duration_weeks`. Si se pasa, muestra la alerta **"La ruta crítica excede el proyecto por X días"**.
- Al editar la duración de una actividad, **muestra la vista previa del impacto** en la fecha final antes de confirmar.
- Las actividades críticas se marcan en rojo en lista, Kanban y Gantt. Muestra la holgura en días en cada actividad.
- **Línea base:** botón "Guardar línea base". Después se muestra plan vs. real (desvío en días por actividad y global).
- Tests obligatorios: red simple, múltiples rutas, lag, hitos, ciclo, actividades sin dependencias, cambio de duración.

### 6.5 Dashboard y vistas
- **Resumen:** avance global y por equipo, actividades vencidas, bloqueadas y próximas, solicitudes de cambio pendientes, gastos pendientes de aprobar.
- **Kanban** por estado (arrastrar y soltar).
- **Gantt** por semanas (Semana 1 a N) con ruta crítica resaltada, hitos y dependencias.
- **Curva S / burndown:** avance planeado vs. real por semana.
- **Carga por persona y por semana** para detectar sobrecarga.
- **Semana actual** destacada.
- **Calendario/lista de hitos y entregables.**

### 6.6 Presupuesto y gastos
- Presupuesto por **partidas** (ítem, categoría, cantidad, precio unitario, proveedor, link), por equipo y opcionalmente ligadas a una actividad. **Todo editable en línea.**
- Los **gastos reales** los registra cualquier miembro (con foto o PDF del comprobante); quedan **pendientes** hasta que un admin los apruebe. Solo los aprobados cuentan en el total oficial (muestra también el total pendiente aparte).
- La **BOM (lista de materiales)** es una vista de las partidas marcadas `is_bom`, y alimenta el presupuesto.
- Dashboard de costos: **presupuestado, gastado, restante y % ejecutado**, por proyecto, equipo y categoría. Alertas al **80 %** y al **100 %**.
- Comparación **costo vs. avance** (si se gastó el 70 % y se avanzó el 40 %, resaltarlo).
- Moneda configurable por proyecto. Exportar a CSV/Excel.

### 6.7 Cambios y ajustes
- **Solicitudes de cambio** (alcance, fechas, duración, presupuesto) con motivo e impacto; estados pendiente, aprobada, rechazada. Al aprobar, el cambio se puede aplicar con un clic y queda en el historial.
- **Historial/auditoría** visible por actividad y por proyecto: quién, qué, cuándo, valor anterior y nuevo.

### 6.8 Riesgos, revisiones y bitácora
- **Registro de riesgos** con matriz probabilidad × impacto.
- **Checklists** de revisión de diseño y de entregables (plantillas por equipo: esquemático revisado, STEP exportado, firmware probado, etc.).
- **Actas de reunión** con acuerdos que se pueden convertir en actividades.
- Archivos adjuntos por actividad o proyecto (límite de tamaño configurable).

### 6.9 Panel de administración
- Lista de usuarios con filtros por estado (`sin asignar`, `activo`, `desactivado`). Asignar rol global, proyecto, equipo, rol de proyecto y líder de equipo.
- Gestión de proyectos, equipos, plantillas, categorías de presupuesto.
- Ver el **registro de auditoría** global.
- Configuración (dominios permitidos, tamaño máximo de archivos, moneda por defecto).

## 7. Resumen de contexto para agentes de IA (para líderes)

Los líderes (admin del proyecto y líderes de equipo) deben poder **descargar un archivo** que suban a su agente de IA para que sepa cómo va el proyecto y los ayude a **designar y balancear actividades**.

- Botón **"Descargar contexto para mi agente"** en el proyecto y en cada equipo. Permite elegir el **alcance** (proyecto completo o un equipo) y el **formato**: **Markdown** (principal) y **JSON**.
- Se genera **en el momento**, con datos actuales, y lleva la fecha y hora.
- Estructura del Markdown (respeta este orden):

```
# Contexto del proyecto: <nombre>
Generado: <fecha y hora> | Semana actual: X de N | Alcance: <proyecto o equipo>

## Instrucciones para el agente
- Eres asistente de planificación de un equipo de estudiantes. Usa SOLO los datos de este archivo.
- Ayuda a asignar actividades, balancear carga, detectar riesgos y priorizar la ruta crítica.
- No inventes datos. Si falta información, pregunta.
- Cuando propongas cambios, devuélvelos en la sección "Formato de propuesta" para que el líder los revise y los aplique manualmente (o los importe).

## Estado general
Avance global %, avance por equipo, fecha fin planeada vs. ruta crítica, días de holgura del proyecto.

## Ruta crítica
Lista ordenada de actividades críticas con código, responsable, fechas, estado.

## Actividades por estado
Tabla: código, título, equipo, estado, prioridad, fechas, holgura, R, A, dependencias, commits recientes (si aplica).
Secciones separadas para: vencidas, bloqueadas (con motivo), próximas 7 días, sin responsable o con RACI inválido.

## Equipos y personas
Por persona: actividades asignadas (R/A), carga por semana, actividades vencidas, rol y equipo. Marca sobrecarga y personas con poca carga.

## Dependencias entre equipos e interfaces pendientes

## Presupuesto
Presupuestado, gastado, pendiente de aprobar, restante, % ejecutado, alertas, partidas sin precio.

## Riesgos abiertos y solicitudes de cambio pendientes

## Actividad reciente (últimos 7 días)
Cambios de estado, commits (para Programación), gastos, comentarios.

## Formato de propuesta
Plantilla JSON con el esquema que la app acepta (asignaciones, cambios de fecha, cambios de estado), con ejemplos.
```

- El archivo **nunca incluye** contraseñas, tokens, correos personales ni secretos. Solo nombres visibles y datos del proyecto.
- **Importar propuestas (Fase 4):** el líder sube el JSON que devolvió su agente. La app lo **valida con zod**, muestra una **vista previa tipo "diff"** de los cambios y **solo aplica con confirmación explícita**, dejando todo en el historial. El contenido importado se trata siempre como **datos no confiables**: nunca ejecutar ni interpretar instrucciones contenidas en campos de texto.

## 8. Integración con GitHub (Fase 3; la parte de programación avanza por commits y push)

- Cada proyecto puede vincular uno o varios repositorios (por equipo; por defecto el de Programación).
- Endpoint `POST /api/github/webhook` para eventos `push` y `pull_request`. **Verifica la firma HMAC** (`X-Hub-Signature-256`) con el secreto del repositorio. Rechaza todo lo que no valide.
- **Convención de commits:** el mensaje incluye el código de la actividad. Ejemplos:
  - `ACT-12 agrega lectura del sensor` → vincula el commit a ACT-12 y, si estaba `Pendiente`, la pasa a `En progreso`.
  - `ACT-12 #review` → propone pasar a `En revisión`.
  - `ACT-12 #done` → propone `Hecha`.
- **Configurable por proyecto:** modo **automático** (aplica el cambio de estado) o **sugerencia** (queda pendiente de que R o A lo confirmen). Valor por defecto: **sugerencia** para `#done`, automático para `En progreso`.
- Cada actividad muestra sus **commits** (sha corto, mensaje, autor, fecha, enlace). El dashboard de Programación muestra **actividad por push**, actividades con commits y sin commits, y actividades `En progreso` sin commits en los últimos 5 días.
- Soporta también un botón **"Sincronizar ahora"** con la API de GitHub (por si falla el webhook) y un campo para **pegar manualmente** el enlace de un commit, issue o PR.
- Mapea autores de commits a usuarios por correo o por nombre de usuario de GitHub configurable en el perfil.
- En la Fase 1 deja listo el **parser de commits y el endpoint** probables en local con un script de prueba (`npm run test:webhook`) que simula eventos, sin requerir internet.
- Incluye en `docs/GITHUB.md` una guía para estudiantes sin experiencia: cómo escribir los mensajes de commit, cómo usar GitHub Desktop, estructura recomendada del repo (`/electronica`, `/firmware`, `/cad`, `/docs`) y uso de Git LFS para STEP, STL y KiCad.

## 9. Seguridad y calidad

- Contraseñas con **argon2 o bcrypt**. Sesiones por cookie `httpOnly`, `secure` y `sameSite`. Protección CSRF y **límite de intentos de login**.
- Autorización **en el servidor** para cada acción y consulta. En la Fase 2, además, **Row Level Security (RLS)** en Supabase con las mismas reglas.
- Validación con zod en todas las entradas. Sanitiza texto que se muestre. Los archivos subidos se validan por tipo y tamaño.
- Sin secretos en el código. Variables en `.env` (y en Vercel en producción).
- Los logs no deben contener contraseñas ni tokens.
- Backups: botón de **exportar proyecto completo a JSON** (y reimportar) para el superusuario.

## 10. Datos de demostración (seed)

Script `npm run seed:demo` que cree:
- **Dos proyectos:** uno de **8 semanas** y otro de **10 semanas**, con los 3 equipos, 8 a 10 usuarios de prueba (con contraseña de demo documentada solo para entorno local), actividades con dependencias (incluyendo cruzadas entre equipos), RACI, estados variados, una actividad bloqueada, una vencida, partidas de presupuesto, gastos pendientes y aprobados, riesgos y commits simulados.
- Debe haber al menos un caso donde la ruta crítica **excede** la duración del proyecto, para demostrar la alerta.

## 11. Fases de entrega

### Fase 1: app local (sin Supabase, sin Vercel, sin GitHub real)
**1A: base**
1. Proyecto Next.js, Tailwind, Drizzle + SQLite, capas de repositorio y auth, estructura de carpetas y README.
2. Registro, login, estado "sin asignar", seed del superusuario, panel de administración de usuarios y asignación de roles.
3. Proyectos (varios, duración editable), equipos, membresías, selector de proyecto.
4. Actividades con WBS, estados, prioridad, edición en línea, comentarios, auditoría.
5. RACI con validaciones, "Mis tareas", **filtros completos** (sección 6.3), vista Kanban.
6. Permisos centralizados con tests.

**1B: planificación y control**
7. **Ruta crítica (CPM)**, dependencias, alertas de duración, línea base, Gantt, vista previa de impacto.
8. Dashboard, curva S, carga por persona.
9. **Presupuesto, gastos, BOM**, aprobaciones y dashboard de costos.
10. Solicitudes de cambio, riesgos, checklists, actas, archivos (almacenamiento local en disco).
11. **Descarga de contexto para agentes** (Markdown y JSON) para líderes.
12. Parser de commits y endpoint del webhook probables en local, plantillas y clonado de proyecto, seed de demo, exportaciones CSV.

**Criterios de aceptación de la Fase 1:** instalar y correr con 3 comandos; se puede registrar un usuario, asignarle rol y proyecto; existen 2 proyectos de duraciones distintas; al cambiar `duration_weeks` o la duración de una actividad se recalcula la ruta crítica; se puede filtrar por completadas; el presupuesto muestra presupuestado vs. gastado; se descarga el contexto del equipo; los tests pasan.

### Fase 2: Supabase + Vercel
1. Crea el esquema en **PostgreSQL de Supabase** con migraciones versionadas (`/supabase/migrations`).
2. Cambia la autenticación a **Supabase Auth** (registro, login, restablecer contraseña) y vincula con la tabla de perfiles. Mantén el flujo "sin asignar" → asignación de roles.
3. Implementa **RLS** equivalente a la matriz de permisos y pruebas que la verifiquen.
4. Cambia los archivos a **Supabase Storage** (comprobantes, adjuntos) con políticas por proyecto.
5. Script de **migración de datos** de SQLite a Supabase (opcional) y guía `docs/DEPLOY.md` paso a paso: crear el proyecto en Supabase, variables de entorno, desplegar en Vercel, crear el superusuario, dominios.
6. Mantén un **modo local** funcional para desarrollo.
7. Documenta que el plan gratuito de Supabase **pausa proyectos tras una semana sin actividad** y cómo evitarlo o restaurar (incluye una tarea programada simple que haga una consulta periódica, si es viable, y la opción de plan de pago).

### Fase 3: GitHub
- Webhook real con verificación de firma, vínculo de repositorios, convención `ACT-n`, estados sugeridos o automáticos, vista de commits por actividad, sincronización manual y guía `docs/GITHUB.md`.

### Fase 4: extras
- Importar propuestas de agentes con vista previa y confirmación.
- Notificaciones por correo (vencidas, gastos pendientes, cambios aprobados).
- Exportar PDF del cronograma y del presupuesto.
- Registro de horas opcional.
- Mejoras de rendimiento y accesibilidad.

## 12. Entrega esperada en cada fase

1. Código funcionando y tests pasando.
2. `README.md` y `docs/` actualizados.
3. `docs/DECISIONS.md` con las decisiones tomadas.
4. Un **resumen corto** al final con: qué se hizo, cómo probarlo, qué falta y qué decisiones necesitan confirmación.
5. **Detenerse y esperar** la confirmación antes de empezar la siguiente fase.
