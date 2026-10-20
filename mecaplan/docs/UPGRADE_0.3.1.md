# Actualizar con datos existentes

1. Detén el servidor de la instalación anterior. Copia su carpeta `data` completa y `.env.local` a un respaldo privado.
2. Extrae el ZIP en una carpeta nueva. Ejecuta `pnpm install --frozen-lockfile` dentro de `mecaplan`.
3. Copia una **copia** de los datos anteriores a `data`, conservando la original. No ejecutes seeds ni importadores históricos para actualizar.
4. Ejecuta `pnpm run diagnose`. Comprueba que los conteos de proyectos coincidan y revisa los problemas que informe. Es solo lectura; no corrige asociaciones ambiguas a ciegas.
5. Ejecuta `pnpm run dev`. Al abrir la base se agregan tablas de versiones privadas, retención, operaciones de almacenamiento y registro de migración. Los payloads se leen con campos nuevos opcionales.
6. Comprueba proyectos, integrantes, alias, contraseñas, fechas y adjuntos en la copia. Las cuentas pendientes no pueden usar funciones protegidas; el docente sigue separado de estudiantes superusuarios.
7. Después de verificar, usa la carpeta nueva como instalación. Para volver atrás conserva juntos el código y los datos anteriores.

## Cambios de comportamiento

- Una edición de hito aprobado por un alumno solicita nueva aprobación si cambian contenido, criterios, fecha o puntos.
- Una solicitud de cambio conserva el valor base y falla si ese destino cambió mientras esperaba aprobación. Las solicitudes antiguas sin ese dato se validan contra un destino existente antes de aplicar.
- Editar evidencia de una actividad hecha la devuelve a revisión y limpia su fin real actual. No se inventa el historial anterior que no estaba registrado.
- Excel conserva referencias; celdas omitidas conservan datos y [vacío] limpia campos opcionales. Los gastos decididos son inmutables, aunque una fila idéntica permite reimportar el resto.
- Eliminar un proyecto conserva las notas privadas en un archivo docente. No modifica ni elimina documentos Microsoft.
- Para proyectos con datos financieros inconsistentes, corrige de manera explícita la asociación indicada por diagnóstico. Conserva el respaldo y revisa antes de importar.

La base real del curso no está dentro del paquete recibido; estos pasos no equivalen a afirmar que esa instalación privada ya fue migrada.
