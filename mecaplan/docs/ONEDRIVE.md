# Documentos de OneDrive: solo enlaces

MecaPlan utiliza enlaces manuales. No requiere registrar una aplicación de Microsoft ni configurar OAuth para este flujo.

1. Guarda los documentos en la carpeta institucional de OneDrive.
2. El propietario comparte el archivo o la carpeta con los integrantes desde Microsoft.
3. Copia el vínculo HTTPS y regístralo en **OneDrive y enlaces**.
4. Usa **Abrir y comprobar acceso** con la cuenta institucional de cada integrante.

Un enlace con formato válido no confirma el acceso: Microsoft aplica sus permisos al abrirlo. Una URL de navegación de la cuenta del propietario puede funcionar solo para quienes ya tienen acceso. No se consulta la dirección desde el servidor ni se almacenan copias nuevas del archivo.

La API de documentos acepta únicamente JSON con nombre, vínculo y actividad opcional. Rechaza transferencias multipart con HTTP 415. Los antiguos comandos de conexión/migración devuelven HTTP 409; se conserva la desconexión administrativa para revocar conexiones anteriores. Los adjuntos anteriores siguen disponibles para recuperación.

Excel sigue aceptando XLSX en **Importar Excel** exclusivamente para leer filas y llenar las tablas. Hay vista previa, validaciones, permisos y confirmación. No se conserva el binario del XLSX. Editar el documento en OneDrive no sincroniza las tablas automáticamente.

Retirar el enlace o eliminar el proyecto no elimina los documentos remotos. Los comprobantes referenciados por gastos mantienen sus restricciones. Datos, usuarios y sesiones de producción siguen en PostgreSQL/Supabase; los documentos permanecen en OneDrive.

Guía visible para usuarios: `/guia-onedrive.html`.
