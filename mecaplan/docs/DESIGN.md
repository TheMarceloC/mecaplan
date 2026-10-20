> Referencia histórica anterior a 0.3.1. El estado vigente y los resultados actuales están en ESTADO_ENTREGA.md, CHANGELOG_0.3.1.md y VALIDATION.md. Las capturas antiguas ilustran versiones anteriores.

# Referencia visual

Solicitada por el usuario: [Diagnóstico MEC402](https://6ad0deae2660ffa4b9247c01--examen-diagnostrico-mec402.netlify.app/).

Inspeccionada en el navegador el 19 de octubre de 2026. Se observaron sus variables CSS, fuente, tarjetas, navegación y vista inicial. El enlace previo de Canvas redirigía al acceso y fue sustituido por esta referencia al aclararlo el usuario.

## Valores observados y aplicados

| Elemento | Valor |
| --- | --- |
| Azul principal | `#05065C` |
| Azul secundario | `#0F49B6` |
| Acento cian | `#03AED2` |
| Selección clara | `#E2F7FE` |
| Fondo | `#F6F7FB` |
| Texto | `#343A4B` |
| Texto secundario | `#6B7488` |
| Borde | `#DCE0EA` |
| Tipografía | Poppins, pesos 400, 500, 600, 700, 800 |
| Tarjetas | Radio 16 px, fondo blanco, sombra azul suave |
| Botones | Radio 10 px, primarios azul marino |
| Navegación | Barra lateral blanca; selección cian clara |

`src/app/unitec.css` aplica esta identidad a los componentes existentes. `fonts.css` carga archivos WOFF2 locales para evitar dependencia de red en tiempo de ejecución. El logotipo UNITEC se obtuvo del recurso público `assets/logo-horizontal-color.png` de la referencia y se conserva su identidad; pertenece a su titular. No se copió el contenido del examen ni sus preguntas.

El diseño de MecaPlan mantiene las funciones propias de un gestor de proyectos. Los colores de los equipos siguen siendo editables; los datos de muestra usan la paleta de la referencia.
