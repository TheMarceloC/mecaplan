"use client";
import { Dialog as Modal } from "@/components/dialog";
import { DailyFocus } from "@/components/daily-focus";
import { SecurityHistory } from "@/components/security-history";
import { AccountSettings } from "@/components/account-settings";
import {
  PortfolioDashboard,
  ProjectDashboardDetails,
} from "@/components/project-dashboard";
import { leafActivities } from "@/lib/model";
import { TeamManager, ProjectDeletion } from "@/components/project-tools";
import {
  PhasePanel,
  phaseTitles,
  phaseDescriptions,
  type PhaseView,
} from "@/components/phase-panel";
import {
  PasswordGate,
  ActivityExtras,
  ControlSummary,
} from "@/components/activity-extras";
import {
  control,
  scheduledCriticalIds,
  endFromDuration,
  durationBetween,
  startConflicts,
} from "@/lib/control";
import { impactNeedsConfirmation, type PlanImpact } from "@/lib/plan-impact";
import { ImpactConfirm } from "@/components/impact-confirm";
import { byCode, normalizeText } from "@/lib/codes";
import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity as Pulse,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Cpu,
  Download,
  Ellipsis,
  FolderKanban,
  Grid2X2,
  History,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Users,
  X,
  Box,
  Link2,
  CalendarDays,
  LoaderCircle,
} from "lucide-react";
import {
  states,
  raciValid,
  progress,
  taskProgress,
  today,
  type Activity,
  type Project,
  type PublicUser,
} from "@/lib/model";
import { can } from "@/server/auth/permissions";
type Payload = {
  demoEnabled: boolean;
  user: PublicUser | null;
  projects: Project[];
  users: PublicUser[];
};
type View =
  | "portfolio"
  | "account"
  | "overview"
  | "tasks"
  | "activities"
  | "kanban"
  | "teams"
  | "history"
  | "admin"
  | PhaseView;
type SortKey = "code" | "team" | "status" | "responsible" | "end";
const sortColumns: [SortKey, string][] = [
  ["code", "ACTIVIDAD"],
  ["team", "EQUIPO"],
  ["status", "ESTADO"],
  ["responsible", "RESPONSABLE"],
  ["end", "ENTREGA"],
];
// Vistas donde crear una actividad es la acción principal. En las demás el
// botón competía con la acción propia de la sección (registrar gasto, riesgo…).
const activityViews: View[] = [
  "overview",
  "tasks",
  "activities",
  "kanban",
  "planning",
];
const criticalHint =
  "Ruta crítica: si se atrasa, se atrasa la fecha final del proyecto";
type Filters = {
  critical: string;
  q: string;
  status: string;
  team: string;
  person: string;
  letter: string;
  priority: string;
  time: string;
  week: string;
  from: string;
  to: string;
  commits: string;
};
const empty: Filters = {
  critical: "",
  q: "",
  status: "",
  team: "",
  person: "",
  letter: "",
  priority: "",
  time: "",
  week: "",
  from: "",
  to: "",
  commits: "",
};
const icons = { electronics: Cpu, software: Code2, cad: Box };
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
const date = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("es-GT", {
    day: "numeric",
    month: "short",
  });
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={"avatar " + (small ? "small" : "")} title={name}>
      {initials(name)}
    </span>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge s-" + status.replaceAll(" ", "-")}>
      <i />
      {status}
    </span>
  );
}
export default function App() {
  const initialUser = useRef("");
  const [payload, setPayload] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<View>("portfolio"),
    [projectId, setProjectId] = useState(""),
    [toast, setToast] = useState(""),
    // Acción opcional del aviso; solo se muestra mientras el aviso tenga ese mismo texto.
    [toastAction, setToastAction] = useState<{
      message: string;
      label: string;
      run: () => void;
    } | null>(null),
    [modal, setModal] = useState<
      "activity" | "settings" | "project" | "filters" | null
    >(null),
    [selected, setSelected] = useState<Activity | null>(null),
    [board, setBoard] = useState(false),
    [mobile, setMobile] = useState(false),
    [filter, setFilter] = useState<Filters>(empty),
    [expanded, setExpanded] = useState(false),
    [authMode, setAuthMode] = useState<"login" | "register" | "reset">("login"),
    [inline, setInline] = useState<{
      id: string;
      title: string;
    } | null>(null),
    [userFilter, setUserFilter] = useState(""),
    [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null),
    [planningOpen, setPlanningOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("mecaplan:nav-planning") === "closed")
        setPlanningOpen(false);
    } catch {}
  }, []);
  function togglePlanning() {
    setPlanningOpen((open) => {
      try {
        localStorage.setItem("mecaplan:nav-planning", open ? "closed" : "open");
      } catch {}
      return !open;
    });
  }
  async function load() {
    const r = await fetch("/api/app", { cache: "no-store" });
    if (!r.ok) throw Error("No se pudo cargar el proyecto.");
    const d: Payload = await r.json();
    setPayload(d);
    if (!d.user) initialUser.current = "";
    if (d.user && initialUser.current !== d.user.id) {
      initialUser.current = d.user.id;
      setView("portfolio");
    }
    setProjectId((old) =>
      d.projects.some((p) => p.id === old)
        ? old
        : (d.projects.find((p) => p.id === "digit360")?.id ??
          d.projects[0]?.id ??
          ""),
    );
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const params = new URLSearchParams(location.search);
    if (params.get("panel") === "storage") setView("storage");
    if (params.get("storageMessage"))
      setToast(params.get("storageMessage")!.slice(0, 250));
    setFilter({
      ...empty,
      ...Object.fromEntries(
        Object.keys(empty).map((k) => [k, params.get(k) || ""]),
      ),
    });
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    history.replaceState(
      null,
      "",
      location.pathname + (params.size ? "?" + params.toString() : ""),
    );
  }, [filter]);
  useEffect(() => {
    if (toast) {
      // Con "Deshacer" el aviso dura más, para dar tiempo a reaccionar.
      const timer = setTimeout(
        () => setToast(""),
        toastAction?.message === toast ? 8000 : 5000,
      );
      return () => clearTimeout(timer);
    }
  }, [toast, toastAction]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [payload?.user?.id, view, projectId]);
  async function action(action: string, data?: unknown) {
    setBusy(true);
    try {
      const r = await fetch("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data, projectId }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      await load();
      return result;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "No se pudo guardar.");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const user = payload?.user,
    project = payload?.projects.find((p) => p.id === projectId);
  function go(next: View) {
    setView(next);
    setBoard(next === "kanban");
    setMobile(false);
    setFilter(empty);
  }
  function changeFilter(key: keyof Filters, value: string) {
    setFilter((f) => ({ ...f, [key]: value }));
  }
  function openActivity(a: Activity | null) {
    setSelected(a);
    setModal("activity");
  }
  async function status(
    a: Activity,
    value: Activity["status"],
    reason?: string,
  ) {
    if (value === "Bloqueada" && !reason) {
      openActivity({ ...a, status: value });
      return;
    }
    // Un "Deshacer" anterior ya no corresponde a este nuevo cambio.
    setToastAction(null);
    await action("status", { id: a.id, status: value, reason: reason ?? "" })
      .then(() => setToast("Estado actualizado."))
      .catch(() => {});
  }
  // Cambio de estado de un clic (casilla de la tabla o arrastre en el tablero):
  // el aviso ofrece volver al estado anterior por si fue un clic accidental.
  async function quickStatus(a: Activity, value: Activity["status"]) {
    const previous = a.status,
      reason = a.blockedReason;
    await status(a, value);
    setToastAction({
      message: "Estado actualizado.",
      label: "Deshacer",
      run: () => {
        setToastAction(null);
        status({ ...a, status: value }, previous, reason).catch(() => {});
      },
    });
  }
  if (!payload)
    return (
      <main className="loading">
        <div className="brand">
          <span className="brand-icon">
            <FolderKanban />
          </span>
          MecaPlan
        </div>
        {error ? (
          <>
            <p>{error}</p>
            <button onClick={() => load().catch((e) => setError(e.message))}>
              Volver a intentar
            </button>
          </>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </main>
    );
  if (!user)
    return (
      <div className="auth">
        <section className="auth-art">
          <div className="brand">
            <img
              className="institution-logo"
              src="/unitec-logo.png"
              alt="UNITEC"
            />
            <span>MecaPlan</span>
          </div>
          <span className="eyebrow">
            DISEÑO MECATRÓNICO · ESPACIO DE TRABAJO
          </span>
          <h1>
            Las grandes ideas
            <br />
            se construyen
            <br />
            <em>en equipo.</em>
          </h1>
          <p>
            Electrónica, código y manufactura.
            <br />
            Un solo lugar para conectar cada pieza.
          </p>
          <svg
            className="robot-art"
            viewBox="0 0 600 320"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id="dots"
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="1" fill="#6d8173" />
              </pattern>
            </defs>
            <rect width="600" height="320" fill="url(#dots)" />
            <path
              d="M60 275H525M208 263v-42h95v42M255 218l-70-92 42-34 88 100-18 29M189 125l89-71 38 38-91 65M295 53l101 32-11 39-93-29M397 84l37 6v29l-37 9M435 94l35-19m-35 39 35 15"
              stroke="#afc0b0"
              strokeWidth="10"
              strokeLinejoin="round"
            />
            <circle
              cx="211"
              cy="120"
              r="29"
              fill="#263e32"
              stroke="#dda975"
              strokeWidth="3"
            />
            <circle
              cx="297"
              cy="76"
              r="22"
              fill="#263e32"
              stroke="#dda975"
              strokeWidth="3"
            />
            <circle
              cx="270"
              cy="215"
              r="25"
              fill="#263e32"
              stroke="#dda975"
              strokeWidth="3"
            />
            <rect
              x="434"
              y="205"
              width="50"
              height="50"
              rx="4"
              stroke="#dda975"
              strokeWidth="2"
            />
            <path
              d="M459 155v34m-9-9 9 9 9-9"
              stroke="#dda975"
              strokeWidth="2"
            />
          </svg>
          <footer>
            <span>
              <i className="live-dot" />
              Hecho para pasar de la idea al prototipo.
            </span>
            <span>01 — 03</span>
          </footer>
        </section>
        <section className="auth-form">
          <div className="auth-top">
            TU PRÓXIMO PROYECTO EMPIEZA AQUÍ <Sparkles size={15} />
          </div>
          <div>
            <span className="mini-label">BIENVENIDO A MECAPLAN</span>
            <h2>
              {authMode === "register"
                ? "Construyamos algo."
                : authMode === "reset"
                  ? "Recupera tu acceso."
                  : "Todo listo para crear."}
            </h2>
            <p>
              {authMode === "register"
                ? "Regístrate. Tu administrador te asignará un equipo."
                : authMode === "reset"
                  ? "Pide un token temporal a tu superusuario."
                  : "Entra a tu espacio y sigue donde lo dejaste."}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await action(
                  authMode === "reset" ? "completeReset" : authMode,
                  Object.fromEntries(f),
                )
                  .then(() => setToast("Listo. Tu cuenta está preparada."))
                  .catch(() => {});
              }}
            >
              {authMode === "register" && (
                <label>
                  Nombre completo
                  <input
                    name="name"
                    required
                    minLength={2}
                    placeholder="Tu nombre y apellido"
                  />
                </label>
              )}
              {authMode !== "reset" ? (
                <label>
                  {authMode === "register"
                    ? "Correo electrónico"
                    : "Correo o usuario"}
                  <input
                    name="email"
                    type={authMode === "register" ? "email" : "text"}
                    required
                    placeholder="Correo o nombre de usuario"
                    autoComplete={
                      authMode === "register" ? "email" : "username"
                    }
                  />
                </label>
              ) : (
                <label>
                  Token de recuperación
                  <input name="token" required />
                </label>
              )}
              <label>
                {authMode === "reset" ? "Nueva contraseña" : "Contraseña"}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={authMode === "login" ? 1 : 12}
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    authMode === "login"
                      ? "Tu contraseña"
                      : "Al menos 12 caracteres"
                  }
                />
              </label>
              <button className="primary wide" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : authMode === "register" ? (
                  "Crear mi cuenta"
                ) : authMode === "reset" ? (
                  "Guardar contraseña"
                ) : (
                  "Iniciar sesión"
                )}
                <ArrowRight size={17} />
              </button>
            </form>
            <button
              className="text-btn"
              onClick={() =>
                setAuthMode(authMode === "register" ? "login" : "register")
              }
            >
              {authMode === "register"
                ? "Ya tengo una cuenta"
                : "¿Primera vez aquí? Crea tu cuenta"}
            </button>
            {authMode === "login" && (
              <button
                className="text-btn muted"
                onClick={() => setAuthMode("reset")}
              >
                Olvidé mi contraseña
              </button>
            )}
            {payload.demoEnabled && (
              <>
                <div className="divider">
                  <span>O CONOCE EL ESPACIO</span>
                </div>
                <button
                  className="secondary wide"
                  disabled={busy}
                  onClick={() => action("demo").catch(() => {})}
                >
                  <FolderKanban size={18} />
                  Explorar proyecto de demostración
                  <ArrowUpRight size={16} />
                </button>
                <p className="auth-note">
                  Datos de ejemplo · Sin registro · Entorno local
                </p>
              </>
            )}
          </div>
          <small>MecaPlan · El punto de encuentro de tu equipo.</small>
        </section>
        {toast && (
          <div role="status" className="toast">
            {toast}
          </div>
        )}
      </div>
    );
  if (user.mustChangePassword)
    return <PasswordGate user={user} busy={busy} action={action} />;
  if (user.status === "pending")
    return (
      <div className="account-pending">
        <div className="brand">
          <FolderKanban />
          MecaPlan
        </div>
        <Clock3 size={45} />
        <h1>Ya eres parte del comienzo.</h1>
        <p>
          Tu cuenta está pendiente de asignación. Un administrador debe
          asignarte un proyecto, un equipo y un rol.
        </p>
        <button className="primary" onClick={() => load().catch(() => {})}>
          Revisar mi acceso
        </button>
        <button
          className="secondary"
          onClick={() => action("logout").catch(() => {})}
        >
          Cerrar sesión
        </button>
      </div>
    );
  const criticalIds = project
    ? scheduledCriticalIds(project)
    : new Set<string>();
  const teamName = (id: string) =>
      project?.teams.find((t) => t.id === id)?.name ?? "",
    ownerName = (a: Activity) =>
      project?.members.find((m) => m.id === a.responsible[0])?.name ?? "";
  // Sin orden elegido: Mis tareas por entrega y el resto por código. Las
  // actividades sin planificar (al ordenar por entrega) y las que no tienen
  // responsable (al ordenar por responsable) quedan al final en ambos sentidos.
  const sortKey = sort?.key ?? (view === "tasks" ? "end" : "code"),
    sortDir = sort?.dir ?? 1;
  const compare = (a: Activity, b: Activity) => {
    if (sortKey === "end") {
      const unplanned = Number(!!a.unscheduled) - Number(!!b.unscheduled);
      if (unplanned) return unplanned;
    }
    if (sortKey === "responsible") {
      const unassigned = Number(!ownerName(a)) - Number(!ownerName(b));
      if (unassigned) return unassigned;
    }
    const r =
      sortKey === "end"
        ? a.end.localeCompare(b.end)
        : sortKey === "code"
          ? byCode(a, b)
          : sortKey === "team"
            ? teamName(a.teamId).localeCompare(teamName(b.teamId), "es")
            : sortKey === "status"
              ? states.indexOf(a.status) - states.indexOf(b.status)
              : ownerName(a).localeCompare(ownerName(b), "es");
    return r * sortDir || byCode(a, b);
  };
  const activities = project?.activities.filter((a) => !a.deletedAt) ?? [],
    visible = activities
      .filter((a) => {
        if (
          view === "tasks" &&
          !a.responsible.includes(user.id) &&
          a.accountable !== user.id
        )
          return false;
        if (filter.critical === "yes" && !criticalIds.has(a.id)) return false;
        if (
          filter.q &&
          !`${a.code} ${(a.aliases ?? []).join(" ")} ${a.title} ${a.description}`
            .toLowerCase()
            .includes(filter.q.toLowerCase())
        )
          return false;
        if (
          filter.status === "completed"
            ? a.status !== "Hecha"
            : filter.status === "open"
              ? ["Hecha", "Cancelada"].includes(a.status)
              : filter.status && a.status !== filter.status
        )
          return false;
        if (
          (filter.team && a.teamId !== filter.team) ||
          (filter.priority && a.priority !== filter.priority)
        )
          return false;
        const persons =
          filter.letter === "R"
            ? a.responsible
            : filter.letter === "A"
              ? [a.accountable]
              : filter.letter === "C"
                ? a.consulted
                : filter.letter === "I"
                  ? a.informed
                  : [
                      ...a.responsible,
                      a.accountable,
                      ...a.consulted,
                      ...a.informed,
                    ];
        if (filter.person && !persons.includes(filter.person)) return false;
        if (filter.letter && !filter.person && !persons.length) return false;
        const open = !["Hecha", "Cancelada"].includes(a.status);
        if (
          (filter.time === "overdue" &&
            !(open && !a.unscheduled && a.end < today())) ||
          (filter.time === "blocked" && a.status !== "Bloqueada") ||
          (filter.time === "soon" &&
            !(
              open &&
              a.end >= today() &&
              a.end <=
                new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
            ))
        )
          return false;
        if (
          (filter.from && a.end < filter.from) ||
          (filter.to && a.start > filter.to)
        )
          return false;
        if (filter.week && project) {
          const start =
              Date.parse(project.start) + (Number(filter.week) - 1) * 604800000,
            end = start + 604800000;
          if (Date.parse(a.end) < start || Date.parse(a.start) >= end)
            return false;
        }
        if (
          (filter.commits === "yes" && !a.commits) ||
          (filter.commits === "no" && a.commits > 0)
        )
          return false;
        return true;
      })
      .sort(compare);
  const pendingMine = activities.filter(
    (a) =>
      (a.responsible.includes(user.id) || a.accountable === user.id) &&
      !["Hecha", "Cancelada"].includes(a.status),
  ).length;
  const done = activities.filter((a) => a.status === "Hecha").length,
    blocked = activities.filter((a) => a.status === "Bloqueada").length,
    overdue = activities.filter(
      (a) =>
        !a.unscheduled &&
        a.end < today() &&
        !["Hecha", "Cancelada"].includes(a.status),
    ).length;
  const week = project
    ? Math.max(
        1,
        Math.floor((Date.now() - Date.parse(project.start)) / 604800000) + 1,
      )
    : 1;
  const filtered = Object.values(filter).some(Boolean);
  const nav: [View, string, typeof LayoutDashboard][] = [
    ["overview", "Dashboard del proyecto", LayoutDashboard],
    ["tasks", "Mis tareas", CheckCircle2],
    ["activities", "Actividades", List],
    ["kanban", "Tablero Kanban", FolderKanban],
    ["teams", "Equipos", Users],
    ["history", "Historial", History],
  ];
  const admin = project && can(user, "members:edit", project);
  return (
    <div className="workspace">
      <aside className={"sidebar " + (mobile ? "shown" : "")}>
        <a className="brand" href="/" aria-label="MecaPlan inicio">
          <img
            className="institution-logo"
            src="/unitec-logo.png"
            alt="UNITEC"
          />
          <span className="app-name">
            <FolderKanban size={18} />
            MecaPlan
          </span>
        </a>
        <p className="workspace-label">MEC402 · DISEÑO MECATRÓNICO</p>
        <label className="project-picker">
          <span className="project-emoji">
            <Box size={19} />
          </span>
          <select
            aria-label="Seleccionar proyecto"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              go("overview");
            }}
          >
            {payload.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </label>
        <div className="sidebar-rule" />
        <nav aria-label="Navegación general">
          <button
            className={view === "portfolio" ? "active" : ""}
            onClick={() => go("portfolio")}
          >
            <Grid2X2 size={19} />
            Todos los proyectos
          </button>
        </nav>
        <span className="nav-label">PROYECTO</span>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => go(key)}
            >
              <Icon size={19} />
              {label}
              {key === "tasks" && (
                <span
                  className="nav-counter"
                  title={pendingMine + " pendientes"}
                  aria-label={pendingMine + " pendientes"}
                >
                  {pendingMine}
                </span>
              )}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="nav-label next-label nav-group-toggle"
          aria-expanded={planningOpen}
          aria-controls="nav-planning"
          onClick={togglePlanning}
        >
          PLANIFICACIÓN Y CONTROL
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        {/* Plegado, el grupo solo muestra la sección abierta para no perder la ubicación. */}
        <nav id="nav-planning">
          {(Object.keys(phaseTitles) as PhaseView[])
            .filter(
              (key) =>
                key !== "files" &&
                (key !== "evaluation" || user.isInstructor) &&
                (planningOpen || view === key),
            )
            .map((key) => (
              <button
                key={key}
                className={view === key ? "active" : ""}
                onClick={() => go(key)}
              >
                {key === "planning" ? (
                  <CalendarDays size={18} />
                ) : key === "budget" ? (
                  <Pulse size={18} />
                ) : key === "evaluation" ? (
                  <ShieldCheck size={18} />
                ) : key === "context" ? (
                  <Sparkles size={18} />
                ) : (
                  <FolderKanban size={18} />
                )}
                <span>{phaseTitles[key]}</span>
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <Sparkles size={19} />
            </span>
            <strong>Un equipo. Una dirección.</strong>
            <p>
              Cada actividad acerca tu idea
              <br />
              un paso más a la realidad.
            </p>
            <button
              onClick={() => {
                setView("teams");
                setMobile(false);
              }}
            >
              Conoce tu equipo
              <ArrowUpRight size={14} />
            </button>
          </div>
          {(admin || user.globalRole === "superuser") && (
            <button
              className={"admin-link " + (view === "admin" ? "active" : "")}
              onClick={() => go("admin")}
            >
              <ShieldCheck size={18} />
              Administración
            </button>
          )}
          <button
            className="user-profile"
            onClick={() => go("account")}
            title="Mi cuenta"
            aria-label="Mi cuenta"
          >
            <Avatar name={user.name} />
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.id === "demo"
                  ? "Modo demostración"
                  : user.globalRole === "superuser"
                    ? "Superusuario"
                    : admin
                      ? "Líder de proyecto"
                      : "Miembro del equipo"}
              </small>
            </span>
            <Settings2 size={16} />
          </button>
          <button
            className="account-logout"
            onClick={() => action("logout").catch(() => {})}
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobile(false)}
          aria-label="Cerrar navegación"
        />
      )}
      <div className="main">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Abrir navegación"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <button className="text-btn" onClick={() => go("portfolio")}>
              Todos los proyectos
            </button>
            <ChevronRight size={14} />
            <strong>
              {view === "account"
                ? "Mi cuenta"
                : view === "portfolio"
                  ? "Dashboard general"
                  : (project?.name ?? "Proyectos")}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-label">
              <i className="live-dot" />
              {payload.demoEnabled ? "Espacio local" : "Espacio del equipo"}
            </span>
            <span className="topbar-date">
              {new Date().toLocaleDateString("es-GT", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-btn notification"
              aria-label="Ver actividades bloqueadas"
              onClick={() => {
                setView("activities");
                changeFilter("time", "blocked");
              }}
            >
              <Bell size={19} />
              {blocked > 0 && <i />}
            </button>
            <Avatar name={user.name} small />
          </div>
        </header>
        <main className="content">
          {view === "portfolio" ? (
            <PortfolioDashboard
              projects={payload.projects}
              user={user}
              create={() => setModal("project")}
              open={(id) => {
                setProjectId(id);
                go("overview");
              }}
            />
          ) : view === "account" ? (
            <AccountSettings
              key={user.id}
              user={user}
              action={action}
              busy={busy}
            />
          ) : !project ? (
            <div className="empty-state">
              <FolderKanban size={40} />
              <h1>Tu próximo proyecto empieza aquí.</h1>
              {user.isInstructor && (
                <a
                  className="secondary"
                  href="/api/evaluations?archive=1"
                  target="_blank"
                  rel="noreferrer"
                >
                  Consultar archivo privado de evaluaciones
                </a>
              )}
              <p>
                {user.globalRole === "superuser"
                  ? "Crea el primer proyecto para comenzar."
                  : "Todavía no tienes un proyecto asignado."}
              </p>
              {user.globalRole === "superuser" && (
                <button className="primary" onClick={() => setModal("project")}>
                  <Plus size={16} />
                  Crear proyecto
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{"MEC402 · DISEÑO MECATRÓNICO"}</div>
                  <h1>
                    {
                      {
                        portfolio: "Todos los proyectos",
                        account: "Mi cuenta",
                        overview: "Dashboard del proyecto",
                        tasks: "Mis tareas",
                        activities: "Actividades",
                        kanban: "Tablero Kanban",
                        teams: "Equipos",
                        history: "Historial del proyecto",
                        admin: "Administración",
                        ...phaseTitles,
                      }[view]
                    }
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {view === "overview"
                      ? "Cada pieza cuenta. Así avanza lo que están construyendo."
                      : view === "tasks"
                        ? "Tus responsabilidades, con el siguiente paso siempre claro."
                        : view === "kanban"
                          ? "Cada actividad en su estado. Abre una tarjeta para ver su detalle o actualizarla."
                          : view === "activities"
                            ? "Del primer boceto al último detalle. Organiza cada paso."
                            : view === "teams"
                              ? "Equipos conectados por un mismo objetivo."
                              : view === "history"
                                ? "Cada decisión deja una huella. Aquí puedes consultarla."
                                : view in phaseDescriptions
                                  ? phaseDescriptions[view as PhaseView]
                                  : "Las personas correctas, en el equipo correcto."}
                  </p>
                </div>
                <div className="heading-actions">
                  {view === "overview" && (
                    <button
                      className="secondary"
                      onClick={() => setModal("settings")}
                    >
                      <Settings2 size={16} />
                      Configurar proyecto
                    </button>
                  )}
                  {activityViews.includes(view) &&
                    can(user, "activity:edit", project, {
                      teamId: project.members.find((m) => m.id === user.id)
                        ?.teamId,
                    } as Activity) && (
                      <button
                        className="primary"
                        onClick={() => openActivity(null)}
                      >
                        <Plus size={17} />
                        Nueva actividad
                      </button>
                    )}
                </div>
              </div>
              {Object.prototype.hasOwnProperty.call(phaseTitles, view) && (
                <PhasePanel
                  view={view as PhaseView}
                  project={project}
                  user={user}
                  busy={busy}
                  action={action}
                  refresh={load}
                  rows={visible}
                  filters={filter}
                  changeFilter={(key, value) =>
                    changeFilter(key as keyof Filters, value)
                  }
                  openFilters={() => setModal("filters")}
                  clearFilters={() => setFilter(empty)}
                />
              )}{" "}
              {view === "overview" && (
                <>
                  <ControlSummary project={project} />
                  <ProjectDashboardDetails project={project} navigate={go} />
                  <section className="project-banner">
                    <div className="project-symbol">
                      <Box size={29} />
                    </div>
                    <div className="project-banner-title">
                      <div>
                        <h2>{project.name}</h2>
                        <span className="badge project-state">
                          <i />
                          {project.status === "active"
                            ? "En marcha"
                            : project.status === "planning"
                              ? "En planificación"
                              : project.status === "closed"
                                ? "Cerrado"
                                : "Archivado"}
                        </span>
                      </div>
                      <p>{project.description}</p>
                      <div className="project-meta">
                        <span>
                          <CalendarDays size={14} />
                          {date(project.start)} —{" "}
                          {date(
                            new Date(
                              Date.parse(project.start) +
                                project.weeks * 604800000,
                            )
                              .toISOString()
                              .slice(0, 10),
                          )}
                        </span>
                        <span>
                          <Users size={14} />
                          {project.members.length} integrantes
                        </span>
                        <span>
                          <FolderKanban size={14} />
                          {project.teams.length} equipos
                        </span>
                      </div>
                    </div>
                    <div className="week-box">
                      <span>ESTAMOS EN LA</span>
                      <strong>
                        Semana {week}
                        <small> / {project.weeks}</small>
                      </strong>
                      <div className="week-track">
                        {Array.from(
                          { length: Math.min(project.weeks, 20) },
                          (_, i) => (
                            <i key={i} className={i < week ? "filled" : ""} />
                          ),
                        )}
                      </div>
                    </div>
                  </section>
                  <section className="metrics">
                    <article className="metric">
                      <div>
                        <span>Avance del proyecto</span>
                        <span className="metric-icon green">
                          <Pulse size={19} />
                        </span>
                      </div>
                      <strong>
                        {progress(project)}
                        <small>%</small>
                      </strong>
                      <div className="metric-progress">
                        <i style={{ width: progress(project) + "%" }} />
                      </div>
                      <p>
                        {done} de {activities.length} actividades completadas
                      </p>
                    </article>
                    <article className="metric">
                      <div>
                        <span>Actividades en marcha</span>
                        <span className="metric-icon blue">
                          <Clock3 size={19} />
                        </span>
                      </div>
                      <strong>
                        {activities
                          .filter((a) => a.status === "En progreso")
                          .length.toString()
                          .padStart(2, "0")}
                      </strong>
                      <p>
                        <span className="tiny-dot blue-dot" />
                        El equipo está construyendo
                      </p>
                    </article>
                    <article className="metric">
                      <div>
                        <span>Necesitan atención</span>
                        <span className="metric-icon peach">
                          <TriangleAlert size={19} />
                        </span>
                      </div>
                      <strong>
                        {activities
                          .filter(
                            (a) =>
                              a.status === "Bloqueada" ||
                              (!a.unscheduled &&
                                a.end < today() &&
                                !["Hecha", "Cancelada"].includes(a.status)),
                          )
                          .length.toString()
                          .padStart(2, "0")}
                      </strong>
                      <p>
                        <button
                          onClick={() => {
                            setView("activities");
                            changeFilter("time", "blocked");
                          }}
                        >
                          {blocked} bloqueada{blocked !== 1 ? "s" : ""}
                        </button>
                        <span className="separator">·</span>
                        <button
                          onClick={() => {
                            setView("activities");
                            changeFilter("time", "overdue");
                          }}
                        >
                          {overdue} vencida{overdue !== 1 ? "s" : ""}
                        </button>
                      </p>
                    </article>
                    <article className="metric">
                      <div>
                        <span>Integrantes</span>
                        <span className="metric-icon purple">
                          <Users size={19} />
                        </span>
                      </div>
                      <strong>
                        {project.members.length.toString().padStart(2, "0")}
                      </strong>
                      <div className="avatar-stack">
                        {project.members.slice(0, 4).map((m) => (
                          <Avatar name={m.name} key={m.id} small />
                        ))}
                        <span>en {project.teams.length} equipos</span>
                      </div>
                    </article>
                  </section>
                  <div className="section-heading">
                    <h2>
                      El pulso de tus equipos
                      <span className="subtle"> / {project.teams.length}</span>
                    </h2>
                    <button className="text-link" onClick={() => go("teams")}>
                      Ver equipos
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <section className="team-grid">
                    {project.teams.map((t) => {
                      const rows = leafActivities(project).filter(
                        (a) => a.teamId === t.id,
                      );
                      const n = rows.filter((a) => a.status === "Hecha").length;
                      const pct = rows.length
                        ? Math.round((n / rows.length) * 100)
                        : 0;
                      const Icon = icons[t.id as keyof typeof icons] ?? Users;
                      return (
                        <button
                          key={t.id}
                          className="team-card"
                          style={{ "--team": t.color } as React.CSSProperties}
                          onClick={() => {
                            setView("activities");
                            changeFilter("team", t.id);
                          }}
                        >
                          <div className="team-top">
                            <span className="team-icon">
                              <Icon size={20} />
                            </span>
                            <span className="team-members">
                              {project.members
                                .filter((m) => m.teamId === t.id)
                                .slice(0, 3)
                                .map((m) => (
                                  <Avatar name={m.name} small key={m.id} />
                                ))}
                            </span>
                            <ArrowUpRight size={16} />
                          </div>
                          <h3>{t.name}</h3>
                          <p>
                            {rows.length} actividades<span>·</span>
                            {
                              project.members.filter((m) => m.teamId === t.id)
                                .length
                            }{" "}
                            integrantes
                          </p>
                          <div className="team-progress-label">
                            <span>
                              {n} {n === 1 ? "completada" : "completadas"}
                            </span>
                            <strong>{pct}%</strong>
                          </div>
                          <div className="team-progress">
                            <i style={{ width: pct + "%" }} />
                          </div>
                          <footer>
                            {rows.some((a) => a.status === "Bloqueada") ? (
                              <span className="attention">
                                <TriangleAlert size={12} />
                                Un bloqueo por resolver
                              </span>
                            ) : (
                              <span>
                                <i className="tiny-dot" />
                                Todo en movimiento
                              </span>
                            )}
                            <ChevronRight size={14} />
                          </footer>
                        </button>
                      );
                    })}
                  </section>
                </>
              )}
              {view === "teams" && (
                <TeamManager
                  key={project.id}
                  project={project}
                  user={user}
                  action={action}
                  busy={busy}
                />
              )}{" "}
              {view === "admin" && (
                <ProjectDeletion
                  key={project.id}
                  project={project}
                  user={user}
                  action={action}
                  busy={busy}
                />
              )}
              {view === "tasks" && (
                <DailyFocus project={project} userId={user.id} />
              )}
              {["overview", "activities", "tasks", "kanban"].includes(view) && (
                <section className="activity-section">
                  <div className="section-heading">
                    <div className="section-title">
                      <h2>
                        {view === "overview"
                          ? "En el radar del equipo"
                          : view === "kanban"
                            ? "Actividades por estado"
                            : "Tu plan de trabajo"}
                      </h2>
                      <span className="count">{visible.length}</span>
                      {view === "tasks" && (
                        <span className="subtle pending-note">
                          {pendingMine}{" "}
                          {pendingMine === 1 ? "pendiente" : "pendientes"}
                        </span>
                      )}
                    </div>
                    {view !== "kanban" && (
                      <div className="view-switch">
                        <button
                          aria-label="Vista de lista"
                          className={!board ? "active" : ""}
                          onClick={() => setBoard(false)}
                        >
                          <List size={16} />
                          Lista
                        </button>
                        <button
                          aria-label="Vista de tablero"
                          className={board ? "active" : ""}
                          onClick={() => setBoard(true)}
                        >
                          <Grid2X2 size={15} />
                          Tablero
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="filter-bar">
                    <div className="quick-filters">
                      <button
                        className={
                          !filter.status && !filter.time ? "selected" : ""
                        }
                        onClick={() =>
                          setFilter((f) => ({ ...f, status: "", time: "" }))
                        }
                      >
                        Todas
                      </button>
                      <button
                        className={filter.status === "open" ? "selected" : ""}
                        onClick={() => changeFilter("status", "open")}
                      >
                        No completadas
                      </button>
                      <button
                        className={
                          filter.status === "completed" ? "selected" : ""
                        }
                        onClick={() => changeFilter("status", "completed")}
                      >
                        Completadas
                      </button>
                      <button
                        className={filter.time === "blocked" ? "selected" : ""}
                        onClick={() =>
                          changeFilter(
                            "time",
                            filter.time === "blocked" ? "" : "blocked",
                          )
                        }
                      >
                        <span className="tiny-dot amber-dot" />
                        Bloqueadas
                      </button>
                    </div>
                    <div className="filter-tools">
                      <label className="search">
                        <Search size={16} />
                        <input
                          value={filter.q}
                          onChange={(e) => changeFilter("q", e.target.value)}
                          placeholder="Buscar actividad..."
                          aria-label="Buscar actividades"
                        />
                      </label>
                      <button
                        className={
                          "secondary filter-button " +
                          (filtered ? "filtered" : "")
                        }
                        onClick={() => setModal("filters")}
                      >
                        <SlidersHorizontal size={15} />
                        Filtros{filtered && <i />}
                      </button>
                    </div>
                  </div>
                  {filtered && (
                    <div className="filter-summary">
                      <span>
                        {visible.length}{" "}
                        {visible.length === 1 ? "resultado" : "resultados"}
                        {filter.team &&
                          ` · ${project.teams.find((t) => t.id === filter.team)?.name}`}
                      </span>
                      <button onClick={() => setFilter(empty)}>
                        Limpiar filtros
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  {visible.some((a) => criticalIds.has(a.id)) && (
                    <p className="critical-legend">
                      <i aria-hidden="true" />
                      Borde rojo: ruta crítica. Si una de estas actividades se
                      atrasa, se atrasa la fecha final del proyecto.
                    </p>
                  )}
                  {board ? (
                    <div
                      className="kanban"
                      role="region"
                      aria-label="Tablero Kanban"
                    >
                      {states
                        .filter(
                          (s) =>
                            view === "kanban" ||
                            s !== "Cancelada" ||
                            filter.status === "Cancelada" ||
                            visible.some((a) => a.status === "Cancelada"),
                        )
                        .map((s) => (
                          <div
                            className="kanban-column"
                            role="region"
                            aria-label={s}
                            key={s}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const a = activities.find(
                                (a) =>
                                  a.id === e.dataTransfer.getData("text/plain"),
                              );
                              if (a && a.status !== s) quickStatus(a, s);
                            }}
                          >
                            <header>
                              <Badge status={s} />
                              <span>
                                {visible.filter((a) => a.status === s).length}
                              </span>
                            </header>
                            {!visible.some((a) => a.status === s) && (
                              <p className="kanban-empty">Sin actividades</p>
                            )}
                            {visible
                              .filter((a) => a.status === s)
                              .map((a) => (
                                <button
                                  key={a.id}
                                  className={
                                    "kanban-card " +
                                    (criticalIds.has(a.id)
                                      ? "critical-card"
                                      : "")
                                  }
                                  title={
                                    criticalIds.has(a.id)
                                      ? criticalHint
                                      : undefined
                                  }
                                  draggable={can(
                                    user,
                                    "activity:status",
                                    project,
                                    a,
                                  )}
                                  onDragStart={(e) =>
                                    e.dataTransfer.setData("text/plain", a.id)
                                  }
                                  onClick={() => openActivity(a)}
                                >
                                  <span className="code">
                                    {a.code}
                                    {criticalIds.has(a.id) && (
                                      <span className="sr-only">
                                        {" "}
                                        · ruta crítica
                                      </span>
                                    )}
                                  </span>
                                  <strong>{a.title}</strong>
                                  <span className="team-label">
                                    <i
                                      style={{
                                        background: project.teams.find(
                                          (t) => t.id === a.teamId,
                                        )?.color,
                                      }}
                                    />
                                    {
                                      project.teams.find(
                                        (t) => t.id === a.teamId,
                                      )?.name
                                    }
                                  </span>
                                  <footer>
                                    <span>
                                      {a.unscheduled
                                        ? "Sin planificar"
                                        : date(a.end)}
                                    </span>
                                    <Avatar
                                      name={
                                        project.members.find(
                                          (m) => m.id === a.responsible[0],
                                        )?.name ?? "Sin asignar"
                                      }
                                      small
                                    />
                                  </footer>
                                </button>
                              ))}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table className="activity-table">
                        <thead>
                          <tr>
                            <th className="check-cell">
                              <Check size={13} />
                            </th>
                            {sortColumns.map(([key, label]) => (
                              <th
                                key={key}
                                aria-sort={
                                  sortKey === key
                                    ? sortDir === 1
                                      ? "ascending"
                                      : "descending"
                                    : "none"
                                }
                              >
                                <button
                                  type="button"
                                  className="sort-header"
                                  title={"Ordenar por " + label.toLowerCase()}
                                  onClick={() =>
                                    setSort({
                                      key,
                                      dir:
                                        sortKey === key && sortDir === 1
                                          ? -1
                                          : 1,
                                    })
                                  }
                                >
                                  {label}
                                  {sortKey === key &&
                                    (sortDir === 1 ? (
                                      <ArrowUp size={11} aria-hidden="true" />
                                    ) : (
                                      <ArrowDown size={11} aria-hidden="true" />
                                    ))}
                                </button>
                              </th>
                            ))}
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {visible
                            .slice(
                              0,
                              view === "overview" && !expanded ? 5 : undefined,
                            )
                            .map((a) => (
                              <tr
                                key={a.id}
                                className={
                                  criticalIds.has(a.id) ? "critical-row" : ""
                                }
                                title={
                                  criticalIds.has(a.id)
                                    ? criticalHint
                                    : undefined
                                }
                              >
                                <td className="check-cell">
                                  <button
                                    className={
                                      "task-check " +
                                      (a.status === "Hecha" ? "checked" : "")
                                    }
                                    aria-label={
                                      a.status === "Hecha"
                                        ? "Reabrir " + a.title
                                        : "Completar " + a.title
                                    }
                                    disabled={
                                      !can(user, "activity:status", project, a)
                                    }
                                    onClick={() =>
                                      quickStatus(
                                        a,
                                        a.status === "Hecha"
                                          ? "Pendiente"
                                          : "Hecha",
                                      )
                                    }
                                  >
                                    {a.status === "Hecha" && (
                                      <Check size={12} />
                                    )}
                                  </button>
                                </td>
                                <td>
                                  <button
                                    className="activity-name"
                                    onClick={() => openActivity(a)}
                                    style={{ paddingLeft: a.parentId ? 14 : 0 }}
                                  >
                                    <span className="code">
                                      {a.code}
                                      {a.parentId && " ↳"}
                                      {criticalIds.has(a.id) && (
                                        <span className="sr-only">
                                          {" "}
                                          · ruta crítica
                                        </span>
                                      )}
                                    </span>
                                    <strong>{a.title}</strong>
                                    <small className="mobile-meta">
                                      {a.unscheduled
                                        ? "Sin planificar"
                                        : date(a.end)}{" "}
                                      · {ownerName(a) || "Sin asignar"}
                                    </small>
                                  </button>
                                  {can(user, "activity:edit", project, a) && (
                                    <button
                                      className="inline-edit"
                                      title="Editar nombre en línea"
                                      aria-label={"Editar nombre de " + a.code}
                                      onClick={() =>
                                        setInline({ id: a.id, title: a.title })
                                      }
                                    >
                                      <Settings2 size={12} />
                                    </button>
                                  )}
                                  {inline?.id === a.id && (
                                    <form
                                      className="inline-title-form"
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        action("saveActivity", {
                                          ...a,
                                          title: inline.title,
                                        })
                                          .then(() => {
                                            setInline(null);
                                            setToast("Nombre actualizado.");
                                          })
                                          .catch(() => {});
                                      }}
                                    >
                                      <input
                                        autoFocus
                                        aria-label="Nuevo nombre de actividad"
                                        value={inline.title}
                                        minLength={3}
                                        maxLength={160}
                                        required
                                        onChange={(e) =>
                                          setInline({
                                            ...inline,
                                            title: e.target.value,
                                          })
                                        }
                                      />
                                      <button
                                        className="icon-btn"
                                        aria-label="Guardar nombre"
                                        disabled={busy}
                                      >
                                        <Check size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-btn"
                                        aria-label="Cancelar edición"
                                        onClick={() => setInline(null)}
                                      >
                                        <X size={14} />
                                      </button>
                                    </form>
                                  )}
                                  {!raciValid(a) && (
                                    <span className="raci-warning">
                                      Revisar RACI
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className="team-label">
                                    <i
                                      style={{
                                        background: project.teams.find(
                                          (t) => t.id === a.teamId,
                                        )?.color,
                                      }}
                                    />
                                    {
                                      project.teams.find(
                                        (t) => t.id === a.teamId,
                                      )?.name
                                    }
                                  </span>
                                </td>
                                <td>
                                  <Badge status={a.status} />
                                  {activities.some(
                                    (b) => b.parentId === a.id,
                                  ) && (
                                    <small className="subtle">
                                      {" "}
                                      {taskProgress(a, project)}%
                                    </small>
                                  )}
                                </td>
                                <td>
                                  <div className="assignee">
                                    <Avatar
                                      small
                                      name={
                                        project.members.find(
                                          (m) => m.id === a.responsible[0],
                                        )?.name ?? "Sin asignar"
                                      }
                                    />
                                    <span>
                                      {project.members
                                        .find((m) => m.id === a.responsible[0])
                                        ?.name.split(" ")
                                        .slice(0, 2)
                                        .join(" ") ?? "Sin asignar"}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span
                                    className={
                                      !a.unscheduled &&
                                      a.end < today() &&
                                      !["Hecha", "Cancelada"].includes(a.status)
                                        ? "overdue"
                                        : ""
                                    }
                                  >
                                    {a.unscheduled
                                      ? "Sin planificar"
                                      : date(a.end)}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="icon-btn"
                                    aria-label={"Ver " + a.code}
                                    onClick={() => openActivity(a)}
                                  >
                                    <Ellipsis size={17} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!visible.length && (
                        <div className="empty-state">
                          <Search size={28} />
                          <h3>No hay actividades con estos filtros.</h3>
                          <button
                            className="text-link"
                            onClick={() => setFilter(empty)}
                          >
                            Limpiar filtros
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {view === "overview" && visible.length > 5 && !board && (
                    <button
                      className="table-footer"
                      onClick={() => setExpanded(!expanded)}
                    >
                      {expanded
                        ? "Mostrar menos"
                        : `Ver las ${visible.length} actividades`}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </section>
              )}
              {view === "overview" && (
                <div className="bottom-grid">
                  <section className="recent panel">
                    <div className="section-heading">
                      <h2>Lo que está pasando</h2>
                      <span className="mini-label">ACTIVIDAD RECIENTE</span>
                    </div>
                    {project.history.slice(0, 3).map((h) => (
                      <div key={h.id} className="history-line">
                        <Avatar small name={h.actor} />
                        <div>
                          <p>
                            <strong>{h.actor}</strong>{" "}
                            <span>{h.action.toLowerCase()}</span>
                          </p>
                          <small>{h.entity}</small>
                        </div>
                        <time>
                          {new Date(h.date).toLocaleTimeString("es-GT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))}
                    {!project.history.length && (
                      <p className="subtle">
                        El historial aparecerá con el primer cambio.
                      </p>
                    )}
                  </section>
                  <section className="focus-card">
                    <span className="mini-label">
                      <Sparkles size={15} />
                      UN PASO A LA VEZ
                    </span>
                    <h2>
                      El siguiente avance
                      <br />
                      empieza con claridad.
                    </h2>
                    <p>
                      Revisa tus responsabilidades y ayuda a que
                      <br />
                      ninguna pieza se quede atrás.
                    </p>
                    <button onClick={() => go("tasks")}>
                      Ir a mis tareas
                      <ArrowUpRight size={16} />
                    </button>
                    <div className="focus-decoration">↗</div>
                  </section>
                </div>
              )}
              {view === "teams" && (
                <div className="team-detail-grid">
                  {project.teams.map((t) => {
                    const Icon = icons[t.id as keyof typeof icons] ?? Users;
                    return (
                      <section className="panel" key={t.id}>
                        <div className="section-heading">
                          <h2>
                            <Icon size={20} color={t.color} />
                            {t.name}
                          </h2>
                        </div>
                        {project.members
                          .filter((m) => m.teamId === t.id)
                          .map((m) => (
                            <div className="member-row" key={m.id}>
                              <Avatar name={m.name} />
                              <div>
                                <strong>{m.name}</strong>
                                <small>
                                  {m.role === "admin"
                                    ? "Líder de proyecto"
                                    : m.lead
                                      ? "Líder de equipo"
                                      : "Miembro"}{" "}
                                  ·{" "}
                                  {
                                    activities.filter(
                                      (a) =>
                                        (a.responsible.includes(m.id) ||
                                          a.accountable === m.id) &&
                                        a.status !== "Hecha",
                                    ).length
                                  }{" "}
                                  actividades abiertas
                                </small>
                              </div>
                            </div>
                          ))}
                        <button
                          className="secondary wide"
                          onClick={() => {
                            setView("activities");
                            changeFilter("team", t.id);
                          }}
                        >
                          Ver actividades
                          <ArrowRight size={15} />
                        </button>
                      </section>
                    );
                  })}
                </div>
              )}
              {view === "history" && (
                <section className="panel audit">
                  <div className="section-heading">
                    <h2>
                      <History size={19} />
                      Registro de cambios
                    </h2>
                    <button
                      className="secondary"
                      onClick={() =>
                        download(
                          JSON.stringify(project.history, null, 2),
                          "historial.json",
                          "application/json",
                        )
                      }
                    >
                      <Download size={15} />
                      Exportar historial
                    </button>
                  </div>
                  {project.history.map((h) => (
                    <article key={h.id}>
                      <Avatar name={h.actor} />
                      <div>
                        <strong>
                          {h.actor} · {h.action}
                        </strong>
                        <p>{h.entity}</p>
                        <details>
                          <summary>Ver valores anteriores y nuevos</summary>
                          <div className="diff">
                            <pre>
                              Anterior:{"\n"}
                              {h.before}
                            </pre>
                            <pre>
                              Nuevo:{"\n"}
                              {h.after}
                            </pre>
                          </div>
                        </details>
                      </div>
                      <time>{new Date(h.date).toLocaleString("es-GT")}</time>
                    </article>
                  ))}
                </section>
              )}
              {view === "admin" && user.globalRole === "superuser" && (
                <SecurityHistory />
              )}
              {view === "admin" && admin && (
                <section className="panel admin-panel">
                  <div className="section-heading">
                    <h2>Personas y acceso</h2>
                    {user.globalRole === "superuser" && (
                      <button
                        className="primary"
                        onClick={() => setModal("project")}
                      >
                        <Plus size={16} />
                        Nuevo proyecto
                      </button>
                    )}
                  </div>
                  <p className="subtle">
                    Las cuentas nuevas esperan aquí hasta que les asignes
                    proyecto, equipo y rol.
                  </p>
                  <label className="user-status-filter">
                    Filtrar cuentas
                    <select
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                    >
                      <option value="">Todos los estados</option>
                      <option value="pending">Sin asignar</option>
                      <option value="active">Activos</option>
                      <option value="disabled">Desactivados</option>
                    </select>
                  </label>
                  {payload.users
                    .filter((u) => !userFilter || u.status === userFilter)
                    .map((u) => (
                      <form
                        key={u.id}
                        className="admin-user"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          await action("assignUser", {
                            id: u.id,
                            name: u.name,
                            teamId: f.get("teamId"),
                            role: f.get("role"),
                            lead: f.get("lead") === "on",
                          })
                            .then(() => setToast("Acceso actualizado."))
                            .catch(() => {});
                        }}
                      >
                        <Avatar name={u.name} />
                        <div className="admin-name">
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                          <span className="mini-label">
                            {u.status === "pending"
                              ? "Sin asignar"
                              : u.status === "disabled"
                                ? "Desactivado"
                                : "Activo"}
                          </span>
                        </div>
                        <select
                          name="teamId"
                          aria-label={"Equipo de " + u.name}
                          defaultValue={
                            project.members.find((m) => m.id === u.id)
                              ?.teamId ?? project.teams[0]?.id
                          }
                        >
                          {project.teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <select
                          name="role"
                          aria-label={"Rol de " + u.name}
                          defaultValue={
                            project.members.find((m) => m.id === u.id)?.role ??
                            "member"
                          }
                        >
                          <option value="member">Miembro</option>
                          <option value="admin">Administrador</option>
                        </select>
                        <label className="checkbox-label">
                          <input
                            name="lead"
                            type="checkbox"
                            defaultChecked={
                              project.members.find((m) => m.id === u.id)?.lead
                            }
                          />
                          Líder
                        </label>
                        <button
                          className="secondary"
                          disabled={busy || u.id === "demo"}
                        >
                          Asignar
                        </button>
                        {user.globalRole === "superuser" &&
                          u.id !== user.id &&
                          u.id !== "demo" && (
                            <>
                              <button
                                type="button"
                                className="text-btn"
                                onClick={() =>
                                  action("userStatus", {
                                    id: u.id,
                                    status:
                                      u.status === "disabled"
                                        ? "active"
                                        : "disabled",
                                    globalRole: u.globalRole,
                                  }).catch(() => {})
                                }
                              >
                                {u.status === "disabled"
                                  ? "Activar"
                                  : "Desactivar"}
                              </button>
                              <button
                                type="button"
                                className="text-btn"
                                onClick={() =>
                                  action("resetPassword", { userId: u.id })
                                    .then((r) =>
                                      window.prompt(
                                        "Copia este token y entrégalo al usuario. Caduca en 30 minutos.",
                                        r.token,
                                      ),
                                    )
                                    .catch(() => {})
                                }
                              >
                                Restablecer
                              </button>
                              <button
                                type="button"
                                className="text-btn"
                                onClick={() =>
                                  action("userStatus", {
                                    id: u.id,
                                    status: u.status,
                                    globalRole:
                                      u.globalRole === "superuser"
                                        ? "user"
                                        : "superuser",
                                  }).catch(() => {})
                                }
                              >
                                {u.globalRole === "superuser"
                                  ? "Quitar superusuario"
                                  : "Hacer superusuario"}
                              </button>
                            </>
                          )}
                      </form>
                    ))}
                </section>
              )}
              <footer className="page-footer">
                <span>
                  <span className="footer-logo">M</span>Hecho para construir
                  juntos.
                </span>
                <span>
                  MecaPlan<span className="footer-divider">/</span>Diseño
                  mecatrónico
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {modal === "activity" && project && (
        <ActivityEditor
          apiAction={action}
          activity={selected}
          project={project}
          user={user}
          busy={busy}
          close={() => setModal(null)}
          save={async (a, confirmed = false) => {
            // Solo se pide confirmar si cambiar la duración mueve el fin del
            // proyecto o aumenta el exceso; la confirmación la muestra el formulario.
            if (!confirmed && selected && selected.duration !== a.duration) {
              const impact: PlanImpact = await action("previewPlan", {
                activities: [
                  {
                    id: a.id,
                    duration: a.duration,
                    dependencies: a.dependencies,
                    dependencyLags: a.dependencyLags ?? {},
                  },
                ],
              });
              if (impactNeedsConfirmation(impact)) return impact;
            }
            await action("saveActivity", a);
            setModal(null);
            setToast("Actividad guardada en el historial.");
          }}
          comment={async (id, body) => {
            await action("comment", { activityId: id, body });
            setToast("Comentario añadido.");
          }}
          status={status}
        />
      )}
      {modal === "filters" && project && (
        <Modal title="Filtrar actividades" close={() => setModal(null)}>
          <div className="form-grid">
            <label>
              Equipo
              <select
                value={filter.team}
                onChange={(e) => changeFilter("team", e.target.value)}
              >
                <option value="">Todos los equipos</option>
                {project.teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={filter.status}
                onChange={(e) => changeFilter("status", e.target.value)}
              >
                <option value="">Todos</option>
                <option value="completed">Completadas</option>
                <option value="open">No completadas</option>
                {states.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Persona
              <select
                value={filter.person}
                onChange={(e) => changeFilter("person", e.target.value)}
              >
                <option value="">Todas</option>
                {project.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsabilidad RACI
              <select
                value={filter.letter}
                onChange={(e) => changeFilter("letter", e.target.value)}
              >
                <option value="">Cualquiera</option>
                {["R", "A", "C", "I"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Prioridad
              <select
                value={filter.priority}
                onChange={(e) => changeFilter("priority", e.target.value)}
              >
                <option value="">Todas</option>
                {["Alta", "Media", "Baja"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Atención
              <select
                value={filter.time}
                onChange={(e) => changeFilter("time", e.target.value)}
              >
                <option value="">Todas</option>
                <option value="overdue">Vencidas</option>
                <option value="blocked">Bloqueadas</option>
                <option value="soon">Próximos 7 días</option>
              </select>
            </label>
            <label>
              Semana del proyecto
              <input
                type="number"
                min={1}
                value={filter.week}
                onChange={(e) => changeFilter("week", e.target.value)}
              />
            </label>
            <label>
              Commits asociados
              <select
                value={filter.commits}
                onChange={(e) => changeFilter("commits", e.target.value)}
              >
                <option value="">Todos</option>
                <option value="yes">Con commits</option>
                <option value="no">Sin commits</option>
              </select>
            </label>
            <label>
              Desde
              <input
                type="date"
                value={filter.from}
                onChange={(e) => changeFilter("from", e.target.value)}
              />
            </label>
            <label>
              Ruta crítica
              <select
                value={filter.critical}
                onChange={(e) => changeFilter("critical", e.target.value)}
              >
                <option value="">Todas las actividades</option>
                <option value="yes">Solo críticas</option>
              </select>
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={filter.to}
                onChange={(e) => changeFilter("to", e.target.value)}
              />
            </label>
          </div>
          <p className="form-note">
            Los filtros combinados se guardan en la URL.
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setFilter(empty)}>
              Limpiar filtros
            </button>
            <button className="primary" onClick={() => setModal(null)}>
              Ver {visible.length}{" "}
              {visible.length === 1 ? "resultado" : "resultados"}
            </button>
          </div>
        </Modal>
      )}
      {modal === "settings" && project && (
        <ProjectSettings
          project={project}
          busy={busy}
          canEdit={can(user, "project:edit", project)}
          canArchive={user.globalRole === "superuser"}
          close={() => setModal(null)}
          save={async (data) => {
            await action("saveProject", data);
            setModal(null);
            setToast("Configuración guardada.");
          }}
        />
      )}
      {modal === "project" && (
        <Modal title="Nuevo proyecto" close={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await action("createProject", {
                name: f.get("name"),
                start: f.get("start"),
                weeks: Number(f.get("weeks")),
              })
                .then(() => setModal(null))
                .catch(() => {});
            }}
          >
            <label>
              Nombre del proyecto
              <input name="name" required minLength={3} />
            </label>
            <div className="form-grid">
              <label>
                Fecha de inicio
                <input
                  type="date"
                  name="start"
                  required
                  defaultValue={today()}
                />
              </label>
              <label>
                Duración en semanas
                <input
                  type="number"
                  min={1}
                  max={104}
                  name="weeks"
                  required
                  defaultValue={8}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Crear proyecto
              </button>
            </div>
          </form>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          {toastAction?.message === toast && (
            <button className="toast-action" onClick={toastAction.run}>
              {toastAction.label}
            </button>
          )}
          <button
            aria-label="Cerrar aviso"
            onClick={() => {
              setToast("");
              setToastAction(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function download(body: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function ActivityEditor({
  apiAction,
  activity,
  project,
  user,
  busy,
  close,
  save,
  comment,
  status,
}: {
  apiAction: (name: string, data?: unknown) => Promise<any>;
  activity: Activity | null;
  project: Project;
  user: PublicUser;
  busy: boolean;
  close: () => void;
  /** Devuelve el impacto si el cambio mueve el fin del proyecto y falta confirmarlo. */
  save: (a: Activity, confirmed?: boolean) => Promise<PlanImpact | void>;
  comment: (id: string, body: string) => Promise<void>;
  status: (
    a: Activity,
    s: Activity["status"],
    reason?: string,
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Activity>(
      activity ?? {
        id: crypto.randomUUID(),
        code: "Nueva",
        title: "",
        description: "",
        teamId:
          project.members.find((m) => m.id === user.id)?.teamId ??
          project.teams[0].id,
        parentId: null,
        status: "Pendiente",
        priority: "Media",
        start: today(),
        end: today(),
        duration: 1,
        responsible: [],
        accountable: "",
        consulted: [],
        informed: [],
        blockedReason: "",
        dependencies: [],
        commits: 0,
        deletedAt: null,
      },
    ),
    [note, setNote] = useState(""),
    [localError, setLocalError] = useState(""),
    [raciQuery, setRaciQuery] = useState(""),
    [pendingImpact, setPendingImpact] = useState<PlanImpact | null>(null);
  // Cualquier edición invalida una confirmación pendiente: hay que volver a calcular el impacto.
  useEffect(() => setPendingImpact(null), [draft]);
  const edit = can(user, "activity:edit", project, draft),
    workingDays = control(project).workingDays;
  const conflicts = startConflicts(project, draft),
    earliestStart = conflicts
      .map((k) => k.required)
      .sort()
      .at(-1),
    activityCode = (id: string) =>
      project.activities.find((a) => a.id === id)?.code ?? id;
  async function submit(confirmed = false) {
    setLocalError("");
    try {
      const impact = await save(draft, confirmed);
      if (impact) setPendingImpact(impact);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }
  const patch = <K extends keyof Activity>(k: K, v: Activity[K]) =>
    setDraft((a) => ({ ...a, [k]: v }));
  // Inicio + duración definen la entrega; si se edita la entrega, se recalcula la duración.
  const changeStart = (start: string) =>
    setDraft((a) => ({
      ...a,
      start,
      end: start ? endFromDuration(start, a.duration, workingDays) : a.end,
    }));
  const changeDuration = (duration: number) =>
    setDraft((a) => ({
      ...a,
      duration,
      end:
        a.start && Number.isFinite(duration)
          ? endFromDuration(a.start, duration, workingDays)
          : a.end,
    }));
  const changeEnd = (end: string) =>
    setDraft((a) => ({
      ...a,
      end,
      duration:
        end && end >= a.start
          ? durationBetween(a.start, end, workingDays)
          : a.duration,
    }));
  const raciMatch = (name: string) =>
    !raciQuery.trim() || normalizeText(name).includes(normalizeText(raciQuery));
  const teamMembers = (teamId: string) =>
    project.members.filter((m) => m.teamId === teamId);
  return (
    <Modal
      title={
        activity
          ? `${activity.code} · Detalle de actividad`
          : "Una nueva pieza del proyecto"
      }
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await submit();
        }}
      >
        <label>
          Nombre de la actividad
          <input
            value={draft.title}
            required
            minLength={3}
            maxLength={160}
            onChange={(e) => patch("title", e.target.value)}
            disabled={!edit}
            placeholder="¿Qué necesita construir el equipo?"
          />
        </label>
        <label>
          Descripción y entregable
          <textarea
            value={draft.description}
            onChange={(e) => patch("description", e.target.value)}
            disabled={!edit}
            rows={3}
          />
        </label>
        <div className="form-grid">
          <label>
            Equipo
            <select
              value={draft.teamId}
              onChange={(e) => patch("teamId", e.target.value)}
              disabled={!edit}
            >
              {project.teams.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridad
            <select
              value={draft.priority}
              onChange={(e) =>
                patch("priority", e.target.value as Activity["priority"])
              }
              disabled={!edit}
            >
              {["Alta", "Media", "Baja"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select
              value={draft.status}
              onChange={(e) =>
                patch("status", e.target.value as Activity["status"])
              }
              disabled={!edit}
            >
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Actividad padre · WBS
            <select
              value={draft.parentId ?? ""}
              onChange={(e) => patch("parentId", e.target.value || null)}
              disabled={!edit}
            >
              <option value="">Actividad principal</option>
              {project.activities
                .filter((a) => a.id !== draft.id && !a.deletedAt)
                .sort(byCode)
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.code} · {a.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Inicio previsto
            <input
              type="date"
              required
              value={draft.start}
              onChange={(e) => changeStart(e.target.value)}
              disabled={!edit}
            />
          </label>
          <label>
            Duración · días hábiles
            <input
              type="number"
              required
              min={0}
              max={365}
              value={draft.duration}
              onChange={(e) => changeDuration(Number(e.target.value))}
              disabled={!edit}
            />
          </label>
          <label>
            Entrega prevista
            <input
              type="date"
              required
              min={draft.start}
              value={draft.end}
              onChange={(e) => changeEnd(e.target.value)}
              disabled={!edit}
            />
          </label>
        </div>
        {edit && (
          <p className="form-note">
            La entrega se calcula con el inicio y la duración en días hábiles (
            {workingDays} por semana). Si cambias la entrega, se ajusta la
            duración.
          </p>
        )}
        {edit && earliestStart && (
          <div className="dependency-warning" role="status">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>
              Empieza antes de que termine{" "}
              {conflicts.map((k) => activityCode(k.predecessorId)).join(", ")}.
              Según sus dependencias, puede empezar desde el{" "}
              {date(earliestStart)}.
            </span>
            <button
              type="button"
              className="text-btn"
              onClick={() => changeStart(earliestStart)}
            >
              Mover inicio al {date(earliestStart)}
            </button>
          </div>
        )}
        {draft.status === "Bloqueada" && (
          <label>
            Motivo del bloqueo
            <textarea
              required
              minLength={3}
              value={draft.blockedReason}
              onChange={(e) => patch("blockedReason", e.target.value)}
              disabled={!edit && !can(user, "activity:status", project, draft)}
            />
          </label>
        )}
        <ActivityExtras
          draft={draft}
          project={project}
          user={user}
          canEdit={edit}
          update={setDraft}
          action={apiAction}
          busy={busy}
        />
        <h3 className="form-section">
          Quién hace qué <span className="subtle">RACI</span>
        </h3>
        <p className={"form-note " + (!raciValid(draft) ? "warning" : "")}>
          {raciValid(draft)
            ? "Responsabilidades definidas."
            : "Asigna exactamente una persona A y al menos una R."}
        </p>
        {edit && (
          <label className="raci-search">
            Buscar persona
            <input
              type="search"
              value={raciQuery}
              onChange={(e) => setRaciQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter en el buscador no debe guardar la actividad.
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Nombre o apellido"
            />
          </label>
        )}
        <div className="form-grid">
          <label>
            A · Aprueba el entregable
            <select
              disabled={!edit}
              value={draft.accountable}
              onChange={(e) => patch("accountable", e.target.value)}
            >
              <option value="">Sin asignar</option>
              {project.teams.map((t) => (
                <optgroup key={t.id} label={t.name}>
                  {teamMembers(t.id).map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {(["responsible", "consulted", "informed"] as const).map((key, i) => (
            <fieldset key={key} disabled={!edit}>
              <legend>
                {["R · Realiza", "C · Se consulta", "I · Se informa"][i]}{" "}
                <span className="subtle">
                  · {draft[key].length}{" "}
                  {draft[key].length === 1 ? "persona" : "personas"}
                </span>
              </legend>
              <div className="raci-people">
                {project.teams.map((t) => {
                  // Las personas ya marcadas siguen visibles aunque no coincidan con la búsqueda.
                  const people = teamMembers(t.id).filter(
                    (m) => raciMatch(m.name) || draft[key].includes(m.id),
                  );
                  return people.length ? (
                    <div key={t.id} className="raci-team">
                      <span className="raci-team-name">{t.name}</span>
                      {people.map((m) => (
                        <label key={m.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={draft[key].includes(m.id)}
                            onChange={(e) =>
                              patch(
                                key,
                                e.target.checked
                                  ? [...draft[key], m.id]
                                  : draft[key].filter((id) => id !== m.id),
                              )
                            }
                          />
                          {m.name}
                        </label>
                      ))}
                    </div>
                  ) : null;
                })}
              </div>
            </fieldset>
          ))}
        </div>
        {localError && (
          <p className="form-error" role="alert">
            {localError}
          </p>
        )}
        {pendingImpact && (
          <ImpactConfirm
            impact={pendingImpact}
            busy={busy}
            confirm={() => submit(true)}
            cancel={() => setPendingImpact(null)}
          />
        )}
        <div className="modal-actions">
          {edit && activity && (
            <button
              type="button"
              className="text-btn danger"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Mover esta actividad a la papelera? El historial conservará el cambio.",
                  )
                )
                  save({ ...draft, deletedAt: new Date().toISOString() }).catch(
                    () => {},
                  );
              }}
            >
              Mover a papelera
            </button>
          )}
          <button type="button" className="secondary" onClick={close}>
            Cerrar
          </button>
          {edit && (
            <button disabled={busy} className="primary">
              {busy ? "Guardando…" : "Guardar actividad"}
            </button>
          )}
        </div>
      </form>
      {!edit && activity && can(user, "activity:status", project, activity) && (
        <div className="status-only">
          <label>
            Cambiar mi estado
            <select
              value={draft.status}
              onChange={(e) =>
                patch("status", e.target.value as Activity["status"])
              }
            >
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={
              busy ||
              (draft.status === "Bloqueada" &&
                draft.blockedReason.trim().length < 3)
            }
            onClick={() =>
              status(draft, draft.status, draft.blockedReason).then(close)
            }
          >
            Guardar estado
          </button>
        </div>
      )}
      {activity && (
        <section className="comments">
          <h3>
            <MessageSquare size={17} />
            Conversación
          </h3>
          {project.comments
            .filter((c) => c.activityId === activity.id)
            .map((c) => (
              <article key={c.id}>
                <strong>{c.author}</strong>
                <small>{new Date(c.date).toLocaleString("es-GT")}</small>
                <p>{c.body}</p>
              </article>
            ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await comment(activity.id, note)
                .then(() => setNote(""))
                .catch(() => {});
            }}
          >
            <label>
              Añade una actualización
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                maxLength={4000}
              />
            </label>
            <button className="secondary" disabled={busy}>
              Publicar comentario
            </button>
          </form>
        </section>
      )}
    </Modal>
  );
}
function ProjectSettings({
  project,
  busy,
  canEdit,
  canArchive,
  close,
  save,
}: {
  project: Project;
  busy: boolean;
  canEdit: boolean;
  canArchive: boolean;
  close: () => void;
  save: (p: unknown) => Promise<void>;
}) {
  const [draft, setDraft] = useState(project);
  const end = new Date(Date.parse(draft.start) + draft.weeks * 604800000)
    .toISOString()
    .slice(0, 10);
  const outside = project.activities.filter(
    (a) => !a.deletedAt && (a.end > end || a.start < draft.start),
  ).length;
  return (
    <Modal title="Configuración del proyecto" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await save(draft).catch(() => {});
        }}
      >
        <fieldset disabled={!canEdit}>
          <label>
            Nombre
            <input
              required
              minLength={3}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Descripción
            <textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <div className="form-grid">
            <label>
              Inicio
              <input
                type="date"
                required
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </label>
            <label>
              Duración en semanas
              <input
                type="number"
                min={1}
                max={104}
                required
                value={draft.weeks}
                onChange={(e) =>
                  setDraft({ ...draft, weeks: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Estado
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as Project["status"],
                  })
                }
              >
                <option value="planning">En planificación</option>
                <option value="active">En marcha</option>
                <option value="closed">Cerrado</option>
                <option value="archived" disabled={!canArchive}>
                  Archivado
                </option>
              </select>
            </label>
          </div>
          {outside > 0 && (
            <p className="warning form-note">
              <TriangleAlert size={15} />
              {outside} actividades quedan fuera de las fechas del proyecto.
              Puedes guardar y ajustar después.
            </p>
          )}
          <h3 className="form-section">Equipos</h3>
          {draft.teams.map((t, i) => (
            <div className="team-edit" key={t.id}>
              <input
                aria-label={"Color de " + t.name}
                type="color"
                value={t.color}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    teams: draft.teams.map((x, j) =>
                      i === j ? { ...x, color: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={"Nombre de equipo " + (i + 1)}
                minLength={2}
                required
                value={t.name}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    teams: draft.teams.map((x, j) =>
                      i === j ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cerrar
          </button>
          {canEdit && (
            <button disabled={busy} className="primary">
              Guardar configuración
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
