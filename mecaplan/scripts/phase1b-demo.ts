import { allProjects, saveProject } from "../src/server/repositories";
import { controlSchema } from "../src/lib/phase-schema";
export async function upgradePhaseDemo() {
  for (const p of await allProjects()) {
    if (p.id === "digit360" && p.control) {
      if (!p.control.deliveryDate) p.control.deliveryDate = "2026-12-04";
      await saveProject(p);
      continue;
    }
    if (!["robot", "greenhouse"].includes(p.id) || p.control) continue;
    p.control = controlSchema.parse({
      currency: "HNL",
      integrationLeadId: "demo",
      budget: [
        {
          id: "demo-b1",
          teamId: "electronics",
          category: "Componentes",
          name: "Kit de control y sensores (demo)",
          quantity: 2,
          unitPriceCents: 180000,
          isBom: true,
        },
        {
          id: "demo-b2",
          teamId: "cad",
          category: "Fabricación",
          name: "Material de impresión (demo)",
          quantity: 1,
          unitPriceCents: 120000,
          isBom: true,
        },
        {
          id: "demo-b3",
          teamId: "software",
          category: "Desarrollo",
          name: "Herramientas de desarrollo (demo)",
          quantity: 1,
          unitPriceCents: 20000,
        },
      ],
      expenses: [
        {
          id: "demo-e1",
          teamId: "electronics",
          budgetItemId: "demo-b1",
          amountCents: 160000,
          date: p.start,
          paidBy: "demo",
          description: "Compra de componentes (demo)",
          status: "approved",
          decidedBy: "demo",
        },
        {
          id: "demo-e2",
          teamId: "cad",
          budgetItemId: "demo-b2",
          amountCents: 45000,
          date: p.start,
          paidBy: "andres",
          description: "Material pendiente de aprobación (demo)",
          status: "pending",
        },
      ],
      risks: [
        {
          id: "demo-risk",
          description: "Retraso del proveedor de material (demo)",
          probability: 3,
          impact: 4,
          mitigation: "Confirmar existencia y proveedor alterno.",
          ownerId: "andres",
          status: "open",
        },
      ],
      records: [
        {
          id: "demo-check",
          kind: "checklist",
          title: "Revisión de diseño (demo)",
          date: p.start,
          teamId: "electronics",
          ownerId: "demo",
          items: [
            { id: "demo-i1", title: "Esquemático revisado", done: true },
            { id: "demo-i2", title: "Firmware probado", done: false },
            { id: "demo-i3", title: "STEP exportado", done: false },
          ],
        },
      ],
    });
    for (const a of p.activities) if (a.status === "Hecha") a.actualEnd = a.end;
    await saveProject(p);
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/phase1b-demo.ts"))
  upgradePhaseDemo().then(() =>
    console.log("Demostración 1B y fechas del curso preparadas."),
  );
