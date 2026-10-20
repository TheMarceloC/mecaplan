import { test, expect } from "@playwright/test";
const origin = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3101";

test("evidencia, revisión desde otro equipo y cierre conservan trazabilidad", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext({ baseURL: origin }),
    reviewContext = await browser.newContext({ baseURL: origin });
  const owner = await ownerContext.newPage(),
    reviewer = await reviewContext.newPage();
  let original: any;
  try {
    await owner.goto("/");
    await owner
      .getByRole("button", { name: "Explorar proyecto de demostración" })
      .click();
    await expect(
      owner.getByRole("button", { name: "Actividades", exact: true }),
    ).toBeVisible();
    original = (
      await (await owner.request.get("/api/app")).json()
    ).projects.find((p: any) => p.id === "robot");
    const post = (request: any, action: string, data: any) =>
      request.post("/api/app", {
        headers: { origin },
        data: { action, projectId: "robot", data },
      });
    expect(
      (
        await post(owner.request, "saveControlSettings", {
          ...original.control,
          requireCrossReview: true,
        })
      ).ok(),
    ).toBeTruthy();
    const title = "Cierre con revisión " + Date.now(),
      taskId = crypto.randomUUID();
    expect(
      (
        await post(owner.request, "saveActivity", {
          id: taskId,
          code: "Nueva",
          title,
          teamId: "electronics",
          status: "Pendiente",
          priority: "Media",
          start: "2026-10-19",
          end: "2026-10-19",
          duration: 1,
          responsible: ["demo"],
          accountable: "demo",
        })
      ).ok(),
    ).toBeTruthy();
    const registered = await reviewContext.request.post("/api/app", {
      headers: { origin },
      data: {
        action: "register",
        data: {
          name: "Revisor E2E",
          email: "review-" + Date.now() + "@example.test",
          password: "Prueba-local-2026!",
        },
      },
    });
    expect(registered.ok()).toBeTruthy();
    const reviewUser = (
      await (await reviewContext.request.get("/api/app")).json()
    ).user;
    expect(
      (
        await post(owner.request, "assignUser", {
          id: reviewUser.id,
          name: reviewUser.name,
          teamId: "software",
          role: "member",
          lead: false,
        })
      ).ok(),
    ).toBeTruthy();
    const open = async (page: any) => {
      await page
        .getByRole("button", { name: "Actividades", exact: true })
        .click();
      await page.getByLabel("Buscar actividades", { exact: true }).fill(title);
      const current = (
        await (await page.request.get("/api/app")).json()
      ).projects
        .find((p: any) => p.id === "robot")
        .activities.find((a: any) => a.id === taskId);
      await page
        .getByRole("button", { name: current.code + " " + title, exact: true })
        .click();
      return page.getByRole("dialog");
    };
    await owner.reload();
    let dialog = await open(owner);
    await dialog
      .getByLabel("Evidencias · un enlace o referencia por línea")
      .fill("Informe sintético E2E");
    await dialog
      .getByRole("button", { name: "Guardar evidencia", exact: true })
      .click();
    await expect(
      dialog.getByText("Pendiente de revisión de otro equipo.", {
        exact: true,
      }),
    ).toBeVisible();
    await reviewer.goto("/");
    const reviewDialog = await open(reviewer);
    await reviewDialog
      .getByRole("button", { name: "Confirmar mi revisión", exact: true })
      .click();
    await expect(
      reviewDialog.getByText(/Revisión confirmada por Revisor E2E/),
    ).toBeVisible();
    await owner.reload();
    dialog = await open(owner);
    await dialog.getByLabel("Estado").selectOption("Hecha");
    await dialog
      .getByRole("button", { name: "Guardar actividad", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const done = (await (await owner.request.get("/api/app")).json()).projects
      .find((p: any) => p.id === "robot")
      .activities.find((a: any) => a.id === taskId);
    expect(done.status).toBe("Hecha");
    expect(done.reviewerId).toBe(reviewUser.id);
    expect(done.actualEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  } finally {
    if (original)
      await owner.request.post("/api/app", {
        headers: { origin },
        data: {
          action: "saveControlSettings",
          projectId: "robot",
          data: {
            ...original.control,
            requireCrossReview: original.control?.requireCrossReview ?? false,
          },
        },
      });
    await ownerContext.close();
    await reviewContext.close();
  }
});

test("aprobar una solicitud aplica el destino y conserva el historial", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar proyecto de demostración" })
    .click();
  await expect(
    page.getByRole("button", { name: "Actividades", exact: true }),
  ).toBeVisible();
  const before = (
    await (await page.request.get("/api/app")).json()
  ).projects.find((p: any) => p.id === "robot");
  const description = "Cambio aprobado E2E " + Date.now(),
    weeks = before.weeks === 104 ? 103 : before.weeks + 1;
  try {
    await page
      .getByRole("button", { name: "Solicitudes de cambio", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Solicitar cambio", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Qué cambio solicitas").fill(description);
    await dialog.getByLabel("Duración propuesta · semanas").fill(String(weeks));
    await dialog
      .locator('textarea[name="reason"]')
      .fill("Justificación sintética para ampliar el plan");
    await dialog
      .locator('textarea[name="impact"]')
      .fill("Impacto revisado para la prueba");
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = page.locator(".phase-entry").filter({ hasText: description });
    await card.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(card.locator(".phase-status")).toContainText("Aprobado");
    const after = (
      await (await page.request.get("/api/app")).json()
    ).projects.find((p: any) => p.id === "robot");
    expect(after.weeks).toBe(weeks);
    expect(
      after.history.some((h: any) => h.action === "Aplicó el valor aprobado"),
    ).toBe(true);
  } finally {
    await page.request.post("/api/app", {
      headers: { origin },
      data: {
        action: "saveProject",
        projectId: "robot",
        data: {
          name: before.name,
          description: before.description,
          start: before.start,
          weeks: before.weeks,
        },
      },
    });
  }
});
test("demo, selector de proyecto y filtro de completadas", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar proyecto de demostración" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vista general" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Actividades", exact: true }).click();
  await page.getByRole("button", { name: "Completadas", exact: true }).click();
  await expect(page).toHaveURL(/status=completed/);
  const cells = page.locator(".activity-table tbody tr td:nth-child(4)");
  for (const cell of await cells.all())
    await expect(cell).toContainText("Hecha");
  await page.getByLabel("Seleccionar proyecto").selectOption("greenhouse");
  await page
    .getByRole("button", { name: "Vista general", exact: true })
    .click();
  await expect(page.getByText(" / 10", { exact: false }).first()).toBeVisible();
});
test("crear, editar en línea, comentar y conservar historial", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar proyecto de demostración" })
    .click();
  await page.getByRole("button", { name: "Nueva actividad" }).click();
  const title = "Actividad de prueba " + Date.now();
  await page.getByLabel("Nombre de la actividad", { exact: true }).fill(title);
  await page.getByLabel("A · Aprueba el entregable").selectOption("demo");
  await page
    .getByRole("group", { name: "R · Realiza", exact: true })
    .getByLabel("Sofía Martínez")
    .check();
  await page
    .getByRole("button", { name: "Guardar actividad", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Actividades", exact: true }).click();
  await page.getByLabel("Buscar actividades").fill(title);
  await page.locator(".activity-name").filter({ hasText: title }).click();
  await page
    .getByLabel("Añade una actualización")
    .fill("Revisión funcional completada.");
  await page.getByRole("button", { name: "Publicar comentario" }).click();
  await expect(
    page.getByText("Revisión funcional completada.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cerrar", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: /Editar nombre de / }).click();
  await page.getByLabel("Nuevo nombre de actividad").fill(title + " revisada");
  await page
    .getByRole("button", { name: "Guardar nombre", exact: true })
    .click();
  await expect(
    page.locator(".activity-name").filter({ hasText: title + " revisada" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  await expect(
    page.getByText("Creó una actividad", { exact: false }).first(),
  ).toBeVisible();
});
test("un usuario registrado queda pendiente y no puede alterar proyectos", async ({
  request,
}) => {
  const email = `test-${Date.now()}@example.test`;
  let r = await request.post("/api/app", {
    headers: { origin },
    data: {
      action: "register",
      data: {
        name: "Usuario de prueba",
        email,
        password: "Prueba-local-2026!",
      },
    },
  });
  expect(r.status()).toBe(200);
  r = await request.get("/api/app");
  const data = await r.json();
  expect(data.user.status).toBe("pending");
  expect(data.projects).toHaveLength(0);
  r = await request.post("/api/app", {
    headers: { origin },
    data: { action: "saveProject", projectId: "robot", data: {} },
  });
  expect(r.status()).toBe(403);
  r = await request.post("/api/app", {
    headers: { origin: "https://other.example" },
    data: { action: "demo" },
  });
  expect(r.status()).toBe(403);
});
test("asignar un usuario activa acceso limitado y bloquea edición no autorizada", async ({
  playwright,
}) => {
  const admin = await playwright.request.newContext({ baseURL: origin });
  const member = await playwright.request.newContext({ baseURL: origin });
  await admin.post("/api/app", {
    headers: { origin },
    data: { action: "demo" },
  });
  await member.post("/api/app", {
    headers: { origin },
    data: {
      action: "register",
      data: {
        name: "Miembro de prueba",
        email: `member-${Date.now()}@example.test`,
        password: "Prueba-local-2026!",
      },
    },
  });
  const registered = await (await member.get("/api/app")).json();
  let r = await admin.post("/api/app", {
    headers: { origin },
    data: {
      action: "assignUser",
      projectId: "robot",
      data: {
        id: registered.user.id,
        name: "Miembro de prueba",
        teamId: "electronics",
        role: "member",
        lead: false,
      },
    },
  });
  expect(r.status()).toBe(200);
  const data = await (await member.get("/api/app")).json();
  expect(data.user.status).toBe("active");
  expect(data.projects.map((p: { id: string }) => p.id)).toEqual(["robot"]);
  r = await member.post("/api/app", {
    headers: { origin },
    data: { action: "saveProject", projectId: "robot", data: data.projects[0] },
  });
  expect(r.status()).toBe(400);
  r = await member.post("/api/app", {
    headers: { origin },
    data: {
      action: "status",
      projectId: "robot",
      data: { id: "a7", status: "Hecha" },
    },
  });
  expect(r.status()).toBe(400);
  await admin.dispose();
  await member.dispose();
});

test("diálogos de equipo conservan foco, cierran con Escape y funcionan en móvil", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar proyecto de demostración" })
    .click();
  await page.getByRole("button", { name: "Equipos", exact: true }).click();
  const create = page.getByRole("button", {
    name: "Crear equipo",
    exact: true,
  });
  await create.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Cerrar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Guardar equipo" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("solicitud de cambio muestra destino y unidades antes de aplicarse", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar proyecto de demostración" })
    .click();
  await page
    .getByRole("button", { name: "Solicitudes de cambio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Solicitar cambio", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Qué cambio solicitas")
    .fill("Prueba de vista previa");
  await dialog.getByLabel("Duración propuesta · semanas").fill("9");
  await expect(dialog.locator(".plan-preview")).toContainText("semanas");
  await dialog.getByLabel("Tipo de cambio").selectOption("budget");
  await expect(
    dialog
      .getByRole("combobox", { name: "Destino", exact: true })
      .locator("option"),
  ).toHaveCount(1);
  await expect(
    dialog.getByRole("combobox", { name: "Destino", exact: true }),
  ).toHaveValue("budgetItem");
  await page.keyboard.press("Escape");
});

test("importar Excel con vista previa y reimportar conserva una sola actividad", async ({
  page,
}) => {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Actividades"),
    title = "Actividad importada E2E " + Date.now();
  sheet.addRow(["Referencia", "Título", "Equipo", "Inicio", "Duración"]);
  sheet.addRow(["E2E-" + Date.now(), title, "Electrónica", "2026-10-19", 2]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar proyecto de demostración" })
    .click();
  async function inspect() {
    await page
      .getByRole("button", { name: "Importar Excel", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: "prueba.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
    await page.getByRole("button", { name: "Revisar y ver cambios" }).click();
    await expect(
      page.getByRole("button", { name: "Confirmar importación" }),
    ).toBeEnabled();
  }
  await inspect();
  await expect(page.locator(".phase-table").first()).toContainText(title);
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "filas" }),
  ).toBeVisible();
  await inspect();
  await expect(page.locator(".phase-table").first()).toContainText(
    "Sin cambios",
  );
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await page.getByRole("button", { name: "Actividades", exact: true }).click();
  await page.getByLabel("Buscar actividades").fill(title);
  await expect(
    page.locator(".activity-name").filter({ hasText: title }),
  ).toHaveCount(1);
});

test("gasto pendiente puede corregirse y aprobarse sin perder trazabilidad", async ({
  page,
}) => {
  const title = "Gasto E2E " + Date.now();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar proyecto de demostración" })
    .click();
  await page
    .getByRole("button", { name: "Presupuesto y gastos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar gasto", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descripción del gasto").fill(title);
  await dialog.getByLabel(/Importe ·/).fill("1.25");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gastos y aprobaciones", exact: true })
    .click();
  let card = page.locator(".phase-entry").filter({ hasText: title });
  await card.getByRole("button", { name: "Corregir gasto" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Importe ·/).fill("2.50");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  card = page.locator(".phase-entry").filter({ hasText: title });
  await card.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(card.locator(".phase-status")).toContainText("Aprobado");
  await expect(
    card.getByRole("button", { name: "Corregir gasto" }),
  ).toHaveCount(0);
});
