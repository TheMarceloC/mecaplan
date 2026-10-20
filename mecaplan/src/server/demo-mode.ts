export function demoEnabled() {
  if (
    process.env.VERCEL === "1" ||
    process.env.MECAPLAN_DATABASE === "postgres"
  )
    return false;
  return (
    process.env.ENABLE_DEMO === "1" ||
    (process.env.ENABLE_DEMO !== "0" && process.env.NODE_ENV !== "production")
  );
}
