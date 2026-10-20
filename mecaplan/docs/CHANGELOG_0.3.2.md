# MecaPlan 0.3.2

Integra las correcciones H01–H18 y las mejoras de preparación, entregas entre equipos, reunión semanal, gastos y riesgos documentadas en CHANGELOG_0.3.1.md.

- R01: revisión por actividad para guardar el formulario, planificación, evidencia y revisión cruzada. Una edición obsoleta recibe HTTP 409 y conserva su borrador; debe recargar la actividad antes de reintentar. Los comentarios independientes no invalidan el borrador. Guardar evidencia actualiza la revisión del formulario abierto.
- R02: restaurar un proyecto JSON invalida las aprobaciones docentes de sus hitos. El ingeniero debe revisarlos y aprobarlos nuevamente; un estudiante superusuario no puede introducir una aprobación por restauración. La actualización de la base SQLite existente conserva sus datos y aprobaciones.
- R03: el archivo privado docente permite abrir las versiones históricas de evaluaciones incluso después de eliminar el proyecto. El servidor mantiene el acceso restringido a cuentas docentes activas.
- R04: la carga se distribuye y suma sin redondeo intermedio. La presentación semanal usa aproximaciones y muestra el total calculado con precisión completa.
- Regresiones: tres pruebas unitarias adicionales y script HTTP test:corrections. Se agregan dos escenarios de navegador para revisión cruzada y aprobación de cambios; su ejecución automatizada no se afirma en esta actualización.
- El servidor de desarrollo usa Webpack, igual que la compilación validada. El servidor Turbopack de pruebas mostró consumo sostenido de CPU y dejó de responder en esta carpeta de trabajo.

No se inventaron fechas, notas ni revisiones para el proyecto del curso. OneDrive institucional requiere la configuración y el consentimiento externos descritos en ONEDRIVE.md.
