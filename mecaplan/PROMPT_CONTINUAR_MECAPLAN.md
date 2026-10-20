# Continuidad — MecaPlan 0.4.0

La petición vigente añade Tablero Kanban al menú principal y prepara Vercel + Supabase. El usuario confirmó OneDrive para documentos mediante enlaces manuales, sin OAuth. El responsable creó Supabase y ya se migraron 27 usuarios y 4 proyectos con verificación de contenido y TLS. Falta GitHub y Vercel; no se ha publicado un dominio.

Lee AGENTS.md, README.md, docs/ESTADO_ENTREGA.md, docs/ARCHITECTURE.md, docs/CHANGELOG_0.4.0.md, docs/VALIDATION.md y docs/VERCEL_SUPABASE.md. Usa la documentación de Next instalada y el lockfile. Los prompts y ZIP históricos no sustituyen la petición actual.

La instalación local conserva 4 proyectos y 27 usuarios. Hay un respaldo privado previo en outputs/Actualizacion_0.4.0_2026-10-20/backup-0.3.2. Nunca distribuir data/, outputs/, archivos .env con valores ni notas docentes. No regenerar usuarios/contraseñas ni ejecutar importadores históricos para actualizar.

La aplicación usa SQLite por defecto y PostgreSQL con MECAPLAN_DATABASE=postgres. En Vercel se exige PostgreSQL y la demo se desactiva. Los repositorios y rutas usan SQL asíncrono; las transacciones, CAS y revisiones de actividad se mantienen. Las evaluaciones y versiones siguen privadas y sobreviven a borrar proyectos.

Supabase tiene un esquema privado mecaplan; RLS y revocaciones bloquean anon/authenticated. La autorización por usuario se conserva en las API con autenticación propia; no presentar esto como Supabase Auth ni políticas auth.uid(). OneDrive conserva documentos, PostgreSQL conserva metadatos y tokens cifrados, la clave reside en configuración privada. No usar el disco de Vercel para SQLite o archivos.

DATABASE_URL y el certificado CA están configurados en .env.cloud.local (privado, ignorado por Git). cloud:check --database pasó contra Supabase real. La matriz Digit360 ahora usa el enlace OneDrive proporcionado por el responsable, conservando su ID y la copia local; no quedan archivos locales pendientes. No repetir cloud:migrate --apply porque el destino ya está ocupado. No exigir Microsoft ni clave de tokens para enlaces manuales sin conexión almacenada. No editar simultáneamente SQLite y Supabase: no se sincronizan. Comprobar permisos de OneDrive con las cuentas usuarias y continuar la publicación siguiendo docs/VERCEL_SUPABASE.md.

Pruebas ejecutadas: 83 unidades (12 con PostgreSQL en PGlite), 85 comprobaciones HTTP, 31 de seguridad, regresiones 0.3.2, webhook simulado y compilación de producción. Kanban se comprobó manualmente en navegador: menú, seis estados, filtro completadas y detalle. La suite Playwright completa no se ejecutó aquí; no afirmar una publicación o integración real ya terminada.

