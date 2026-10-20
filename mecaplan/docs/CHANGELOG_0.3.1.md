# Cambios de 0.3.1

## Correcciones de la auditoría

| Hallazgo | Implementación |
|---|---|
| H01 | Guardias de cuenta activa y cambio obligatorio en permisos, rutas globales, administración y OneDrive; pruebas HTTP negativas |
| H02–H03 | Resolución separada de Código/Referencia, conflictos y filas al mismo ID rechazados, referencia externa conservada |
| H04 | Cookie Lax, state/PKCE y correlación ligada al hash de sesión; rechazo si cambia la sesión |
| H05 | Destinos tipados, unidades y preview antes/después; rechazo de destino inexistente y solicitud obsoleta |
| H06 | Edición sustantiva invalida aprobación docente del hito; edición idéntica la conserva |
| H07 | Validación de gasto/partida/equipo/actividad/comprobante tras mezclar datos; protección al mover partidas |
| H08 | Intersecciones de días laborables y reparto conservativo de carga semanal |
| H09 | Transición compartida para formulario, estado rápido, cambios, importación y webhook; fechas/reaperturas coherentes; curva basada en captura/eventos |
| H10 | Fin global derivado de fechas de eventos; coherencia con hitos terminales |
| H11 | Clonado excluye papelera, remapea desfases y conserva revisión cruzada |
| H12 | Hojas activas como denominador común de avance y costo/avance |
| H13 | Asignar membresía no permite reactivar docentes desde cuenta estudiantil |
| H14 | Versiones privadas de evaluación y retención independiente al eliminar un proyecto |
| H15 | Depuración recursiva de campos exportables y patrón equivalente en Markdown; aviso de textos no confiables |
| H16 | Limpieza explícita de Partida/Comprobante con [vacío] |
| H17 | Selectores actuales, servidor/datos aislados y flujos E2E ampliados |
| H18 | Componente común de diálogo con foco inicial, Tab, Escape y restauración de foco |

## Mejoras incluidas

- Preparar el proyecto: cobertura de RACI, confirmación de fechas/duración/esfuerzo y línea base revisada.
- Entregas entre equipos: criterio, evidencia, fecha y aceptación del receptor; la recepción pierde vigencia si cambia la evidencia de origen.
- Reunión semanal y comparación línea base/plan/real, con impresión desde navegador.
- Mis tareas para miembros, próximos compromisos y bloqueos; etiqueta Integrantes en vez de presencia no medida.
- Gasto pendiente corregible con historial y comprobante por enlace desde el mismo formulario.
- Riesgos con acción próxima y vencimiento.
- Filtrado por intersección de semana, orden natural para prefijos y columna Cancelada cuando aplica.
- Excel con filas sin cambios y auditoría por registro. Gastos decididos idénticos se conservan; cambios financieros se rechazan.
- Límites del cuerpo por bytes reales y autenticación antes de procesar importaciones/subidas.
- Subidas/migraciones con operación durable, ruta estable de reintento y verificación antes de enlazar. La red no retiene la cola global.
- Inicialización diferida y transaccional de SQLite; la compilación no crea la base de la instalación. Las ediciones de estados históricos conservan fechas reales desconocidas.
- Control de revisión de payload, diagnóstico de solo lectura, respaldos y restauración verificada.
- Dependencia transitiva uuid de ExcelJS fijada a 11.1.1 mediante pnpm-workspace.yaml; código formateado con Prettier.

La matriz original y plantilla XLSX se conservaron. No se crearon notas, contraseñas del curso, fechas faltantes ni revisiones ficticias.
