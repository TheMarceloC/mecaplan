> Documento histórico de entregas anteriores. El estado actual es 0.4.0; consulta ESTADO_ENTREGA.md, VERCEL_SUPABASE.md y PROMPT_CONTINUAR_MECAPLAN.md.

> Referencia histórica anterior a 0.3.1. El estado vigente y los resultados actuales están en ESTADO_ENTREGA.md, CHANGELOG_0.3.1.md y VALIDATION.md. Las capturas antiguas ilustran versiones anteriores.

> Documento histórico de los ZIP 0.2.0. El usuario canceló ese empaquetado y se implementó 0.3.0 directamente. Para el estado vigente lee README, ESTADO_ENTREGA y ONEDRIVE. Los ZIP antiguos no contienen los cambios actuales.

# Continuar MecaPlan en otra computadora

Entrega preparada el 19 de octubre de 2026. El código está en la carpeta `mecaplan` del ZIP de desarrollo. La aplicación continúa siendo local. OneDrive, importador Excel general, eliminación de proyectos, creación de equipos y nuevos códigos son mejoras pendientes; véase MEJORAS_ACORDADAS.md.

## Qué contiene la entrega

- `MecaPlan_Codigo_y_Prompt.zip`: fuente, recursos y fuentes locales con licencia, configuraciones, lockfile, pruebas, documentación, prompt de continuidad y requisitos originales como referencia. No incluye la base, contraseñas, sesiones ni dependencias instaladas.
- `MecaPlan_Datos_Privados.zip`: base SQLite consistente, adjuntos referenciados, archivos originales suministrados, extracción de origen y credenciales iniciales. Contiene información privada y contraseñas en claro; entrégalo únicamente al responsable autorizado. No está cifrado por contraseña y no debe publicarse.
- El ZIP completo agrupa esos dos paquetes y una guía inicial. Su carácter es privado porque contiene el segundo paquete.
- Cada paquete tiene un manifiesto de archivos y hashes SHA-256; el paquete completo contiene además los hashes de los ZIP interiores. Estos permiten comprobar integridad, no sustituyen permisos ni cifrado.

Se excluyen `node_modules`, `.next*`, cachés, resultados de pruebas, bases de respaldo antiguas y archivos `.env` reales. `.env.example` no contiene secretos. Se conserva `pnpm-lock.yaml` para instalar las versiones resueltas; `npm install` puede resolver versiones diferentes dentro de los rangos de package.json.

## Requisitos e instalación

Necesitas Node.js 24 o superior y acceso a internet para la instalación inicial de dependencias. La aplicación utiliza `node:sqlite`, por eso no basta con una versión antigua de Node. No se incluye un Node privado de Codex ni rutas que deban existir en la computadora del destinatario para ejecutar la aplicación.

1. Extrae `MecaPlan_Codigo_y_Prompt.zip` en una carpeta de trabajo local.
2. Si continuarás con datos reales y estás autorizado, restaura el paquete privado como se explica más abajo **antes de iniciar el servidor**.
3. Abre una terminal dentro de `mecaplan` e instala dependencias.

Con pnpm instalado, conserva las versiones del lockfile:

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

Como alternativa, el proyecto también define scripts para npm:

```powershell
npm install
npm run dev
```

Abre http://127.0.0.1:3000/. El servidor de desarrollo escucha únicamente en la computadora local. El enlace 127.0.0.1 de la computadora anterior no permite que otra persona entre remotamente.

## Trabajar con ejemplos

Si no restauras el paquete privado, puedes preparar una base independiente con:

```powershell
npm run seed:demo
npm run dev
```

Usa el botón «Explorar proyecto de demostración». Se crean dos proyectos de muestra. `seed:demo` reemplaza esos dos ejemplos; no es un paso necesario cuando restauras la base real. El acceso demo no concede acceso a Digit 360 ni a evaluaciones docentes.

## Restaurar los datos reales

El paquete privado contiene `restaurar/mecaplan/data`. Con el servidor detenido y sobre una instalación nueva, copia **esa carpeta `data` completa** dentro de la carpeta `mecaplan` extraída del paquete de código. No copies encima de una base con cambios propios sin guardarla primero. No necesitas regenerar cuentas ni volver a importar Digit 360.

La copia se genera con la API de backup de SQLite para incluir de manera consistente lo que estaba en WAL. No depende de copiar solo `mecaplan.sqlite` del equipo original mientras el servidor está escribiendo. Las sesiones, tokens de recuperación e intentos de acceso se vacían únicamente en la copia de entrega; los usuarios, hashes, proyectos, permisos y evaluaciones se conservan. La base original permanece intacta.

Los adjuntos incluidos son los que referencia la base de la copia. Las credenciales iniciales están en `accesos` dentro del paquete privado. Si una persona cambió su contraseña después de generar ese libro, seguirá vigente su contraseña actual; el libro no se actualiza ni se rota para la entrega.

La base contiene evaluaciones privadas si existen. Tener el archivo SQLite permite leer sus tablas aunque la interfaz restrinja el acceso; entrégalo solo a quien deba administrar esa información. Para trabajo de un programador sin ese permiso, utiliza el paquete de código y la base demo.

## Comprobar

Desde `mecaplan`:

```powershell
npm test
npm run typecheck
npm run test:webhook
```

Para la integración HTTP, deja `npm run dev` abierto y ejecuta en otra terminal:

```powershell
npm run test:integration
```

La integración HTTP crea usuarios/proyectos temporales y los limpia. El simulador de webhook llama al handler con eventos firmados sin hacer peticiones a GitHub. Las pruebas de navegador de 1A están en `tests/e2e.spec.ts` y requieren un navegador de Playwright instalado; no se ha incluido un navegador en el ZIP.

Para compilar, detén primero el servidor de desarrollo y ejecuta `npm run build`. El script utiliza Webpack. Alternativamente, el proyecto admite `BUILD_OUT` para compilar en una carpeta distinta sin pisar `.next` de desarrollo. El comando `npm run start` corresponde al build de producción; las cookies Secure de ese modo requieren HTTPS para autenticación, por lo que la ruta recomendada de trabajo local es `npm run dev`.

## Qué leer y qué no repetir

1. `PROMPT_CONTINUAR_MECAPLAN.md`: prompt listo para el siguiente agente/desarrollador.
2. `docs/ESTADO_ENTREGA.md`: estado verificable de esta copia y límites de la validación.
3. `docs/MEJORAS_ACORDADAS.md`: alcance y criterios pendientes.
4. `docs/PHASE1B.md`, ARCHITECTURE.md, DECISIONS.md y VALIDATION.md: funcionamiento actual e historial de validación.
5. `referencias/prompt-codex-gestor-proyectos.md`: petición original. Las decisiones posteriores de MEJORAS_ACORDADAS y del usuario actual prevalecen.

`scripts/connect-phase1b.mjs` es una migración histórica que ya se aplicó; no vuelvas a ejecutarla. `scripts/inspect-inputs.py` y `scripts/import-digit360.ts` son herramientas del importado inicial, **no el futuro importador web general**. Tienen rutas del equipo original: si necesitas reproducir la importación desde cero, adapta esas rutas a los originales del paquete privado y revisa los roles con el usuario. La aplicación normal no necesita ejecutar esos scripts para arrancar.

## Trabajar entre varias personas

Comparte código por Git y mantén una base local por desarrollador. La aplicación actual serializa escrituras dentro de un único proceso Node; no sincronices un SQLite activo por OneDrive ni abras la misma base desde varios equipos. La futura integración OneDrive almacenará documentos y referencias; no convertirá la base local en una base multiusuario distribuida. El acceso simultáneo por internet corresponde a la fase 2, que no se ha desplegado.

Para regenerar paquetes desde esta instalación se incluye `scripts/make-handoff.py`. Requiere Python estándar y rutas explícitas a los archivos de referencia/credenciales; usa `--help`. No necesita Excel ni librerías de autoría de hojas de cálculo.

