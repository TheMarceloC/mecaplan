"use client";
import { useState } from "react";
import { ArrowUpRight, FolderKanban, Plus, Search, Users } from "lucide-react";
import { today, type Project, type PublicUser } from "@/lib/model";
import { normalizeText } from "@/lib/codes";
import {
  portfolioDashboard,
  projectDashboard,
  projectStatusLabels,
} from "@/lib/project-dashboard";

export function PortfolioDashboard({
  projects,
  user,
  open,
  create,
}: {
  projects: Project[];
  user: PublicUser;
  open: (id: string) => void;
  create: () => void;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const date = today(),
    summary = portfolioDashboard(projects, date);
  const filtered = projects.filter(
    (p) =>
      (!status || p.status === status) &&
      normalizeText(p.name + " " + p.description).includes(
        normalizeText(query),
      ),
  );
  return (
    <div className="portfolio-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MEC402 · DISEÑO MECATRÓNICO</div>
          <h1>
            Todos los proyectos<span className="heading-dot">.</span>
          </h1>
          <p>El panorama del equipo, desde la primera idea hasta la entrega.</p>
        </div>
        {user.globalRole === "superuser" && (
          <button className="primary" onClick={create}>
            <Plus size={17} />
            Crear proyecto
          </button>
        )}
      </div>
      <section className="portfolio-hero">
        <div>
          <span className="eyebrow">DASHBOARD GENERAL</span>
          <h2>Un lugar para ver cómo avanzamos.</h2>
          <p>
            {projects.length} proyectos disponibles · {summary.people}{" "}
            integrantes únicos
          </p>
        </div>
        <div className="portfolio-progress">
          <strong>{summary.progress}%</strong>
          <span>
            Avance global · {summary.completed}/{summary.total} actividades
          </span>
        </div>
      </section>
      <div
        className="portfolio-metrics"
        aria-label="Indicadores de todos los proyectos"
      >
        <Metric label="Proyectos en marcha" value={summary.active} />
        <Metric label="Actividades vencidas" value={summary.overdue} />
        <Metric label="Actividades bloqueadas" value={summary.blocked} />
        <Metric label="Riesgos abiertos" value={summary.openRisks} />
      </div>
      <div className="portfolio-toolbar">
        <label className="portfolio-search">
          <Search size={17} />
          <input
            aria-label="Buscar proyecto"
            placeholder="Buscar proyecto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(projectStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="subtle">
          {filtered.length} de {projects.length} proyectos
        </span>
      </div>
      {!projects.length ? (
        <section className="panel phase-empty">
          <FolderKanban size={38} />
          <h2>Tu próximo proyecto empieza aquí.</h2>
          <p>
            {user.globalRole === "superuser"
              ? "Crea un proyecto para organizar actividades y equipos."
              : "Todavía no tienes proyectos asignados. Solicita acceso al líder del proyecto."}
          </p>
          {user.isInstructor && (
            <a
              className="secondary"
              href="/api/evaluations?archive=1"
              target="_blank"
              rel="noreferrer"
            >
              Consultar evaluaciones conservadas
            </a>
          )}
        </section>
      ) : !filtered.length ? (
        <section className="panel phase-empty">
          <h2>No hay coincidencias</h2>
          <button
            className="secondary"
            onClick={() => {
              setQuery("");
              setStatus("");
            }}
          >
            Limpiar búsqueda
          </button>
        </section>
      ) : (
        <section className="portfolio-grid" aria-label="Proyectos disponibles">
          {filtered.map((p) => {
            const s = projectDashboard(p, date);
            return (
              <article className="panel portfolio-card" key={p.id}>
                <div className="section-heading">
                  <span className="portfolio-icon">
                    <FolderKanban size={24} />
                  </span>
                  <span className={"phase-status " + p.status}>
                    {projectStatusLabels[p.status]}
                  </span>
                </div>
                <h2>
                  <button
                    className="project-card-title"
                    onClick={() => open(p.id)}
                  >
                    {p.name}
                  </button>
                </h2>
                <p className="project-card-description">
                  {p.description || "Un proyecto por construir en equipo."}
                </p>
                <div className="portfolio-card-progress">
                  <span>
                    Avance <strong>{s.progress}%</strong>
                  </span>
                  <progress
                    max={100}
                    value={s.progress}
                    aria-label={"Avance de " + p.name}
                  />
                  <small>
                    {s.completed} de {s.total} actividades terminadas
                  </small>
                </div>
                <div className="portfolio-card-flags">
                  <span>{s.overdue} vencidas</span>
                  <span>{s.blocked} bloqueadas</span>
                  <span>{s.openRisks} riesgos abiertos</span>
                </div>
                <footer>
                  <span>
                    <Users size={15} />
                    {p.members.length} integrantes · {p.teams.length} equipos
                  </span>
                  <button className="text-btn" onClick={() => open(p.id)}>
                    Ver dashboard
                    <ArrowUpRight size={15} />
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      )}
      <p className="form-note">
        Los indicadores incluyen los proyectos a los que tienes acceso. El
        avance cuenta actividades finales; las agrupaciones y las canceladas no
        se cuentan dos veces.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel portfolio-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProjectDashboardDetails({
  project,
  navigate,
}: {
  project: Project;
  navigate: (
    view: "activities" | "risks" | "budget" | "storage" | "planning",
  ) => void;
}) {
  const s = projectDashboard(project, today());
  const money = (cents: number) =>
    new Intl.NumberFormat("es-HN", {
      style: "currency",
      currency: s.currency,
    }).format(cents / 100);
  return (
    <section
      className="project-dashboard-details"
      aria-label="Indicadores de control del proyecto"
    >
      <div className="portfolio-metrics">
        <Metric label="Sin planificar" value={s.unscheduled} />
        <Metric label="Riesgos abiertos" value={s.openRisks} />
        <Metric
          label={"Presupuesto · " + s.currency}
          value={money(s.plannedCents)}
        />
        <Metric
          label={"Gastos aprobados · " + s.currency}
          value={money(s.approvedCents)}
        />
      </div>
      <div className="dashboard-detail-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Estado de las actividades</h2>
            <button className="text-btn" onClick={() => navigate("activities")}>
              Ver actividades
              <ArrowUpRight size={14} />
            </button>
          </div>
          {s.states.map(({ status, count }) => (
            <div className="dashboard-state" key={status}>
              <span>{status}</span>
              <progress
                value={count}
                max={Math.max(s.total, 1)}
                aria-label={status + ": " + count}
              />
              <strong>{count}</strong>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Control del proyecto</h2>
          <div className="dashboard-shortcuts">
            <button onClick={() => navigate("risks")}>
              <span>Riesgos prioritarios abiertos</span>
              <strong>
                {s.highRisks}
                <ArrowUpRight size={14} />
              </strong>
            </button>
            <button onClick={() => navigate("budget")}>
              <span>Presupuesto y gastos</span>
              <ArrowUpRight size={16} />
            </button>
            <button onClick={() => navigate("storage")}>
              <span>Enlaces de documentos</span>
              <strong>
                {s.documents}
                <ArrowUpRight size={14} />
              </strong>
            </button>
            <button onClick={() => navigate("planning")}>
              <span>Calendario y planificación</span>
              <ArrowUpRight size={16} />
            </button>
          </div>
          <p className="form-note">
            Riesgo prioritario: abierto y con probabilidad × impacto de 15 o
            más, sobre 25. Los gastos pendientes o rechazados no se suman al
            gasto aprobado.
          </p>
        </section>
      </div>
    </section>
  );
}
