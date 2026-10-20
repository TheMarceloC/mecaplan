import type { Metadata } from "next";
import "./globals.css";
import "./fonts.css";
import "./unitec.css";
import "./phase1b.css";
import "./stabilization.css";
export const metadata: Metadata = {
  title: "MecaPlan · Cada pieza, en su lugar",
  description:
    "El espacio de trabajo de tu proyecto mecatrónico. Organiza equipos, actividades y entregables.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  // Root attributes can be injected by browser grammar extensions before hydration.
  // Limit the documented escape hatch to this static root; child mismatches remain visible.
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
