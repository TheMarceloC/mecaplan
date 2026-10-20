# MecaPlan 0.4.0

- Tablero Kanban como opción principal de Proyecto, con las mismas seis categorías, filtros, tarjetas, detalle y reglas de cambio de estado. Cancelada permanece disponible aunque esté vacía. La navegación principal de Actividades vuelve a lista.
- Persistencia asíncrona seleccionable: SQLite local o PostgreSQL de Supabase. Las rutas de aplicación, evaluaciones, importación, auditoría y caché de OneDrive usan el adaptador común. Las transacciones y las comprobaciones de versión se conservan.
- Esquema privado PostgreSQL aditivo, RLS y exclusión de roles públicos. Los permisos por usuario siguen aplicándose en las API con la autenticación existente.
- Bloqueos persistidos para coordinar escrituras y tokens OneDrive entre instancias, con lease, renovación y liberación. Las operaciones de subida se conservan fuera de las transacciones de red.
- Herramientas cloud:setup, cloud:migrate y cloud:check. La migración sólo analiza por defecto; --apply exige destino vacío, documentos en OneDrive y verificación transaccional de los datos.
- Preparación de Vercel, Node 24.x, variables privadas, exclusión de datos/backups en el despliegue y comprobación previa a la construcción. Demostración deshabilitada en PostgreSQL/Vercel.
- OneDrive mantiene los documentos; los tokens cifrados van en PostgreSQL y la clave permanece en variables privadas. No se generan claves efímeras ni adjuntos locales en la nube.
- Límites de subida e importación ajustados al entorno, visibles en la interfaz. Los enlaces admiten documentos mayores subidos directamente a OneDrive.

No se publicaron datos reales ni se crearon recursos remotos. La configuración y el corte están descritos en VERCEL_SUPABASE.md. La base local conserva sus proyectos y usuarios.

La construcción también ejecuta una guarda portable de manifiestos para excluir datos y respaldos privados de las trazas generadas. Esta comprobación complementa .gitignore, .vercelignore y outputFileTracingExcludes.

