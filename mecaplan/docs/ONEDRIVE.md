# Conectar OneDrive institucional de UNITEC

La asociación de enlaces ya funciona. La subida directa está implementada, pero todavía no está conectada ni se ha probado con una cuenta real de UNITEC. Este registro es para el servidor local de MecaPlan.

## 1. Registrar MecaPlan

Entra con tu cuenta institucional al [centro de administración Microsoft Entra](https://entra.microsoft.com). Selecciona el directorio de UNITEC. Ve a **Entra ID → Registros de aplicaciones → Nuevo registro**. Nombre: **MecaPlan local**. Tipo: **solo cuentas de este directorio organizativo**. Guarda el **Id. de aplicación (cliente)** y el **Id. de directorio (inquilino/tenant)** de Información general. Si no tienes permiso para registrar aplicaciones, TI de UNITEC debe hacerlo o autorizarlo; no crees otro tenant como sustituto. [Registro oficial](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).

## 2. Configurar el retorno

En **Autenticación → Agregar una plataforma → Web**, registra exactamente:

```text
http://localhost:3000/api/onedrive/callback
```

Para conectar, abre e inicia sesión en MecaPlan desde **http://localhost:3000**. La sesión de `127.0.0.1` es distinta: no mezcles ambos nombres. Usa flujo Web; no habilites el flujo implícito. El retorno debe coincidir con el registrado en Microsoft. [Retornos de Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

## 3. Permisos delegados

En **Permisos de API → Agregar un permiso → Microsoft Graph → Permisos delegados**, configura **Files.ReadWrite**, **User.Read** y **offline_access**. El servidor opera como la cuenta conectada. Files.ReadWrite permite leer y modificar sus archivos; su alcance no se restringe técnicamente a la carpeta MecaPlan. El código de esta aplicación solo crea/sube/verifica archivos bajo MecaPlan y no elimina documentos de Microsoft. Conserva sus permisos de uso compartido. Si aparece «requiere aprobación de administrador», solicita la autorización a TI. [Permisos de Graph](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwrite).

## 4. Secreto para desarrollo local

En **Certificados y secretos → Secretos de cliente → Nuevo secreto**, crea uno y copia su **Valor**, que se muestra una sola vez. No uses el identificador del secreto. Anota su vencimiento para renovarlo. Esta versión local usa un secreto de cliente; antes de desplegar a producción debe adaptarse a certificados o credenciales federadas, como recomienda Microsoft. [Credenciales oficiales](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials).

## 5. Guardar en tu computadora

En la raíz de `mecaplan`, crea o edita `.env.local` sin sobrescribir otras opciones:

```dotenv
MICROSOFT_TENANT_ID=ID_DEL_DIRECTORIO_UNITEC
MICROSOFT_CLIENT_ID=ID_DE_APLICACION
MICROSOFT_CLIENT_SECRET=VALOR_PRIVADO_DEL_SECRETO
ONEDRIVE_REDIRECT_URI=http://localhost:3000/api/onedrive/callback
```

No pegues el valor del secreto en el chat, Git ni capturas. Nunca añadas el prefijo NEXT_PUBLIC_ a estas variables. El token se cifra en la base local; la clave se genera en `data/onedrive-token-key.bin`. Guarda la carpeta data como información privada. Puedes proporcionar alternativamente ONEDRIVE_TOKEN_KEY: 32 bytes aleatorios codificados en base64.

## 6. Conectar y comprobar

Reinicia `npm run dev`. Abre **http://localhost:3000**, inicia sesión como superusuario y entra en **OneDrive y archivos → Conectar Microsoft OneDrive**. Selecciona la cuenta de UNITEC y revisa la autorización en Microsoft. Si TI la bloquea, conserva el modo de enlaces hasta obtener aprobación.

Comprueba con un archivo pequeño de prueba: debe aparecer en tu OneDrive bajo **MecaPlan / Proyecto-{id}** y abrirse desde la página. La app comprueba tamaño y contenido antes de guardar la referencia. Luego puedes migrar explícitamente la matriz original desde **Migrar a OneDrive**. La copia local de ese adjunto solo se retira después de verificar la copia remota. No se modifica el XLSX original de Descargas.

## Funcionamiento y límites

- Hay una cuenta de almacenamiento conectada para la instalación, configurada solo por superusuarios. Los miembros autorizados de los proyectos suben mediante esa cuenta.
- Subidas: límite inicial de 10 MB. El binario pasa temporalmente por el servidor y se conserva en OneDrive; la app guarda enlace y metadatos. Usuarios, tablas y evaluaciones siguen en SQLite.
- Vincular un documento no concede permisos en Microsoft. Comparte los documentos con los integrantes desde OneDrive institucional cuando corresponda.
- Retirar un enlace o eliminar un proyecto conserva los documentos en OneDrive. Un comprobante utilizado por un gasto conserva su referencia.
- Los adjuntos locales anteriores permanecen hasta migrarlos. Desconectar la cuenta no elimina documentos ni enlaces existentes.
- Modificar un Excel en OneDrive no actualiza las tablas: vuelve a importarlo. Cada descarga de contexto incluye los datos actuales; las copias ya entregadas a agentes no se sincronizan.
- `AADSTS50011`: revisa el retorno exacto y el nombre localhost. Secreto inválido/caducado: renueva su Valor y reinicia. Sin permiso de registro o consentimiento: contacta a TI. OneDrive sin provisionar o sin espacio: verifica primero que puedes abrirlo y subir un documento desde Microsoft 365.

Puedes usar **Asociar archivo de OneDrive** sin completar el registro: sube el archivo desde Microsoft 365 y pega su enlace HTTPS de OneDrive/SharePoint en MecaPlan.


## Cambios en 0.3.1

El retorno OAuth usa sesión Lax con state/PKCE ligado a su hash. Si cambias o cierras la sesión iniciadora, inicia de nuevo la conexión. Las subidas y migraciones usan una cola de red independiente y registran operaciones recuperables en SQLite. Un reintento conserva la identidad de operación y la ruta de archivo; no mantengas la misma operación si eliges otro contenido. No se elimina el original local hasta verificar y guardar la referencia remota.

Se corrigió el patrón de cookies y se probó localmente su comportamiento, pero todavía hace falta validar con Microsoft real: consentimiento, subida/migración, permisos de una segunda cuenta, revocación, cuota y recuperación tras una interrupción. No se incluye conexión ni secreto institucional en el ZIP.
