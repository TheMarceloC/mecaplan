/** Bound actual bytes even when Content-Length is missing or dishonest. */
export async function boundedRequest(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw Error("La solicitud supera el tamaño permitido.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw Error("La solicitud supera el tamaño permitido.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function boundedForm(request: Request, limit: number) {
  const bytes = await boundedRequest(request, limit);
  return new Response(bytes, {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
}
