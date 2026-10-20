/** Validate against the public Host header; Next may use an internal URL hostname. */
export function requestOrigin(req: Request): string | null {
  try {
    const origin = new URL(req.headers.get("origin") ?? "");
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.host !== req.headers.get("host")
    )
      return null;
    return origin.origin;
  } catch {
    return null;
  }
}
