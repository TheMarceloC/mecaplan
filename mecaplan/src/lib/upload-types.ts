// Tipos de archivo admitidos en subidas. Lo comparten el servidor (detectUpload)
// y los formularios (atributo accept), para que ambos digan lo mismo.

/** Formatos Office y ZIP: comparten la firma PK de los archivos comprimidos. */
export const zipUploadTypes: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
};

/** Texto plano: documentación, STEP/STL ASCII, G-code y código de firmware o scripts. */
export const textUploadTypes = [
  ".txt",
  ".md",
  ".csv",
  ".step",
  ".stp",
  ".stl",
  ".gcode",
  ".ino",
  ".py",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".m",
  ".json",
];

/** Valor para el atributo accept de los campos de archivo. */
export const uploadAccept = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ...Object.keys(zipUploadTypes),
  ...textUploadTypes,
].join(",");

/** Texto de ayuda que acompaña a los formularios de subida. */
export const uploadTypesLabel =
  "PDF, imágenes, Word, PowerPoint, Excel, ZIP, STL (texto o binario), STEP, G-code y código fuente (.ino, .py, .c, .cpp, .h, .m)";
