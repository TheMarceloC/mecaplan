# Actualización aplicada — MecaPlan 0.3.2

Instalación original actualizada el 20 de octubre de 2026. Disponible en http://127.0.0.1:3000/.

Se integraron las mejoras 0.3.1 de preparación guiada, entregas entre equipos, reunión semanal, planificación/esfuerzo, corrección de gastos, riesgos y privacidad. Se corrigieron los cuatro hallazgos independientes: borradores obsoletos, aprobaciones falsas en restauración JSON, consulta del historial privado archivado y redondeo intermedio de cargas.

Se conservaron íntegramente 4 proyectos, 27 usuarios, contraseñas, roles, membresías y archivos adjuntos. Digit360 mantiene sus 25 actividades y 18 integrantes. No se convirtió su planificación provisional en fechas confirmadas ni se inventaron revisiones o notas.

El respaldo previo está en outputs/Actualizacion_0.3.2_2026-10-19/backup-0.3.0 y es privado. Los resultados de migración y activación están junto a ese respaldo, en migration-results.json, activation-data-results.json y final-verification.json. No distribuir data/ ni esa carpeta con el código público.

Pasaron 71 pruebas unitarias, 85 comprobaciones HTTP y 31 de seguridad, además de las regresiones independientes y webhook simulado. La compilación de producción y TypeScript pasaron en la carpeta original. Los dos nuevos flujos de navegador se probaron manualmente; no se ejecutó la suite completa de 10 escenarios Playwright.

En la instalación original se comprobó acceso de demostración y preparación guiada, sin errores/advertencias en la consola. La captura docs/mecaplan-0.3.2.png contiene únicamente datos de demostración.

OneDrive institucional queda pendiente del registro y autorización Microsoft/UNITEC, según ONEDRIVE.md. No hay conexión almacenada ni subida real verificada. Se pueden asociar enlaces. No se eliminaron documentos del almacenamiento externo.

Para próximas sesiones se puede abrir INICIAR_MECAPLAN.cmd; detecta Node/pnpm del sistema o los runtimes locales disponibles de Codex. Usa Webpack. Si el servidor ya está abierto, usa su URL existente en lugar de iniciar otra instancia.

Detalle técnico: CHANGELOG_0.3.2.md. Cobertura y límites: VALIDATION.md.

