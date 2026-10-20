# Decisiones de 0.3.1

- Conservar stack y datos, reparar reglas compartidas y ampliar el uso diario sin recrear la aplicación.
- Usar guardia de cuenta activa también para funciones globales. La pantalla pendiente conserva sesión pero no capacidades.
- Separar identidad interna, código visible y referencia externa. No reescribir claves al resolver una fila por código.
- Hitos: un hito FS de cero días se representa en el siguiente instante hábil. El fin global usa el mismo mapeo que el Gantt; no puede precederlo.
- Carga: dividir esfuerzo por días laborables de la intersección y responsables R. Si no hay esfuerzo explícito, usar duración como aproximación. No se afirma medición de horas reales.
- Curva: captura anterior al corte como estado conocido, luego eventos posteriores; fechas reales como respaldo si falta captura. Historia desconocida permanece sin medición.
- Aprobaciones vinculadas al contenido: una edición sustantiva invalida la aprobación docente de un hito.
- Notas privadas: guardar versiones y conservarlas al eliminar proyectos, sin incluirlas en respaldos ordinarios para alumnos. El respaldo de instalación sí es privado y completo para los datos locales.
- Cookie Lax para retorno OAuth GET, conservando Origin en escrituras y state/PKCE ligado a la sesión iniciadora.
- Subidas: ID de operación, ruta remota estable, registro del ID remoto antes de verificar y cola propia. No eliminar automáticamente documentos huérfanos; permitir reconciliación/reintento.
- Conservar la matriz original y la plantilla como fuentes. No inferir datos reales ausentes ni ejecutar instrucciones de sus celdas.
- Mantener fases externas pendientes y documentadas. Publicar o autorizar Microsoft no es un requisito para revisar el ZIP local.
- Usar pnpm 11 con overrides en pnpm-workspace.yaml, según https://pnpm.io/settings . ExcelJS usa v4 de uuid y sus pruebas se ejecutan con el reemplazo compatible 11.1.1.
