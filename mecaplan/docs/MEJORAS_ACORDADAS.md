> Referencia histórica anterior a 0.3.1. El estado vigente y los resultados actuales están en ESTADO_ENTREGA.md, CHANGELOG_0.3.1.md y VALIDATION.md. Las capturas antiguas ilustran versiones anteriores.

# Mejoras implementadas en MecaPlan 0.3.0

Estado actualizado: las mejoras de esta tabla están implementadas en el código y comprobadas localmente. La cuenta elegida es OneDrive institucional de UNITEC; falta registrar/autorizar la aplicación para verificar una subida real. Véase ONEDRIVE.md. Se conservan fase 1B, diseño y datos.

| Mejora | Resultado esperado y aceptación |
|---|---|
| Plantillas Excel | Hojas de Actividades, Presupuesto/BOM, Gastos, Riesgos, Bitácoras, Actas, Recepción de línea base, Pruebas de aceptación y Listas de revisión; guía y columnas obligatorias claras (sin filas de ejemplo que puedan importarse accidentalmente). |
| Importar a tablas | Validación antes de guardar, errores por fila/columna, vista previa, confirmación, agregar/actualizar por identidad sin duplicados. No borrar filas ausentes ni inventar datos. Respetar permisos y reglas de aprobación. |
| OneDrive | Archivos originales y adjuntos en OneDrive, con enlaces y metadatos mínimos en la app; tablas/roles en la base. Cuenta institucional UNITEC; conexión OAuth pendiente de configuración externa. Ya se pueden asociar enlaces. |
| Conservar documentos | Al eliminar un proyecto en la app se conservan sus documentos en OneDrive. Migrar adjuntos existentes solo tras verificar copia y enlaces. |
| Eliminar proyectos | Eliminación definitiva para superusuarios con confirmación por nombre. Validar en servidor, limpiar referencias y probar en datos temporales. |
| Crear equipos | Nombre, color, integrantes, líder y prefijo por proyecto; validar duplicados y pertenencia; conservar referencias al editar. Crear equipo no concede permisos globales. |
| Códigos de actividad | Propuesta: ELE-001, PRO-001, MAN-001, INT-001; prefijos configurables, secuencias por equipo/proyecto, ID interno estable y alias históricos. Actualizar importación, parser, búsqueda y exportaciones. Al mover de equipo se reasigna el código y se conservan los anteriores como alias. |
| Riesgos | Código RIE-001 y descripción, «1 riesgo» como contador, matriz seleccionable y listado filtrado de nombres/responsables/mitigación. El contador y probabilidad×impacto son distintos. |
| Hidratación | Se limita suppressHydrationWarning al elemento html para los atributos inyectados de la advertencia reportada. El navegador de prueba no muestra avisos de hidratación; no se atribuye la extensión a una causa reproducida en todos los equipos. |
| Contextos IA | Se generan frescos al descargar; ampliar con registros, acuerdos, revisión y resultados. Excluir notas privadas/secretos/correos. Las copias descargadas no se actualizan solas. |

## Decisiones que se conservan

- Programación: seis superusuarios. Carlos Marcelo: líder de integración. Ingeniero: administrador y evaluador privado. Un administrador estudiante no obtiene acceso a evaluaciones.
- Un miembro ve los equipos de sus proyectos; edita estados como R/A y sus registros. El líder edita actividades/presupuesto de su equipo y descarga su contexto. El administrador de proyecto gestiona su proyecto. Solo el superusuario administra globalmente; evaluar requiere la bandera docente.
- En Digit 360, cerrar una actividad exige evidencia y revisión de otro equipo. Los gastos nuevos quedan pendientes; solo aprobados cuentan oficialmente. Las importaciones no evaden estas reglas.
- Los 3 trabajos en progreso por persona son un aviso de referencia, no un bloqueo duro actual. La matriz de riesgos tampoco constituye una escala de calificación del curso.
- Los 25 días de duración iniciales no forman un cronograma real: son 25 actividades con 1 día provisional cada una y sin dependencias. Es necesario confirmar un plan.
- Excel modificado en OneDrive: hay que volver a importar. No se acordó sincronización automática ni actualización en segundo plano de archivos ya entregados a agentes.

## Fuera de esta ampliación

Supabase/Vercel y acceso público (fase 2), GitHub real/sincronización (fase 3), importación automática de propuestas IA, notificaciones, PDF y horas (fase 4). No confundir endpoint HMAC local probado con GitHub real conectado.
