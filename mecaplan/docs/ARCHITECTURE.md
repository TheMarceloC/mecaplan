# Arquitectura — MecaPlan 0.4.0

React → Route Handlers Next.js → cuenta activa/permisos → servicios y reglas de dominio → repositorios → adaptador asíncrono SQLite o PostgreSQL.

SQLite conserva la instalación local. MECAPLAN_DATABASE=postgres activa Supabase; VERCEL=1 exige PostgreSQL y prohíbe abrir SQLite. Se conservan usuarios, hashes y autenticación propia mediante cookies y sesiones de servidor. Supabase Auth y Storage no se utilizan.

El esquema privado mecaplan contiene usuarios, proyectos JSON validados, sesiones, evaluaciones/versiones, retención docente, auditoría, previews, OAuth, caché cifrado y operaciones OneDrive. RLS está habilitado y anon/authenticated no tienen acceso; las reglas por persona se aplican en las API existentes con credenciales sólo del servidor.

El pool pg tiene dos conexiones máximas por instancia, caducidad de conexiones inactivas, TLS verificado y consultas parametrizadas sin prepared statements con nombre. Cada consulta/ transacción fija search_path con SET LOCAL para funcionar con transaction pooling.

saveProject usa una actualización condicionada por versión y cada actividad tiene revisión propia. Las transacciones explícitas conservan las versiones privadas y la retención al borrar. Los locks de PostgreSQL son leases persistidas de 120 s, renovadas cada 15 s y liberadas al terminar; las funciones Vercel se limitan a 60 s. La operación de red OneDrive usa un lock separado, sin retener una transacción de base durante la transferencia.

OneDrive mantiene los documentos y verifica su contenido antes de asociar enlaces. En PostgreSQL la clave de cifrado debe permanecer en ONEDRIVE_TOKEN_KEY; no se crea una clave temporal. Las operaciones de subida son durables y pueden reintentarse por su identidad. No se escriben adjuntos nuevos en el disco efímero de Vercel.

La migración SQLite→PostgreSQL analiza el origen en una instantánea, valida estructura y archivos remotos, exige destino vacío, copia dentro de una transacción y verifica el contenido antes de confirmar. No migra sesiones, tokens de recuperación, previews, intentos de acceso ni OAuth temporal.

La validación con PGlite cubre sintaxis PostgreSQL y repositorios. No verifica red/TLS/pooler/credenciales de un proyecto Supabase real. No hay transacción distribuida con Microsoft; los reintentos de archivos y CAS limitan inconsistencias, sin prometer ejecución exactamente una vez de toda operación.

