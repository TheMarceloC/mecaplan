import fs from "node:fs";
const file = "src/app/page.tsx";
let s = fs.readFileSync(file, "utf8");
if (s.includes("import {PhasePanel"))
  throw Error("La interfaz de Fase 1B ya está conectada.");
s = s.replace(
  "'use client';",
  "'use client';\nimport {PhasePanel,phaseTitles,type PhaseView} from '@/components/phase-panel';\nimport {PasswordGate,ActivityExtras,ControlSummary} from '@/components/activity-extras';\nimport {planning} from '@/lib/control';",
);
s = s.replace(
  "type View = 'overview' | 'tasks' | 'activities' | 'teams' | 'history' | 'admin';",
  "type View = 'overview' | 'tasks' | 'activities' | 'teams' | 'history' | 'admin' | PhaseView;",
);
s = s.replace("type Filters = {", "type Filters = {\n    critical:string;");
s = s.replace(
  "const empty: Filters = { q:",
  "const empty: Filters = {critical:'', q:",
);
s = s.replace(
  "d.projects[0]?.id ?? ''",
  "d.projects.find(p=>p.id==='digit360')?.id??d.projects[0]?.id??''",
);
s = s.replace(
  "    if (user.status === 'pending')",
  "    if(user.mustChangePassword)return <PasswordGate user={user} busy={busy} action={action}/>;\n    if (user.status === 'pending')",
);
s = s.replace(
  '<label>Correo electrónico<input name="email" type="email" required placeholder="nombre@universidad.edu" autoComplete="email"/></label>',
  "<label>{authMode==='register'?'Correo electrónico':'Correo o usuario'}<input name=\"email\" type={authMode==='register'?'email':'text'} required placeholder=\"Correo o nombre de usuario\" autoComplete={authMode==='register'?'email':'username'}/></label>",
);
s = s.replace(
  "    const activities =",
  "    const criticalIds=new Set(project?planning(project).criticalIds:[]);\n    const activities =",
);
s = s.replace(
  "if (filter.q &&",
  "if(filter.critical==='yes'&&!criticalIds.has(a.id))return false;\n        if (filter.q &&",
);
s = s.replaceAll("a.end < today()", "!a.unscheduled && a.end < today()");
s = s.replace(
  "admin: 'Administración'",
  "admin: 'Administración',...phaseTitles",
);
const oldNav =
  '<span className="nav-label next-label">PLANIFICACIÓN</span><nav><button disabled title="Disponible en la Fase 1B"><CalendarDays size={18}/>Cronograma<span className="soon">Pronto</span></button><button disabled title="Disponible en la Fase 1B"><Pulse size={18}/>Presupuesto<span className="soon">Pronto</span></button></nav>';
const newNav =
  "<span className=\"nav-label next-label\">PLANIFICACIÓN Y CONTROL</span><nav>{(Object.keys(phaseTitles) as PhaseView[]).filter(key=>key!=='evaluation'||user.isInstructor).map(key=><button key={key} className={view===key?'active':''} onClick={()=>go(key)}>{key==='planning'?<CalendarDays size={18}/>:key==='budget'?<Pulse size={18}/>:key==='evaluation'?<ShieldCheck size={18}/>:key==='context'?<Sparkles size={18}/>:<FolderKanban size={18}/>}<span>{phaseTitles[key]}</span></button>)}</nav>";
if (!s.includes(oldNav)) throw Error("No se encontró la navegación anterior.");
s = s.replace(oldNav, newNav);
s = s.replace(
  "{view === 'overview' && <>",
  "{Object.prototype.hasOwnProperty.call(phaseTitles,view)&&<PhasePanel view={view as PhaseView} project={project} user={user} busy={busy} action={action} refresh={load} rows={visible} filters={filter} changeFilter={(key,value)=>changeFilter(key as keyof Filters,value)} openFilters={()=>setModal('filters')} clearFilters={()=>setFilter(empty)}/>} {view === 'overview' && <><ControlSummary project={project}/>",
);
s = s.replaceAll(
  "<tr key={a.id}>",
  "<tr key={a.id} className={criticalIds.has(a.id)?'critical-row':''}>",
);
s = s.replace(
  'className="kanban-card" draggable=',
  "className={'kanban-card '+(criticalIds.has(a.id)?'critical-card':'')} draggable=",
);
s = s.replaceAll(
  "{date(a.end)}",
  "{a.unscheduled?'Sin planificar':date(a.end)}",
);
s = s.replace(
  '<label>Hasta<input type="date"',
  '<label>Ruta crítica<select value={filter.critical} onChange={e=>changeFilter(\'critical\',e.target.value)}><option value="">Todas las actividades</option><option value="yes">Solo críticas</option></select></label><label>Hasta<input type="date"',
);
s = s.replace(
  "Los filtros se guardan en la URL. El filtro de ruta crítica se incorpora en la Fase 1B.",
  "Los filtros combinados se guardan en la URL.",
);
s = s.replace("Commits de demostración", "Commits asociados");
s = s.replace(
  "<ActivityEditor activity={selected}",
  "<ActivityEditor apiAction={action} activity={selected}",
);
s = s.replace(
  "function ActivityEditor({ activity, project, user, busy, close, save, comment, status }:",
  "function ActivityEditor({ apiAction, activity, project, user, busy, close, save, comment, status }:",
);
s = s.replace(
  "    activity: Activity | null;",
  "    apiAction:(name:string,data?:unknown)=>Promise<any>;\n    activity: Activity | null;",
);
s = s.replace(
  '<h3 className="form-section">Quién hace qué',
  '<ActivityExtras draft={draft} project={project} user={user} canEdit={edit} update={setDraft} action={apiAction} busy={busy}/><h3 className="form-section">Quién hace qué',
);
fs.writeFileSync(file, s);
const panel = "src/components/phase-panel.tsx";
s = fs
  .readFileSync(panel, "utf8")
  .replace(
    "setPreview(result);",
    "setPreview({...result,inputKey:JSON.stringify(draftPlan)});",
  )
  .replace(
    "busy||!preview}",
    "busy||!preview||preview.inputKey!==JSON.stringify(draft)}",
  );
fs.writeFileSync(panel, s);
