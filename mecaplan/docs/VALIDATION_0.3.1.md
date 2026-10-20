# Validación ejecutada — MecaPlan 0.3.1

19 de octubre de 2026. Se ejecutó `pnpm run verify` con salida correcta después de las correcciones. Las pruebas usan datos sintéticos en carpetas separadas; no utilizan la base privada del curso.

| Comprobación | Resultado |
|---|---|
| Vitest | 68 pruebas aprobadas en 5 archivos |
| Auditoría de dependencias pnpm | Sin vulnerabilidades conocidas reportadas al comprobar la entrega; no garantiza ausencia de vulnerabilidades futuras |
| TypeScript estricto | Sin errores |
| Compilación de producción | Next.js 16.4.2, Webpack: correcta, 12 rutas/páginas generadas |
| Integración HTTP | 85 comprobaciones aprobadas |
| Regresión de seguridad HTTP | 31 comprobaciones aprobadas |
| Webhook simulado | Firma válida/inválida, push, PR, deduplicación y sugerencias correctos, sin GitHub real |
| Playwright Chromium | 8 escenarios aprobados, servidor y datos aislados |
| Administrador docente local | Creación correcta, rol docente activo, sin sesiones iniciales y con auditoría |
| Respaldo y restauración | Copia sintética restaurada en carpeta nueva, hashes correctos e integridad SQLite `ok` |
| Diagnóstico | Base sintética íntegra y proyectos sin problemas de estructura |

Las pruebas de navegador cubren selección de proyecto/filtros, alta y edición con comentarios e historial, cuenta pendiente, asignación/permisos, diálogos en móvil, destinos de cambios, importación y reimportación del mismo Excel, y corrección/aprobación de gastos pendientes. Los escenarios HTTP y unitarios cubren permisos globales, privacidad/versiones docentes, retención al borrar, referencias Excel, vínculos financieros, CPM, carga, avance, clonación, límites de entrada y control de revisión. Una regresión adicional comprueba que editar actividades históricas sin cambiar su estado no inventa fechas reales ausentes.

El arranque de SQLite es diferido: importar módulos durante la compilación no abre ni migra la base de la instalación. La inicialización usa una transacción y espera de bloqueo. Se comprobó la compilación tras corregir el conflicto de inicialización simultánea.

La matriz original, la plantilla, las fuentes y sus licencias se verifican por SHA-256 contra el ZIP recibido al preparar el paquete. El manifiesto final permite comprobar todos los archivos de la entrega. No se incluyen dependencias instaladas, compilaciones, bases, sesiones, notas privadas, claves ni resultados temporales.

La instalación desde una extracción limpia y la revisión del paquete se registran en `EMPAQUETADO_0.3.1.md`.

## Límites de lo verificado

No se dispone de autorización Microsoft institucional ni de credenciales GitHub reales: OAuth/subidas remotas necesitan la validación del responsable según ONEDRIVE.md; el webhook fue simulado. No se afirma una auditoría exhaustiva de accesibilidad, un despliegue público, una prueba de carga ni la migración de los datos privados reales ausentes del ZIP. Los avisos de color de Playwright no impidieron las pruebas.

Para repetir: instala dependencias con el lockfile y Chromium con `pnpm exec playwright install chromium`, y ejecuta `pnpm run verify` con los puertos 3101 y 3102 libres. Revisa README para las copias de seguridad y la actualización de datos reales.
