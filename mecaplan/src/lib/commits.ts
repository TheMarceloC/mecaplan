import { createHmac, timingSafeEqual } from "node:crypto";
export function parseCommit(message: string) {
  const codes = [
    ...new Set(
      [...message.matchAll(/\b[A-Z][A-Z0-9]{1,7}-\d+\b/gi)].map((m) =>
        m[0].toUpperCase(),
      ),
    ),
  ];
  const suggestedStatus = /#done\b/i.test(message)
    ? "Hecha"
    : /#review\b/i.test(message)
      ? "En revisión"
      : "En progreso";
  return {
    codes,
    suggestedStatus,
    automatic: suggestedStatus === "En progreso",
  };
}
export function verifySignature(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature) || !secret)
    return false;
  const expected = createHmac("sha256", secret).update(body).digest(),
    actual = Buffer.from(signature.slice(7), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
