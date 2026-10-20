> Referencia histórica anterior a 0.3.1. El estado vigente y los resultados actuales están en ESTADO_ENTREGA.md, CHANGELOG_0.3.1.md y VALIDATION.md. Las capturas antiguas ilustran versiones anteriores.

# Planificación y control local

## Uso inicial de Digit 360

1. Abre la aplicación e ingresa con correo o usuario y la contraseña inicial del libro privado de accesos. Cambia esa contraseña antes de acceder al proyecto.
2. En Matriz de gestión, revisa el RACI importado y las hojas originales. El contenido del Excel se trata como datos de referencia.
3. En Cronograma → Ruta crítica, selecciona Planificar. Define duración, predecesoras y desfases, calcula la vista previa y confirma. Un administrador que aplica el plan recalcula las fechas de todas las actividades hoja; por eso deben revisarse primero las duraciones provisionales.
4. Guarda una línea base cuando el equipo apruebe el plan. El Gantt y la tabla de ruta crítica muestran el desvío respecto a esa versión.
5. Registra partidas y marca las que pertenecen a la BOM. Carga comprobantes en Archivos y vincúlalos al gasto. Solo la aprobación incorpora el gasto al total oficial.
6. Guarda evidencias en la actividad. Una persona de otro equipo debe confirmar su propia revisión desde su cuenta; después R/A puede marcar Hecha.

Los registros PA1–PA3 importados permanecen pendientes hasta introducir objetivo, medición y evidencia. Los hitos con fecha ausente quedan sin fecha; no se completan automáticamente. Los puntos de los avances son los de la fuente, independientes de las rúbricas privadas del ingeniero.

## Evaluación independiente

El ingeniero tiene una entrada exclusiva en la navegación. Puede evaluar proyecto, equipo, persona o actividad, con criterios, puntuación máxima, comentarios y notas. La validación impide una puntuación mayor que su máximo. Finalizar una evaluación conserva su carácter privado. Los administradores de Programación no reciben estas evaluaciones en la API, los respaldos, el historial compartido ni el contexto de IA. La bandera de docente no se puede conceder desde el panel de estudiantes.

## Cálculos y límites

- CPM utiliza actividades hoja, dependencias Finish-to-Start y desfase entero. Las pasadas temprana/tardía producen holgura total; cero identifica actividades críticas. Se rechazan ciclos. El límite es el menor entre el rango del proyecto y la entrega configurada.
- El calendario considera de uno a siete días hábiles, empezando por lunes; no incluye feriados. Duración es un esfuerzo estimado para la carga y una duración transcurrida hábil para CPM. La carga se reparte entre R y excluye actividades sin planificar; es una aproximación, no horas registradas.
- El gasto se suma en centavos enteros. Las cantidades son enteras. Los umbrales del 80% y 100% y la matriz de riesgos son indicadores de gestión, no reglas de evaluación del curso.
- La curva real usa finalizaciones y capturas desde que se habilitó esta función. Los ejemplos etiquetados demo sí contienen fechas históricas de demostración.
- Los cambios de precio usan centavos; los CSV indican esa unidad. CSV puede abrirse en Excel. El original XLSX de la matriz permanece disponible como referencia.
- El almacenamiento y la cola de escritura corresponden a un solo proceso Node local. No hay RLS de Supabase, colaboración distribuida ni alojamiento público en esta fase.
- Las propuestas exportadas para IA requieren revisión y aplicación manual. No se ejecutan instrucciones de archivos ni se importan propuestas automáticamente.

## Estructura añadida

`domain.ts` y `phase-schema.ts` contienen los modelos Zod; `cpm.ts`, `control.ts` y `agent-context.ts` contienen los cálculos y exportaciones. `control-service.ts` aplica permisos y auditoría; `global-service.ts` maneja plantillas, clonado y restauración. La tabla `evaluations` es independiente de los agregados de proyecto. `write-lock.ts` serializa escrituras de app, adjuntos y webhook en un único proceso.

Las migraciones de columnas de usuario y la tabla de evaluaciones son idempotentes. SQLite WAL y archivos permanecen en `data`. Las contraseñas se verifican contra hashes bcrypt; el libro de entrega es el único artefacto para repartir las contraseñas iniciales. Los archivos de trabajo de importación y credenciales también se excluyen de Git.
