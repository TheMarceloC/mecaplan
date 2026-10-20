# Contexto vigente para el análisis

El 19 de octubre de 2026 el usuario solicitó un nuevo ZIP para que otra persona analice el proyecto, después de completar las mejoras locales. Esta solicitud sustituye la cancelación anterior del empaquetado; los ZIP 0.2.0 históricos no se incluyen ni representan esta entrega.

MecaPlan es una aplicación local para gestión de proyectos MEC402 / Diseño Mecatrónico, en español y con estética UNITEC. Usa Next/React/TypeScript, SQLite, Drizzle y bcrypt. Las versiones exactas se encuentran en package.json y pnpm-lock.yaml.

Las fases 1A y 1B incluyen actividades/WBS/RACI, planificación CPM/Gantt, línea base, curva S, presupuesto/BOM, gastos aprobables, solicitudes de cambio, riesgos, bitácoras, actas, recepción de línea base, aceptación y listas de revisión. Se añadieron importaciones Excel con vista previa y confirmación; equipos configurables; códigos por equipo/alias; eliminación de proyectos y registros; matriz de riesgos legible y contexto ampliado.

Decisiones que deben conservarse: los seis integrantes de Programación tienen acceso global completo, Carlos Marcelo Alvarado es líder de integración y Juan Miguel Mejía Saavedra es administrador y evaluador independiente. La evaluación docente permanece privada frente a estudiantes, incluidos superusuarios. La instalación real conserva sus cuentas; este paquete no las transfiere.

Digit 360 se importó de la matriz original: 25 actividades y 18 integrantes (17 estudiantes y docente), con 11 hojas de referencia. Fechas/duraciones/dependencias ausentes no fueron inventadas: tareas sin planificar usan 1 día provisional. Mantén IDs internos y alias ACT/DIG al cambiar códigos visibles ELE/PRO/MAN/INT u otros prefijos.

OneDrive es institucional de UNITEC. Los documentos deben conservarse allí aunque se retiren enlaces o se eliminen proyectos en la app. Las tablas/cuentas/evaluaciones siguen en SQLite. La asociación de enlaces funciona; la conexión para subir/migrar está implementada, pero faltan configuración y consentimiento Microsoft. El archivo original local aún no se ha migrado. Hay una cuenta de almacenamiento por instalación; compartir un enlace en la app no concede permisos Microsoft.

Los contextos de agentes se generan con los datos guardados al descargarlos. Las copias antiguas no se actualizan; un Excel modificado en OneDrive requiere nueva importación. No se aprobó sincronización automática. Gastos importados quedan pendientes y cerrar actividades de Digit 360 requiere evidencia y revisión de otro equipo.

Comprobaciones repetidas al preparar este paquete: 44 pruebas unitarias y TypeScript sin errores. Comprobaciones de la implementación anterior documentadas: 85 validaciones HTTP, webhook simulado y build Webpack satisfactorios. Esto no acredita OneDrive real, despliegue público ni auditoría exhaustiva de seguridad o accesibilidad. Se incluye una instantánea mínima de conteos, sin registros personales ni evaluaciones.

El importador histórico específico de Digit 360 necesita archivos privados y rutas originales que este paquete no contiene; no es necesario para ejecutar la demo ni el importador web general. Los scripts de empaquetado históricos son referencias, no pasos obligatorios para revisar la aplicación. No se publica ni despliega nada en esta entrega.
