# Validación — MecaPlan 0.4.0

20 de octubre de 2026. Datos sintéticos separados de la instalación del curso.

| Comprobación | Resultado |
|---|---|
| Unidades/regresiones | 83 pruebas aprobadas en 7 archivos |
| PostgreSQL local | 12 pruebas de esquema, RLS/rol anónimo, hashes/roles, sesiones, CAS, rollback, evaluaciones conservadas, migración verificada, bloqueo persistido y demo deshabilitada |
| TypeScript | Sin errores |
| Producción | Next.js 16.4.2 / Webpack; 13 rutas generadas |
| Integración HTTP / SQLite | 85 comprobaciones aprobadas |
| Seguridad HTTP / SQLite | 31 comprobaciones aprobadas |
| Correcciones 0.3.2 | Borrador obsoleto 409, restauración sin aprobación falsa, archivo privado con versiones y carga sin redondeo intermedio |
| Webhook simulado | Firma, push, PR, deduplicación y sugerencias correctos |
| Análisis de la copia real | 27 usuarios, 4 proyectos; detecta una referencia de archivo local y no transfiere datos |

Se usa PGlite como motor PostgreSQL real en memoria para ejecutar el SQL y los repositorios. La conexión pg/TLS/pooler con Supabase y el despliegue Vercel necesitan credenciales/proyectos externos y no están verificados. OneDrive institucional no está autorizado en este equipo.

La suite automatizada de 10 escenarios Playwright no se ejecutó en esta actualización. La comprobación de la entrada principal Kanban se realiza por navegador con datos de demostración, sin modificar las actividades reales.

La construcción de Vercel exige cloud:check --database antes de compilar; una compilación local correcta no equivale a publicación ni activación de integraciones reales. Véase VERCEL_SUPABASE.md para el corte y pruebas posteriores.


Comprobación visual terminada en la instalación local: entrada principal Tablero Kanban, seis estados conservados, filtro de completadas y apertura/cierre de detalle. No se modificaron actividades reales. Consola sin errores/advertencias. Captura: kanban-0.4.0.png. cloud:check rechaza correctamente la configuración incompleta en este equipo.

La comprobación del empaquetado retiró referencias privadas que las trazas locales de Windows todavía incluían. Se añadió scripts/guard-build-artifacts.mjs al comando build. Resultado final: 16 manifiestos revisados, cero archivos de data/, outputs/, work/ o respaldos incluidos en sus listas. Usuarios, proyectos, evaluaciones, referencias y adjuntos locales coinciden con el respaldo previo; SQLite íntegro.

