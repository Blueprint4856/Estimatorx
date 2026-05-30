import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ChevronRight, Printer, RotateCcw, Trash2, Check, Plus, X, FileUp, Pencil, FolderPlus, FolderOpen, ChevronDown, Users, SlidersHorizontal } from "lucide-react";
import { InviteModal } from "@/components/InviteModal";
import { useUser, useClerk } from "@clerk/react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { PaywallModal } from "@/components/PaywallModal";
import { PlanImportModal } from "@/components/PlanImportModal";

type Tab = "sitework" | "foundation" | "wall" | "floor" | "roof" | "plumbing" | "electrical" | "hvac" | "summary";
const WASTE = 1.10;

/* ─────────────────────────────────────────────
   SHARED TYPES
───────────────────────────────────────────── */
interface MatItem { label: string; qty: number; unit: string; price: number; }
interface LaborItem { label: string; qty: number; unit: string; nationalAvg: number; }
type LaborRates = Record<string, string>;
type MatPrices = Record<string, string>;
type QtyOverrides = Record<string, string>;
function effectiveQty(item: { label: string; qty: number }, qtys: QtyOverrides): number {
  const v = parseFloat(qtys[item.label] ?? "");
  return isNaN(v) ? item.qty : Math.max(0, v);
}

function defaultMatPrices(items: MatItem[]): MatPrices {
  return Object.fromEntries(items.map(i => [i.label, String(i.price)]));
}
function effectiveMatPrice(item: MatItem, prices: MatPrices): number {
  const v = parseFloat(prices[item.label]);
  return isNaN(v) ? item.price : v;
}

interface CustomMatRow { id: string; label: string; qty: string; unit: string; price: string; }
interface CustomLaborRow { id: string; label: string; qty: string; unit: string; rate: string; }

function effectiveRate(item: LaborItem, rates: LaborRates): number {
  const v = parseFloat(rates[item.label]);
  return isNaN(v) ? item.nationalAvg : v;
}
function defaultRates(items: LaborItem[]): LaborRates {
  return Object.fromEntries(items.map(i => [i.label, String(i.nationalAvg)]));
}
function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function newId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function customMatTotal(rows: CustomMatRow[]): number {
  return rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
}
function customLaborTotal(rows: CustomLaborRow[]): number {
  return rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0), 0);
}

/* ─────────────────────────────────────────────
   PERSISTENCE & FEATURE GATE
───────────────────────────────────────────── */

const SK = {
  sitework: "ex.site", siteworkRates: "ex.site.rates", siteMatPrices: "ex.site.mprices",
  siteCMat: "ex.site.cmat", siteCLab: "ex.site.clab",
  foundation: "ex.found", foundationRates: "ex.found.rates", foundMatPrices: "ex.found.mprices",
  foundCMat: "ex.found.cmat", foundCLab: "ex.found.clab",
  wall: "ex.wall", wallRates: "ex.wall.rates", wallMatPrices: "ex.wall.mprices",
  floor: "ex.floor", floorRates: "ex.floor.rates", floorMatPrices: "ex.floor.mprices",
  roof: "ex.roof", roofRates: "ex.roof.rates", roofMatPrices: "ex.roof.mprices",
  plumbing: "ex.plumbing", plumbingRates: "ex.plumbing.rates", plumbMatPrices: "ex.plumb.mprices",
  electrical: "ex.electrical", electricalRates: "ex.electrical.rates", elecMatPrices: "ex.elec.mprices",
  hvac: "ex.hvac", hvacRates: "ex.hvac.rates", hvacMatPrices: "ex.hvac.mprices",
  wallCMat: "ex.wall.cmat", wallCLab: "ex.wall.clab",
  floorCMat: "ex.floor.cmat", floorCLab: "ex.floor.clab",
  roofCMat: "ex.roof.cmat", roofCLab: "ex.roof.clab",
  plumbCMat: "ex.plumb.cmat", plumbCLab: "ex.plumb.clab",
  elecCMat: "ex.elec.cmat", elecCLab: "ex.elec.clab",
  hvacCMat: "ex.hvac.cmat", hvacCLab: "ex.hvac.clab",
  markup: "ex.markup",
  project: "ex.project",
  siteMatQtys: "ex.site.mqtys", siteLabQtys: "ex.site.lqtys",
  foundMatQtys: "ex.found.mqtys", foundLabQtys: "ex.found.lqtys",
  wallMatQtys: "ex.wall.mqtys", wallLabQtys: "ex.wall.lqtys",
  floorMatQtys: "ex.floor.mqtys", floorLabQtys: "ex.floor.lqtys",
  roofMatQtys: "ex.roof.mqtys", roofLabQtys: "ex.roof.lqtys",
  plumbMatQtys: "ex.plumb.mqtys", plumbLabQtys: "ex.plumb.lqtys",
  elecMatQtys: "ex.elec.mqtys", elecLabQtys: "ex.elec.lqtys",
  hvacMatQtys: "ex.hvac.mqtys", hvacLabQtys: "ex.hvac.lqtys",
} as const;

/* ─────────────────────────────────────────────
   PROJECT MANAGEMENT
   Strategy: SK keys always hold the "active" project's live data.
   Snapshots are full copies of all SK keys, stored per project ID.
   Switching projects: save snapshot → load target snapshot → reload page.
───────────────────────────────────────────── */
const ALL_SK_KEYS = [...Object.values(SK), "ex.project"] as string[];
const PK = { index: "ex.projects", activePid: "ex.active.pid" } as const;

interface ProjectMeta { id: string; name: string; createdAt: number; updatedAt: number; }

function pmUid(): string { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function pmReadIndex(): ProjectMeta[] {
  try { const r = localStorage.getItem(PK.index); return r ? JSON.parse(r) as ProjectMeta[] : []; } catch { return []; }
}
function pmWriteIndex(list: ProjectMeta[]): void { try { localStorage.setItem(PK.index, JSON.stringify(list)); } catch {} }
function pmActivePid(): string | null { return localStorage.getItem(PK.activePid); }
function pmSaveSnapshot(pid: string): void {
  const snap: Record<string, string | null> = {};
  for (const key of ALL_SK_KEYS) snap[key] = localStorage.getItem(key);
  try { localStorage.setItem(`ex.snap.${pid}`, JSON.stringify(snap)); } catch {}
  const list = pmReadIndex();
  const i = list.findIndex(p => p.id === pid);
  if (i >= 0) { list[i].updatedAt = Date.now(); pmWriteIndex(list); }
}
function pmLoadSnapshot(pid: string): void {
  try {
    const raw = localStorage.getItem(`ex.snap.${pid}`);
    if (!raw) return;
    const snap = JSON.parse(raw) as Record<string, string | null>;
    for (const key of ALL_SK_KEYS) {
      const v = snap[key];
      if (v != null) { localStorage.setItem(key, v); } else { localStorage.removeItem(key); }
    }
  } catch {}
}
function pmClearSKKeys(): void { for (const key of ALL_SK_KEYS) { try { localStorage.removeItem(key); } catch {} } }
function pmEnsureInit(): string {
  const list = pmReadIndex();
  if (list.length > 0) {
    const pid = pmActivePid() ?? list[0].id;
    localStorage.setItem(PK.activePid, pid);
    return pid;
  }
  const pid = pmUid();
  const now = Date.now();
  pmWriteIndex([{ id: pid, name: "My Estimate", createdAt: now, updatedAt: now }]);
  localStorage.setItem(PK.activePid, pid);
  pmSaveSnapshot(pid);
  return pid;
}

function useLocalStorage<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValueInternal] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {}
    return defaultValue;
  });
  const setValue = useCallback((action: React.SetStateAction<T>) => {
    setValueInternal(prev => {
      const next = typeof action === "function" ? (action as (p: T) => T)(prev) : action;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [value, setValue];
}

function useTabUndo<T>(storageKey: string, defaultValue: T) {
  const [rawInputs, setRaw] = useLocalStorage<T>(storageKey, defaultValue);
  const [snapshot, setSnapshot] = useState<T | null>(null);
  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawRef = useRef<T>(rawInputs);
  rawRef.current = rawInputs;
  const setInputs: React.Dispatch<React.SetStateAction<T>> = useCallback((action) => {
    if (!activeRef.current) {
      setSnapshot(rawRef.current);
      activeRef.current = true;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { activeRef.current = false; }, 1200);
    setRaw(action);
  }, [setRaw]);
  const undo = useCallback(() => {
    if (snapshot !== null) {
      setRaw(snapshot);
      setSnapshot(null);
      activeRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
  }, [snapshot, setRaw]);
  return { rawInputs, setInputs, undo, canUndo: snapshot !== null };
}

const SELECT_CLS = "w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors";

interface ProjectInputs {
  sqft: string;
  footprintSqft: string;
  stories: string;
  buildingWidth: string;
  buildingLength: string;
  roofPitch: string;
  linearFeet: string;
}
const DEFAULT_PROJECT: ProjectInputs = {
  sqft: "", footprintSqft: "", stories: "", buildingWidth: "", buildingLength: "", roofPitch: "", linearFeet: "",
};

function useProject(): [ProjectInputs, React.Dispatch<React.SetStateAction<ProjectInputs>>] {
  const [raw, set] = useLocalStorage<ProjectInputs>(SK.project, DEFAULT_PROJECT);
  return [{ ...DEFAULT_PROJECT, ...raw }, set];
}

function ProjectBadge({ label }: { label?: string }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#E85D26]/70 mt-0.5">
      ↑ {label ?? "from project"}
    </span>
  );
}

function ProjectSetupCard() {
  const [project, setProject] = useProject();
  const [open, setOpen] = useLocalStorage<boolean>("ex.project.open", true);
  const setp = (k: keyof ProjectInputs, v: string) => setProject(prev => ({ ...prev, [k]: v }));
  const autoPerim = project.sqft ? String(Math.ceil(Math.sqrt(parseFloat(project.sqft)) * 4)) : "";
  const effectiveFp = project.footprintSqft || project.sqft;
  return (
    <div className="no-print mb-4 border border-[#E85D26]/40 bg-[#FFF8F5]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#FFF0EA] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-[#E85D26]">Project Setup</span>
          <span className="text-xs text-[#888] hidden sm:inline">Enter house details once — all tabs pick them up automatically</span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-[#AAA]">{open ? "▲ collapse" : "▼ expand"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[#E85D26]/20">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 mt-4">
            <Field label="Gross Living Area (sqft)">
              <NumberInput value={project.sqft} onChange={v => setp("sqft", v)} placeholder="e.g. 2000" />
            </Field>
            <Field label="Footprint (sqft)" note={project.sqft && !project.footprintSqft ? `Defaults to living area (${project.sqft} sqft)` : "If different from living area"}>
              <NumberInput value={project.footprintSqft} onChange={v => setp("footprintSqft", v)} placeholder={project.sqft || "e.g. 2000"} />
            </Field>
            <Field label="Exterior Perimeter (LF)" note={autoPerim && !project.linearFeet ? `Auto: ~${autoPerim} LF` : "Total ext. wall linear feet"}>
              <NumberInput value={project.linearFeet} onChange={v => setp("linearFeet", v)} placeholder={autoPerim || "e.g. 180"} />
            </Field>
            <Field label="Stories">
              <select value={project.stories} onChange={e => setp("stories", e.target.value)} className={SELECT_CLS}>
                <option value="">— not set —</option>
                <option value="1">1 story</option>
                <option value="2">2 stories</option>
              </select>
            </Field>
            <Field label="Building Width (ft)" note="Narrow dimension (truss/rafter span)">
              <NumberInput value={project.buildingWidth} onChange={v => setp("buildingWidth", v)} placeholder="e.g. 28" />
            </Field>
            <Field label="Building Length (ft)" note="Long dimension">
              <NumberInput value={project.buildingLength} onChange={v => setp("buildingLength", v)} placeholder="e.g. 48" />
            </Field>
            <Field label="Roof Pitch">
              <select value={project.roofPitch} onChange={e => setp("roofPitch", e.target.value)} className={SELECT_CLS}>
                <option value="">— not set —</option>
                {["2:12","4:12","5:12","6:12","7:12","8:12","9:12","10:12","12:12"].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
          {effectiveFp && (
            <p className="mt-3 text-[11px] text-[#AAA]">
              {project.sqft && `${parseFloat(project.sqft).toLocaleString()} sqft`}
              {project.stories && ` · ${project.stories}-story`}
              {project.linearFeet ? ` · ${project.linearFeet} LF perimeter` : autoPerim ? ` · ~${autoPerim} LF (auto)` : ""}
              {project.buildingWidth && project.buildingLength && ` · ${project.buildingWidth}′ × ${project.buildingLength}′`}
              {project.roofPitch && ` · ${project.roofPitch} pitch`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Feature gate — backed by SubscriptionContext ───────────────────────────
type GatedFeature = "print" | "cci";
function useFeatureAccess(feature: GatedFeature): { allowed: boolean } {
  const { isXPlan } = useSubscription();
  if (feature === "print") return { allowed: isXPlan };
  if (feature === "cci")   return { allowed: isXPlan };
  return { allowed: false };
}

// ── URL state helpers ──────────────────────────────────────────────────────
export function readAllLocalStorage() {
  const get = <T,>(key: string): T | undefined => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : undefined; }
    catch { return undefined; }
  };
  return {
    sitework: get(SK.sitework), siteworkRates: get(SK.siteworkRates), siteMatPrices: get(SK.siteMatPrices),
    siteCMat: get(SK.siteCMat), siteCLab: get(SK.siteCLab),
    foundation: get(SK.foundation), foundationRates: get(SK.foundationRates), foundMatPrices: get(SK.foundMatPrices),
    foundCMat: get(SK.foundCMat), foundCLab: get(SK.foundCLab),
    wall: get(SK.wall), wallRates: get(SK.wallRates),
    floor: get(SK.floor), floorRates: get(SK.floorRates),
    roof: get(SK.roof), roofRates: get(SK.roofRates),
    plumbing: get(SK.plumbing), plumbingRates: get(SK.plumbingRates),
    electrical: get(SK.electrical), electricalRates: get(SK.electricalRates),
    hvac: get(SK.hvac), hvacRates: get(SK.hvacRates),
    wallCMat: get(SK.wallCMat), wallCLab: get(SK.wallCLab),
    floorCMat: get(SK.floorCMat), floorCLab: get(SK.floorCLab),
    roofCMat: get(SK.roofCMat), roofCLab: get(SK.roofCLab),
    plumbCMat: get(SK.plumbCMat), plumbCLab: get(SK.plumbCLab),
    elecCMat: get(SK.elecCMat), elecCLab: get(SK.elecCLab),
    hvacCMat: get(SK.hvacCMat), hvacCLab: get(SK.hvacCLab),
    markup: get(SK.markup),
    siteMatQtys: get(SK.siteMatQtys), siteLabQtys: get(SK.siteLabQtys),
    foundMatQtys: get(SK.foundMatQtys), foundLabQtys: get(SK.foundLabQtys),
    wallMatQtys: get(SK.wallMatQtys), wallLabQtys: get(SK.wallLabQtys),
    floorMatQtys: get(SK.floorMatQtys), floorLabQtys: get(SK.floorLabQtys),
    roofMatQtys: get(SK.roofMatQtys), roofLabQtys: get(SK.roofLabQtys),
    plumbMatQtys: get(SK.plumbMatQtys), plumbLabQtys: get(SK.plumbLabQtys),
    elecMatQtys: get(SK.elecMatQtys), elecLabQtys: get(SK.elecLabQtys),
    hvacMatQtys: get(SK.hvacMatQtys), hvacLabQtys: get(SK.hvacLabQtys),
    project: get(SK.project),
  };
}

type SnapshotState = ReturnType<typeof readAllLocalStorage>;

export function serializeState(state: SnapshotState): string {
  try { return btoa(encodeURIComponent(JSON.stringify(state))); } catch { return ""; }
}
export function deserializeState(encoded: string): SnapshotState | null {
  try { return JSON.parse(decodeURIComponent(atob(encoded))) as SnapshotState; } catch { return null; }
}
export function primeLocalStorageFromSnapshot(state: SnapshotState) {
  const set = (key: string, val: unknown) => {
    if (val != null) try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  };
  set(SK.sitework, state.sitework);     set(SK.siteworkRates, state.siteworkRates); set(SK.siteMatPrices, state.siteMatPrices);
  set(SK.siteCMat, state.siteCMat);     set(SK.siteCLab, state.siteCLab);
  set(SK.foundation, state.foundation); set(SK.foundationRates, state.foundationRates); set(SK.foundMatPrices, state.foundMatPrices);
  set(SK.foundCMat, state.foundCMat);   set(SK.foundCLab, state.foundCLab);
  set(SK.wall, state.wall);             set(SK.wallRates, state.wallRates);
  set(SK.floor, state.floor);           set(SK.floorRates, state.floorRates);
  set(SK.roof, state.roof);             set(SK.roofRates, state.roofRates);
  set(SK.plumbing, state.plumbing);     set(SK.plumbingRates, state.plumbingRates);
  set(SK.electrical, state.electrical); set(SK.electricalRates, state.electricalRates);
  set(SK.hvac, state.hvac);             set(SK.hvacRates, state.hvacRates);
  set(SK.wallCMat, state.wallCMat);     set(SK.wallCLab, state.wallCLab);
  set(SK.floorCMat, state.floorCMat);   set(SK.floorCLab, state.floorCLab);
  set(SK.roofCMat, state.roofCMat);     set(SK.roofCLab, state.roofCLab);
  set(SK.plumbCMat, state.plumbCMat);   set(SK.plumbCLab, state.plumbCLab);
  set(SK.elecCMat, state.elecCMat);     set(SK.elecCLab, state.elecCLab);
  set(SK.hvacCMat, state.hvacCMat);     set(SK.hvacCLab, state.hvacCLab);
  set(SK.markup, state.markup);
  set(SK.siteMatQtys, state.siteMatQtys); set(SK.siteLabQtys, state.siteLabQtys);
  set(SK.foundMatQtys, state.foundMatQtys); set(SK.foundLabQtys, state.foundLabQtys);
  set(SK.wallMatQtys, state.wallMatQtys); set(SK.wallLabQtys, state.wallLabQtys);
  set(SK.floorMatQtys, state.floorMatQtys); set(SK.floorLabQtys, state.floorLabQtys);
  set(SK.roofMatQtys, state.roofMatQtys); set(SK.roofLabQtys, state.roofLabQtys);
  set(SK.plumbMatQtys, state.plumbMatQtys); set(SK.plumbLabQtys, state.plumbLabQtys);
  set(SK.elecMatQtys, state.elecMatQtys); set(SK.elecLabQtys, state.elecLabQtys);
  set(SK.hvacMatQtys, state.hvacMatQtys); set(SK.hvacLabQtys, state.hvacLabQtys);
  set(SK.project, state.project);
}
function clearAllLocalStorage() {
  Object.values(SK).forEach(k => { try { localStorage.removeItem(k); } catch {} });
}

/* ─────────────────────────────────────────────
   PROJECT SWITCHER
───────────────────────────────────────────── */
interface ProjectSwitcherProps { isXPlan: boolean; onUpgrade: () => void; }

function ProjectSwitcher({ isXPlan, onUpgrade }: ProjectSwitcherProps) {
  const [projects, setProjects] = useState<ProjectMeta[]>(() => { pmEnsureInit(); return pmReadIndex(); });
  const [activePid, setActivePid] = useState<string>(() => pmActivePid() ?? "");
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = projects.find(p => p.id === activePid) ?? projects[0];

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function switchTo(pid: string) {
    if (pid === activePid) { setOpen(false); return; }
    pmSaveSnapshot(activePid);
    pmLoadSnapshot(pid);
    localStorage.setItem(PK.activePid, pid);
    window.location.reload();
  }

  function handleNew() {
    if (!isXPlan && projects.length >= 1) { onUpgrade(); setOpen(false); return; }
    const pid = pmUid();
    const now = Date.now();
    const name = `Estimate ${projects.length + 1}`;
    const newList = [...projects, { id: pid, name, createdAt: now, updatedAt: now }];
    pmSaveSnapshot(activePid);
    pmClearSKKeys();
    pmWriteIndex(newList);
    localStorage.setItem(PK.activePid, pid);
    pmSaveSnapshot(pid);
    window.location.reload();
  }

  function startRename() {
    setNameInput(active?.name ?? "");
    setRenaming(true);
    setOpen(false);
    setTimeout(() => inputRef.current?.select(), 30);
  }

  function commitRename() {
    const name = nameInput.trim();
    if (!name || !active) { setRenaming(false); return; }
    const list = pmReadIndex();
    const i = list.findIndex(p => p.id === activePid);
    if (i >= 0) { list[i].name = name; list[i].updatedAt = Date.now(); pmWriteIndex(list); setProjects([...list]); }
    setRenaming(false);
  }

  function handleDelete(pid: string) {
    if (projects.length <= 1) return;
    const newList = projects.filter(p => p.id !== pid);
    pmWriteIndex(newList);
    try { localStorage.removeItem(`ex.snap.${pid}`); } catch {}
    if (pid === activePid) {
      const newPid = newList[0].id;
      pmLoadSnapshot(newPid);
      localStorage.setItem(PK.activePid, newPid);
      setActivePid(newPid);
      window.location.reload();
    } else {
      setProjects(newList);
      setOpen(false);
    }
  }

  return (
    <div className="mt-5 flex items-center gap-2 no-print">
      {renaming ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
            className="bg-transparent border-b border-[#E85D26] text-white text-base font-bold focus:outline-none min-w-[12rem] max-w-xs"
            maxLength={60}
          />
          <button onClick={commitRename} className="text-xs text-[#E85D26] font-semibold uppercase tracking-widest hover:text-white transition-colors">Save</button>
          <button onClick={() => setRenaming(false)} className="text-xs text-[#555] hover:text-white transition-colors">Cancel</button>
        </div>
      ) : (
        <div ref={dropRef} className="relative flex items-center gap-2">
          <FolderOpen size={15} className="text-[#E85D26] flex-shrink-0" />
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 text-white hover:text-[#E85D26] transition-colors"
          >
            <span className="font-bold text-base leading-none">{active?.name ?? "My Estimate"}</span>
            <ChevronDown size={13} className={`text-[#666] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
          </button>
          <button onClick={startRename} title="Rename estimate" className="text-[#555] hover:text-[#E85D26] transition-colors ml-1">
            <Pencil size={13} />
          </button>

          {open && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-[#DDD8D0] shadow-xl z-50 py-1">
              {projects.map(p => (
                <div key={p.id} className="flex items-center group">
                  <button
                    onClick={() => switchTo(p.id)}
                    className={`flex-1 text-left px-4 py-2.5 text-sm transition-colors ${p.id === activePid ? "font-bold text-[#E85D26] bg-[#FFF8F5]" : "text-[#333] hover:bg-[#FAF8F5]"}`}
                  >
                    {p.name}
                    {p.id === activePid && <span className="ml-2 text-[9px] font-normal uppercase tracking-widest opacity-60">active</span>}
                  </button>
                  {projects.length > 1 && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="px-3 py-2.5 text-[#CCC] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete estimate"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              <div className="border-t border-[#EEE] mt-1 pt-1">
                <button
                  onClick={startRename}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[#555] hover:bg-[#FAF8F5] transition-colors"
                >
                  <Pencil size={12} />
                  Rename this estimate
                </button>
                <button
                  onClick={handleNew}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-semibold text-[#1A1A1A] hover:bg-[#FFF8F5] hover:text-[#E85D26] transition-colors"
                >
                  <FolderPlus size={12} />
                  New estimate
                  {!isXPlan && <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-[#E85D26]">X Plan</span>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SHARED UI COMPONENTS
───────────────────────────────────────────── */
function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-widest text-[#777] mb-1.5">{label}</label>
      {children}
      {note && <p className="text-xs text-[#AAA] mt-1">{note}</p>}
    </div>
  );
}
function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors" />
  );
}
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)} className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${checked ? "bg-[#E85D26]" : "bg-[#DDD8D0]"}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? "left-5" : "left-1"}`} />
      </div>
      <span className="text-sm font-medium text-[#444]">{label}</span>
    </label>
  );
}
function Stepper({ label, value, onChange, min = 0, max = 10, note }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; note?: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-[#777] mb-2">{label}</div>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          className="w-10 h-10 flex items-center justify-center bg-[#F0EDE8] border border-[#DDD8D0] text-[#555] hover:bg-[#E85D26] hover:text-white hover:border-[#E85D26] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xl font-bold leading-none">−</button>
        <span className="text-2xl font-black text-[#1A1A1A] w-8 text-center tabular-nums">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          className="w-10 h-10 flex items-center justify-center bg-[#F0EDE8] border border-[#DDD8D0] text-[#555] hover:bg-[#E85D26] hover:text-white hover:border-[#E85D26] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xl font-bold leading-none">+</button>
      </div>
      {note && <p className="text-xs text-[#AAA] mt-1">{note}</p>}
    </div>
  );
}
function CheckCard({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div role="checkbox" aria-checked={checked} tabIndex={0}
      className={`flex items-start gap-3 p-4 border-2 cursor-pointer transition-all select-none ${checked ? "border-[#E85D26] bg-[#FFF8F5]" : "border-[#DDD8D0] bg-white hover:border-[#E85D26]/40"}`}
      onClick={() => onChange(!checked)} onKeyDown={e => (e.key === " " || e.key === "Enter") && onChange(!checked)}>
      <div className={`mt-0.5 w-5 h-5 flex-shrink-0 flex items-center justify-center border-2 transition-colors ${checked ? "bg-[#E85D26] border-[#E85D26]" : "border-[#CCC]"}`}>
        {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <div>
        <div className="font-semibold text-[#1A1A1A] text-sm">{label}</div>
        {description && <div className="text-xs text-[#999] mt-0.5">{description}</div>}
      </div>
    </div>
  );
}
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:col-span-2 bg-[#FAF8F5] border border-[#DDD8D0] px-5 py-3 text-sm text-[#555] flex items-start gap-3">
      <span className="text-[#E85D26] font-black mt-0.5 flex-shrink-0">i</span>
      <div>{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   RESULTS COMPONENTS
───────────────────────────────────────────── */
function MaterialsTable({ rows, prices, onPriceChange, qtys, onQtyChange, onReset }: {
  rows: MatItem[];
  prices: MatPrices;
  onPriceChange: (label: string, val: string) => void;
  qtys: QtyOverrides;
  onQtyChange: (label: string, val: string) => void;
  onReset: () => void;
}) {
  const total = rows.reduce((s, r) => s + effectiveQty(r, qtys) * effectiveMatPrice(r, prices), 0);
  return (
    <div className="border border-[#DDD8D0] overflow-hidden">
      <div className="bg-[#2C2825] text-white px-4 md:px-6 py-3 flex justify-between items-center">
        <span className="font-bold uppercase tracking-widest text-xs">Materials</span>
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={onReset} className="no-print flex items-center gap-1.5 text-xs text-white/50 hover:text-[#E85D26] transition-colors">
            <RotateCcw size={11} /><span className="hidden sm:inline"> Reset prices & qtys</span>
          </button>
          <span className="text-[#E85D26] font-black text-base">${fmt(total)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[540px]">
        <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
          <tr>
            <th className="text-left px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Item</th>
            <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Qty</th>
            <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Unit</th>
            <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Unit $</th>
            <th className="text-right px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F0EDE8]">
          {rows.map((r, i) => {
            const ep = effectiveMatPrice(r, prices);
            const eq = effectiveQty(r, qtys);
            const priceChanged = parseFloat(prices[r.label]) !== r.price;
            const qtyChanged = qtys[r.label] !== undefined && parseFloat(qtys[r.label]) !== r.qty;
            return (
              <tr key={i} className="hover:bg-[#FAF8F5]">
                <td className="px-5 py-2.5 text-[#1A1A1A] font-medium">
                  <div>{r.label}</div>
                  {priceChanged && <div className="text-[10px] text-[#999]">Default: ${r.price.toFixed(2)}/{r.unit}</div>}
                  {qtyChanged && <div className="text-[10px] text-[#999]">Calc&apos;d qty: {r.qty.toLocaleString()}</div>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <input type="number" min="0" step="1"
                    value={qtys[r.label] ?? String(r.qty)}
                    onChange={e => onQtyChange(r.label, e.target.value)}
                    className={`no-print w-20 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${qtyChanged ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`} />
                  <span className={`print-qty-display hidden text-sm ${qtyChanged ? "text-[#E85D26] font-semibold" : "text-[#555]"}`}>{eq.toLocaleString()}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-[#999]">{r.unit}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[#999] text-xs">$</span>
                    <input type="number" min="0" step="0.01"
                      value={prices[r.label] ?? String(r.price)}
                      onChange={e => onPriceChange(r.label, e.target.value)}
                      className={`no-print w-24 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${priceChanged ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`} />
                    <span className={`print-rate-display hidden text-sm ${priceChanged ? "text-[#E85D26] font-semibold" : "text-[#555]"}`}>${fmt(ep)}</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right font-semibold text-[#1A1A1A]">${fmt(eq * ep)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="px-5 py-2.5 bg-[#FAF8F5] border-t border-[#DDD8D0] text-[10px] text-[#AAA]">
        Unit prices are national averages. Edit any price or quantity above to match your local conditions.
      </div>
    </div>
  );
}

function CustomMatRows({ items, onChange }: { items: CustomMatRow[]; onChange: (v: CustomMatRow[]) => void }) {
  const add = () => onChange([...items, { id: newId(), label: "", qty: "1", unit: "ea", price: "0" }]);
  const remove = (id: string) => onChange(items.filter(r => r.id !== id));
  const update = (id: string, field: keyof Omit<CustomMatRow, "id">, val: string) =>
    onChange(items.map(r => r.id === id ? { ...r, [field]: val } : r));
  const total = customMatTotal(items);
  return (
    <div className="border border-[#DDD8D0] border-t-0 overflow-hidden">
      {items.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-[#FAF8F5] border-b border-[#DDD8D0]">
            <tr>
              <th className="text-left px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Custom Item</th>
              <th className="text-right px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Qty</th>
              <th className="text-right px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Unit</th>
              <th className="text-right px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Unit $</th>
              <th className="text-right px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EDE8]">
            {items.map(r => {
              const line = (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0);
              return (
                <tr key={r.id} className="bg-[#FFFDF9] hover:bg-[#FFF8F0]">
                  <td className="px-4 py-2">
                    <input value={r.label} onChange={e => update(r.id, "label", e.target.value)} placeholder="Item description"
                      className="w-full bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm text-[#1A1A1A]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={r.qty} onChange={e => update(r.id, "qty", e.target.value)}
                      className="w-16 text-right bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input value={r.unit} onChange={e => update(r.id, "unit", e.target.value)} placeholder="ea"
                      className="w-12 text-right bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm text-[#999]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-[#999] text-xs">$</span>
                      <input type="number" min="0" step="0.01" value={r.price} onChange={e => update(r.id, "price", e.target.value)}
                        className="w-20 text-right bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm" />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <span className="font-semibold text-[#1A1A1A] text-sm">${fmt(line)}</span>
                      <button onClick={() => remove(r.id)} className="no-print text-[#CCC] hover:text-red-400 transition-colors"><X size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      <div className="flex items-center justify-between px-5 py-2 bg-[#FAF8F5] border-t border-[#DDD8D0]">
        <button onClick={add} className="no-print flex items-center gap-1.5 text-xs text-[#888] hover:text-[#E85D26] transition-colors font-medium">
          <Plus size={12} /> Add custom material item
        </button>
        {items.length > 0 && <span className="text-xs text-[#888]">Custom subtotal: <strong className="text-[#1A1A1A]">${fmt(total)}</strong></span>}
      </div>
    </div>
  );
}

function CustomLaborRows({ items, onChange }: { items: CustomLaborRow[]; onChange: (v: CustomLaborRow[]) => void }) {
  const add = () => onChange([...items, { id: newId(), label: "", qty: "1", unit: "ea", rate: "0" }]);
  const remove = (id: string) => onChange(items.filter(r => r.id !== id));
  const update = (id: string, field: keyof Omit<CustomLaborRow, "id">, val: string) =>
    onChange(items.map(r => r.id === id ? { ...r, [field]: val } : r));
  const total = customLaborTotal(items);
  return (
    <div className="border border-[#DDD8D0] border-t-0 overflow-hidden">
      {items.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-[#FAF8F5] border-b border-[#DDD8D0]">
            <tr>
              <th className="text-left px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Custom Task</th>
              <th className="text-right px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Qty</th>
              <th className="text-right px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Unit</th>
              <th className="text-right px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Rate/Unit</th>
              <th className="text-right px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#AAA]">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EDE8]">
            {items.map(r => {
              const line = (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0);
              return (
                <tr key={r.id} className="bg-[#FFFDF9] hover:bg-[#FFF8F0]">
                  <td className="px-4 py-2">
                    <input value={r.label} onChange={e => update(r.id, "label", e.target.value)} placeholder="Task description"
                      className="w-full bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm text-[#1A1A1A]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={r.qty} onChange={e => update(r.id, "qty", e.target.value)}
                      className="w-16 text-right bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input value={r.unit} onChange={e => update(r.id, "unit", e.target.value)} placeholder="ea"
                      className="w-12 text-right bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm text-[#999]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-[#999] text-xs">$</span>
                      <input type="number" min="0" step="0.01" value={r.rate} onChange={e => update(r.id, "rate", e.target.value)}
                        className="w-20 text-right bg-transparent border-b border-dashed border-[#DDD] focus:outline-none focus:border-[#E85D26] text-sm" />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <span className="font-semibold text-[#1A1A1A] text-sm">${fmt(line)}</span>
                      <button onClick={() => remove(r.id)} className="no-print text-[#CCC] hover:text-red-400 transition-colors"><X size={13} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      <div className="flex items-center justify-between px-5 py-2 bg-[#FAF8F5] border-t border-[#DDD8D0]">
        <button onClick={add} className="no-print flex items-center gap-1.5 text-xs text-[#888] hover:text-[#E85D26] transition-colors font-medium">
          <Plus size={12} /> Add custom labor item
        </button>
        {items.length > 0 && <span className="text-xs text-[#888]">Custom subtotal: <strong className="text-[#1A1A1A]">${fmt(total)}</strong></span>}
      </div>
    </div>
  );
}

function LaborTable({ items, rates, onChange, qtys, onQtyChange, onReset }: { items: LaborItem[]; rates: LaborRates; onChange: (l: string, v: string) => void; qtys: QtyOverrides; onQtyChange: (l: string, v: string) => void; onReset: () => void; }) {
  const total = items.reduce((s, i) => s + effectiveQty(i, qtys) * effectiveRate(i, rates), 0);
  return (
    <div className="border border-[#DDD8D0] overflow-hidden">
      <div className="bg-[#1A1A1A] text-white px-4 md:px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="font-bold uppercase tracking-widest text-xs">Labor</span>
          <span className="text-[10px] bg-[#E85D26]/20 text-[#E85D26] border border-[#E85D26]/30 px-2 py-0.5 uppercase tracking-wider font-bold hidden sm:inline">RSMeans National Avg</span>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={onReset} className="no-print flex items-center gap-1.5 text-xs text-white/50 hover:text-[#E85D26] transition-colors">
            <RotateCcw size={11} /><span className="hidden sm:inline"> Reset rates & qtys</span>
          </button>
          <span className="text-[#E85D26] font-black text-base">${fmt(total)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[540px]">
        <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
          <tr>
            <th className="text-left px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Task</th>
            <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Qty</th>
            <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Unit</th>
            <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Rate/Unit</th>
            <th className="text-right px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#777]">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F0EDE8]">
          {items.map((item, i) => {
            const rate = effectiveRate(item, rates);
            const eq = effectiveQty(item, qtys);
            const saved = rates[item.label];
            const rateChanged = saved !== undefined && parseFloat(saved) !== item.nationalAvg;
            const qtyChanged = qtys[item.label] !== undefined && parseFloat(qtys[item.label]) !== item.qty;
            return (
              <tr key={i} className="hover:bg-[#FAF8F5]">
                <td className="px-5 py-2 text-[#1A1A1A] font-medium">
                  <div>{item.label}</div>
                  {rateChanged && <div className="text-[10px] text-[#999]">Nat&apos;l avg: ${item.nationalAvg.toFixed(2)}/{item.unit}</div>}
                  {qtyChanged && <div className="text-[10px] text-[#999]">Calc&apos;d qty: {item.qty.toLocaleString()}</div>}
                </td>
                <td className="px-3 py-2 text-right">
                  <input type="number" min="0" step="1"
                    value={qtys[item.label] ?? String(item.qty)}
                    onChange={e => onQtyChange(item.label, e.target.value)}
                    className={`no-print w-20 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${qtyChanged ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`} />
                  <span className={`print-qty-display hidden text-sm ${qtyChanged ? "text-[#E85D26] font-semibold" : "text-[#555]"}`}>{eq.toLocaleString()}</span>
                </td>
                <td className="px-3 py-2 text-right text-[#999]">{item.unit}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[#999] text-xs">$</span>
                    <input type="number" min="0" step="0.01"
                      value={rates[item.label] ?? String(item.nationalAvg)}
                      onChange={e => onChange(item.label, e.target.value)}
                      className={`no-print w-24 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${rateChanged ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`} />
                    <span className={`print-rate-display hidden text-sm ${rateChanged ? "text-[#E85D26] font-semibold" : "text-[#555]"}`}>${fmt(rate)}</span>
                  </div>
                </td>
                <td className="px-5 py-2 text-right font-semibold text-[#1A1A1A]">${fmt(eq * rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="px-5 py-2.5 bg-[#FAF8F5] border-t border-[#DDD8D0] text-[10px] text-[#AAA]">
        Rates are RSMeans national averages. Edit any rate or quantity above to match your region or trade costs.
      </div>
    </div>
  );
}

function GrandTotal({ matTotal, laborTotal }: { matTotal: number; laborTotal: number }) {
  return (
    <div className="bg-[#E85D26] text-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex gap-8">
        <div>
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-75 mb-0.5">Materials</div>
          <div className="font-black text-lg">${fmt(matTotal)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-75 mb-0.5">Labor</div>
          <div className="font-black text-lg">${fmt(laborTotal)}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] uppercase tracking-widest font-bold opacity-75 mb-0.5">Estimated Total</div>
        <div className="font-black text-3xl">${fmt(matTotal + laborTotal)}</div>
      </div>
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#BBB]">{text}</div>;
}
function ResultNote() {
  return <p className="text-[10px] text-[#AAA]">Includes 10% material waste factor. Labor rates are RSMeans national averages — edit above. Delivery, permits, equipment rental, and tax not included.</p>;
}
function UndoBtn({ onUndo }: { onUndo: () => void }) {
  return (
    <button onClick={onUndo} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E85D26] border border-[#E85D26]/40 bg-[#E85D26]/5 px-2.5 py-1 rounded hover:bg-[#E85D26]/10 transition-colors no-print">
      <RotateCcw size={11} />Undo last change
    </button>
  );
}

/* ─────────────────────────────────────────────
   SITE WORK TAB
───────────────────────────────────────────── */
type DrivewaySurface = "gravel" | "asphalt" | "concrete";
type SepticType = "gravity" | "mound";

interface SiteWorkInputs {
  lotSqft: string;
  footprintSqft: string;
  cutDepthIn: string;
  drivewayLength: string;
  drivewayWidth: string;
  drivewaySurface: DrivewaySurface;
  includeDriveway: boolean;
  // material sourcing
  topsoilHauledIn: boolean;
  backfillHauledIn: boolean;
  // utilities
  hasMunicipalWater: boolean;
  hasMunicipalSewer: boolean;
  wellDepthFt: string;
  septicBedrooms: string;
  septicType: SepticType;
}

const DEFAULT_SITEWORK: SiteWorkInputs = {
  lotSqft: "",
  footprintSqft: "",
  cutDepthIn: "6",
  drivewayLength: "",
  drivewayWidth: "12",
  drivewaySurface: "asphalt",
  includeDriveway: true,
  topsoilHauledIn: true,
  backfillHauledIn: false,
  hasMunicipalWater: true,
  hasMunicipalSewer: true,
  wellDepthFt: "200",
  septicBedrooms: "3",
  septicType: "gravity",
};

function septicTankSpec(br: number): { label: string; price: number } {
  if (br <= 2) return { label: "Precast Concrete Septic Tank — 1,000 gal", price: 2950 };
  if (br === 3) return { label: "Precast Concrete Septic Tank — 1,250 gal", price: 3450 };
  if (br === 4) return { label: "Precast Concrete Septic Tank — 1,500 gal", price: 4150 };
  return { label: "Precast Concrete Septic Tank — 2,000 gal", price: 5250 };
}

function getSiteWorkMatItems(inputs: SiteWorkInputs): MatItem[] {
  const lot = parseFloat(inputs.lotSqft) || 0;
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const cut = parseFloat(inputs.cutDepthIn) || 6;
  const driveLF = parseFloat(inputs.drivewayLength) || 0;
  const driveW = parseFloat(inputs.drivewayWidth) || 12;
  const driveSqft = driveLF * driveW;
  const lotPerim = lot > 0 ? Math.ceil(Math.sqrt(lot) * 4) : 0;
  const fpPerim = fp > 0 ? Math.ceil(Math.sqrt(fp) * 4) : 0;
  const backfillCY = fp > 0 ? Math.ceil(fpPerim * (cut / 12) * 2 / 27 * WASTE) : 0;
  const wellDepth = parseFloat(inputs.wellDepthFt) || 0;
  const bedrooms = Math.max(1, parseInt(inputs.septicBedrooms) || 3);
  const fieldLF = bedrooms * 75;
  const moundCY = inputs.septicType === "mound" ? Math.ceil(fieldLF * 15 * 2 / 27) : 0;
  const tank = septicTankSpec(bedrooms);

  const items: MatItem[] = [];

  // ── Grading & earthwork ──
  if (lot > 0) {
    items.push({ label: "Silt Fence — Erosion Control", qty: lotPerim, unit: "LF", price: 2.15 });
    if (inputs.topsoilHauledIn) {
      items.push({ label: "Topsoil Import — 4\" finish layer", qty: Math.ceil(lot * (4 / 12) / 27), unit: "CY", price: 52 });
    }
  }
  if (fp > 0 && cut > 0) {
    items.push({ label: "Haul-off Disposal (excavated material)", qty: Math.ceil(fp * (cut / 12) / 27 * 1.25), unit: "CY", price: 28 });
    if (inputs.backfillHauledIn && backfillCY > 0) {
      items.push({ label: "Foundation Backfill Sand — imported clean fill", qty: backfillCY, unit: "CY", price: 42 });
    }
  }

  // ── Driveway ──
  if (inputs.includeDriveway && driveSqft > 0) {
    items.push({ label: "Driveway Aggregate Base (6\")", qty: Math.ceil(driveSqft * (6 / 12) / 27), unit: "CY", price: 48 });
    if (inputs.drivewaySurface === "gravel") {
      items.push({ label: "Driveway Gravel Surface (4\")", qty: Math.ceil(driveSqft * (4 / 12) / 27), unit: "CY", price: 52 });
    } else if (inputs.drivewaySurface === "asphalt") {
      items.push({ label: "Asphalt — 3\" Compacted", qty: Math.ceil(driveSqft * (3 / 12) / 27 * 2.025), unit: "ton", price: 115 });
      items.push({ label: "Asphalt Tack Coat", qty: driveSqft, unit: "sqft", price: 0.12 });
    } else {
      items.push({ label: "Ready-Mix Concrete — Driveway (4\")", qty: Math.ceil(driveSqft * (4 / 12) / 27), unit: "CY", price: 198 });
      items.push({ label: "Wire Mesh Reinforcement (6×6 W1.4)", qty: Math.ceil(driveSqft * WASTE / 30), unit: "roll", price: 78 });
      items.push({ label: "Expansion Joint Material", qty: Math.ceil(driveLF / 20), unit: "ea", price: 15 });
    }
  }

  // ── Well ──
  if (!inputs.hasMunicipalWater && wellDepth > 0) {
    items.push({ label: "Well Casing & Grouting Materials (per LF)", qty: wellDepth, unit: "LF", price: 18.50 });
    items.push({ label: "Submersible Well Pump (1 HP)", qty: 1, unit: "ea", price: 1485 });
    items.push({ label: "Pressure Tank (34 gal)", qty: 1, unit: "ea", price: 545 });
    items.push({ label: "Pitless Adapter & Well Cap", qty: 1, unit: "ea", price: 225 });
    items.push({ label: "1\" Poly Water Supply Line to House", qty: 100, unit: "LF", price: 1.85 });
  }

  // ── Septic ──
  if (!inputs.hasMunicipalSewer) {
    items.push({ label: tank.label, qty: 1, unit: "ea", price: tank.price });
    items.push({ label: "Distribution Box (D-box)", qty: 1, unit: "ea", price: 225 });
    items.push({ label: "4\" Perforated PVC Drain Pipe — Leach Field", qty: fieldLF, unit: "LF", price: 2.25 });
    items.push({ label: "#57 Stone Septic Media", qty: Math.ceil(fieldLF * 1.5 / 27), unit: "CY", price: 58 });
    items.push({ label: "Geotextile Filter Fabric", qty: Math.ceil(fieldLF * 3 * WASTE), unit: "sqft", price: 0.42 });
    items.push({ label: "Inspection Ports", qty: 2, unit: "ea", price: 55 });
    if (inputs.septicType === "mound" && moundCY > 0) {
      items.push({ label: "Certified Septic Sand — Mound Fill (env. grade, imported)", qty: moundCY, unit: "CY", price: 52 });
    } else {
      // Conventional / at-grade trench: 6" sand bed in a 24"-wide trench under the perforated pipe
      const trenchSandCY = Math.ceil(fieldLF * (24 / 12) * (6 / 12) / 27);
      items.push({ label: "Certified Septic Sand — Leach Field Bed (env. grade, 6\" in trench)", qty: trenchSandCY, unit: "CY", price: 52 });
    }
  }

  return items;
}

function getSiteWorkLaborItems(inputs: SiteWorkInputs): LaborItem[] {
  const lot = parseFloat(inputs.lotSqft) || 0;
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const cut = parseFloat(inputs.cutDepthIn) || 6;
  const driveLF = parseFloat(inputs.drivewayLength) || 0;
  const driveW = parseFloat(inputs.drivewayWidth) || 12;
  const driveSqft = driveLF * driveW;
  const fpPerim = fp > 0 ? Math.ceil(Math.sqrt(fp) * 4) : 0;
  const backfillCY = fp > 0 ? Math.ceil(fpPerim * (cut / 12) * 2 / 27 * WASTE) : 0;
  const wellDepth = parseFloat(inputs.wellDepthFt) || 0;
  const bedrooms = Math.max(1, parseInt(inputs.septicBedrooms) || 3);
  const fieldLF = bedrooms * 75;
  const moundCY = inputs.septicType === "mound" ? Math.ceil(fieldLF * 15 * 2 / 27) : 0;

  const items: LaborItem[] = [];

  // ── Grading & earthwork ──
  // C&G, rough grading, and topsoil respread use 3× the building footprint.
  const siteSqft = fp > 0 ? Math.round(fp * 3) : 0;
  if (siteSqft > 0) {
    items.push({ label: "Clearing & Grubbing", qty: siteSqft, unit: "sqft", nationalAvg: 0.68 });
    items.push({ label: "Rough Grading (machine)", qty: siteSqft, unit: "sqft", nationalAvg: 0.85 });
    items.push({ label: "Topsoil Respread & Fine Grade", qty: siteSqft, unit: "sqft", nationalAvg: 0.55 });
  }
  if (fp > 0 && cut > 0) {
    items.push({ label: "Bulk Excavation & Haul (machine)", qty: Math.ceil(fp * (cut / 12) / 27 * 1.25), unit: "CY", nationalAvg: 18.50 });
    items.push({ label: "Fine Grading — Building Pad", qty: fp, unit: "sqft", nationalAvg: 1.15 });
    if (backfillCY > 0) {
      items.push({ label: "Foundation Backfill & Compact", qty: backfillCY, unit: "CY", nationalAvg: 24.50 });
    }
  }

  // ── Driveway ──
  if (inputs.includeDriveway && driveSqft > 0) {
    items.push({ label: "Driveway Base Compact & Install", qty: driveSqft, unit: "sqft", nationalAvg: 1.65 });
    if (inputs.drivewaySurface === "gravel") {
      items.push({ label: "Gravel Surface Place & Compact", qty: driveSqft, unit: "sqft", nationalAvg: 1.05 });
    } else if (inputs.drivewaySurface === "asphalt") {
      items.push({ label: "Asphalt Pave & Roll", qty: driveSqft, unit: "sqft", nationalAvg: 5.85 });
    } else {
      items.push({ label: "Concrete Driveway — Form, Pour & Finish", qty: driveSqft, unit: "sqft", nationalAvg: 8.50 });
    }
  }

  // ── Well ──
  if (!inputs.hasMunicipalWater && wellDepth > 0) {
    items.push({ label: "Well Drilling (incl. casing & grouting)", qty: wellDepth, unit: "LF", nationalAvg: 68.00 });
    items.push({ label: "Submersible Pump & Pressure Tank Install", qty: 1, unit: "ea", nationalAvg: 1250 });
  }

  // ── Septic ──
  if (!inputs.hasMunicipalSewer) {
    items.push({ label: "Septic Tank Excavation & Setting", qty: 1, unit: "ea", nationalAvg: 3200 });
    items.push({ label: "Leach Field Trench Excavation", qty: fieldLF, unit: "LF", nationalAvg: 24.00 });
    items.push({ label: "Drain Pipe, Stone & D-Box Install", qty: fieldLF, unit: "LF", nationalAvg: 16.50 });
    items.push({ label: "Leach Field Backfill & Grade", qty: fieldLF * 3, unit: "sqft", nationalAvg: 0.85 });
    if (inputs.septicType === "mound" && moundCY > 0) {
      items.push({ label: "Mound Construction & Sand Place", qty: moundCY, unit: "CY", nationalAvg: 42.00 });
    }
  }

  return items;
}

function SiteWorkTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<SiteWorkInputs>(SK.sitework, DEFAULT_SITEWORK);
  const [project] = useProject();
  const tabInputs: SiteWorkInputs = { ...DEFAULT_SITEWORK, ...rawInputs };
  const inputs: SiteWorkInputs = {
    ...tabInputs,
    footprintSqft: tabInputs.footprintSqft || project.footprintSqft || project.sqft,
  };
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.siteworkRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.siteMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.siteMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.siteLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.siteCMat, []);
  const [customLab, setCustomLab] = useLocalStorage<CustomLaborRow[]>(SK.siteCLab, []);

  const set = <K extends keyof SiteWorkInputs>(k: K, v: SiteWorkInputs[K]) =>
    setInputs(prev => ({ ...prev, [k]: v }));

  const matItems = getSiteWorkMatItems(inputs);
  const laborItems = getSiteWorkLaborItems(inputs);
  const rates = { ...defaultRates(laborItems), ...savedRates };
  const matPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };

  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const labTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLab);
  const grandTotal = matTotal + labTotal;

  const lot = parseFloat(inputs.lotSqft) || 0;
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const driveSqft = (parseFloat(inputs.drivewayLength) || 0) * (parseFloat(inputs.drivewayWidth) || 12);

  const SWSection = ({ title, note }: { title: string; note?: string }) => (
    <div className="flex items-baseline gap-3 mt-8 mb-4 pb-2 border-b border-[#E8E4DF]">
      <span className="text-xs font-black uppercase tracking-widest text-[#E85D26]">{title}</span>
      {note && <span className="text-xs text-[#AAA]">{note}</span>}
    </div>
  );

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase font-serif text-[#1A1A1A] mb-1">Site Work</h2>
          <p className="text-sm text-[#888]">Clearing, grading, excavation, utilities, and driveway — everything before the foundation goes in.</p>
        </div>
        {canUndo && <UndoBtn onUndo={undo} />}
      </div>

      {/* ── Grading & Excavation ── */}
      <SWSection title="Grading & Excavation" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Field label="Lot Size (sqft)" note="Clearing, grading & topsoil">
          <NumberInput value={inputs.lotSqft} onChange={v => set("lotSqft", v)} placeholder="e.g. 12000" />
        </Field>
        <Field label="Building Footprint (sqft)" note="Excavation & pad prep">
          <NumberInput value={inputs.footprintSqft} onChange={v => set("footprintSqft", v)} placeholder="e.g. 1500" />
          {!tabInputs.footprintSqft && (project.footprintSqft || project.sqft) && <ProjectBadge />}
        </Field>
        <Field label="Average Site Cut Depth (in)" note="Topsoil stripping & excavation depth">
          <NumberInput value={inputs.cutDepthIn} onChange={v => set("cutDepthIn", v)} placeholder="6" />
        </Field>
      </div>
      <div className="flex flex-col gap-3 mb-4">
        <Toggle checked={inputs.topsoilHauledIn} onChange={v => set("topsoilHauledIn", v)}
          label="Topsoil — import from off-site (adds material cost)" />
        {fp > 0 && (
          <Toggle checked={inputs.backfillHauledIn} onChange={v => set("backfillHauledIn", v)}
            label="Foundation backfill sand — haul in clean fill (unchecked = reuse excavated material)" />
        )}
      </div>
      {fp > 0 && (
        <div className="border border-[#E85D26]/40 bg-[#E85D26]/5 rounded p-3 mb-6 flex gap-3">
          <span className="text-[#E85D26] text-lg leading-none mt-0.5">⚠</span>
          <div className="text-xs text-[#555] leading-relaxed">
            <span className="font-bold text-[#333]">OSHA 29 CFR 1926.651(j)(2) — Mandatory Excavation Setback.</span>{" "}
            All excavated spoil, equipment, and materials <span className="font-semibold">must</span> be kept a minimum of <span className="font-semibold">2 feet from the edge</span> of any open excavation (foundation hole). This is a federal regulatory requirement, not a recommendation. Your site staging plan must reserve a continuous 2-foot spoil-free setback around the entire foundation excavation perimeter — failure to maintain this clearance is an OSHA citation.
          </div>
        </div>
      )}

      {/* ── Driveway ── */}
      <SWSection title="Driveway" />
      <div className="mb-4">
        <Toggle checked={inputs.includeDriveway} onChange={v => set("includeDriveway", v)} label="Include driveway" />
      </div>
      {inputs.includeDriveway && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-4 pl-4 border-l-2 border-[#E85D26]/30">
          <Field label="Driveway Length (LF)">
            <NumberInput value={inputs.drivewayLength} onChange={v => set("drivewayLength", v)} placeholder="e.g. 80" />
          </Field>
          <Field label="Driveway Width (ft)">
            <NumberInput value={inputs.drivewayWidth} onChange={v => set("drivewayWidth", v)} placeholder="12" />
          </Field>
          <Field label="Driveway Surface">
            <select value={inputs.drivewaySurface} onChange={e => set("drivewaySurface", e.target.value as DrivewaySurface)}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              <option value="gravel">Gravel</option>
              <option value="asphalt">Asphalt</option>
              <option value="concrete">Concrete</option>
            </select>
          </Field>
        </div>
      )}

      {/* ── Water Supply ── */}
      <SWSection title="Water Supply" />
      <div className="flex flex-col gap-3 mb-4">
        <Toggle checked={inputs.hasMunicipalWater} onChange={v => set("hasMunicipalWater", v)}
          label="Municipal / public water available" />
      </div>
      {!inputs.hasMunicipalWater && (
        <div className="pl-4 border-l-2 border-[#E85D26]/30 mb-4">
          <Field label="Estimated Well Depth (ft)" note="Typical residential range 100–400 ft — varies by geology & water table">
            <NumberInput value={inputs.wellDepthFt} onChange={v => set("wellDepthFt", v)} placeholder="200" />
          </Field>
          <p className="mt-2 text-xs text-[#AAA]">Includes casing, grouting materials, submersible pump, pressure tank, pitless adapter & supply line to house.</p>
        </div>
      )}

      {/* ── Wastewater / Sewer ── */}
      <SWSection title="Wastewater Disposal" />
      <div className="flex flex-col gap-3 mb-4">
        <Toggle checked={inputs.hasMunicipalSewer} onChange={v => set("hasMunicipalSewer", v)}
          label="Municipal sewer connection available" />
      </div>
      {!inputs.hasMunicipalSewer && (
        <div className="pl-4 border-l-2 border-[#E85D26]/30 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
            <Field label="Number of Bedrooms" note="Determines tank size and leach field area">
              <NumberInput value={inputs.septicBedrooms} onChange={v => set("septicBedrooms", v)} placeholder="3" />
            </Field>
            <Field label="Septic System Type" note="Mound required when soil drainage is limited">
              <select value={inputs.septicType} onChange={e => set("septicType", e.target.value as SepticType)}
                className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
                <option value="gravity">Conventional — gravity / at-grade leach field</option>
                <option value="mound">Pressure-dosed mound — raised / built-up system</option>
              </select>
            </Field>
          </div>
          {inputs.septicType === "mound" && (
            <p className="mb-3 text-xs text-[#AAA]">Mound systems require certified environmental-grade sand — always included. Adjust qty if owner has pre-approved on-site fill.</p>
          )}
          <p className="text-xs text-[#AAA]">Tank, D-box, perforated pipe, #57 stone, geotextile fabric & inspection ports calculated from bedroom count.</p>
        </div>
      )}

      {/* Info snapshot */}
      {(lot > 0 || fp > 0 || !inputs.hasMunicipalWater || !inputs.hasMunicipalSewer) && (
        <div className="mb-6 p-4 bg-[#FFF8F5] border border-[#E85D26]/20 text-sm">
          <span className="font-bold text-[#E85D26] uppercase tracking-wider text-xs">Estimate Snapshot — </span>
          <span className="text-[#555]">
            {lot > 0 && `${lot.toLocaleString()} sqft lot`}
            {fp > 0 && ` · ${fp.toLocaleString()} sqft building pad`}
            {fp > 0 && parseFloat(inputs.cutDepthIn) > 0 && ` · ${inputs.cutDepthIn}" cut`}
            {inputs.includeDriveway && driveSqft > 0 && ` · ${driveSqft.toLocaleString()} sqft ${inputs.drivewaySurface} driveway`}
            {!inputs.hasMunicipalWater && inputs.wellDepthFt && ` · well (${inputs.wellDepthFt} ft)`}
            {!inputs.hasMunicipalSewer && ` · ${inputs.septicType === "mound" ? "mound" : "gravity"} septic (${inputs.septicBedrooms || 3} BR)`}
          </span>
        </div>
      )}

      {/* Materials */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold uppercase tracking-widest text-xs text-[#777]">Materials</h3>
          <button onClick={() => { setSavedMatPrices({}); setSavedMatQtys({}); }} className="text-[10px] text-[#AAA] hover:text-[#E85D26] flex items-center gap-1 transition-colors">
            <RotateCcw size={10} /> Reset prices & qtys
          </button>
        </div>
        {matItems.length === 0 && customMat.length === 0 ? (
          <p className="text-sm text-[#AAA] py-4">Enter lot size, footprint, or driveway details above to see material line items.</p>
        ) : (
          <div className="border border-[#DDD8D0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Item</th>
                  <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">$/Unit</th>
                  <th className="text-right px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {matItems.map(item => {
                  const price = effectiveMatPrice(item, matPrices);
                  return (
                    <tr key={item.label} className="hover:bg-[#FAF8F5]">
                      <td className="px-4 py-2.5 text-[#333]">{item.label}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input type="number" min="0" step="1"
                          value={savedMatQtys[item.label] ?? String(item.qty)}
                          onChange={e => setSavedMatQtys(prev => ({ ...prev, [item.label]: e.target.value }))}
                          className={`w-20 text-right bg-transparent border-b focus:outline-none tabular-nums ${savedMatQtys[item.label] !== undefined ? "border-[#E85D26] text-[#E85D26] font-semibold" : "border-transparent hover:border-[#DDD8D0] text-[#555]"}`} />
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#888] text-xs">{item.unit}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input type="number" min="0" step="0.01" value={matPrices[item.label] ?? String(item.price)}
                          onChange={e => setSavedMatPrices(prev => ({ ...prev, [item.label]: e.target.value }))}
                          className="w-20 text-right bg-transparent border-b border-transparent hover:border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-[#555] tabular-nums" />
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[#1A1A1A] tabular-nums">${fmt(effectiveQty(item, savedMatQtys) * price)}</td>
                    </tr>
                  );
                })}
                {customMat.map(row => (
                  <tr key={row.id} className="bg-[#FFFDF9] hover:bg-[#FAF8F5]">
                    <td className="px-4 py-2">
                      <input value={row.label} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))}
                        placeholder="Item name" className="w-full bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm text-[#333]" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" value={row.qty} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, qty: e.target.value } : r))}
                        className="w-16 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input value={row.unit} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, unit: e.target.value } : r))}
                        className="w-12 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-xs" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" step="0.01" value={row.price} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, price: e.target.value } : r))}
                        className="w-20 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm font-medium tabular-nums">${fmt((parseFloat(row.qty) || 0) * (parseFloat(row.price) || 0))}</span>
                        <button onClick={() => setCustomMat(prev => prev.filter(r => r.id !== row.id))} className="text-[#CCC] hover:text-red-500 transition-colors"><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[#DDD8D0] bg-[#F7F4F0]">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 font-bold text-[#1A1A1A] text-sm uppercase tracking-wider">Materials Total</td>
                  <td className="px-4 py-2.5 text-right font-black text-[#1A1A1A]">${fmt(matTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <button onClick={() => setCustomMat(prev => [...prev, { id: newId(), label: "", qty: "", unit: "CY", price: "" }])}
          className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E85D26] hover:text-[#c94d1f] transition-colors">
          <Plus size={13} /> Add custom material
        </button>
      </div>

      {/* Labor */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold uppercase tracking-widest text-xs text-[#777]">Labor <span className="font-normal text-[#AAA] normal-case tracking-normal">(RSMeans 75th percentile — edit any rate)</span></h3>
          <button onClick={() => { setSavedRates({}); setSavedLabQtys({}); }} className="text-[10px] text-[#AAA] hover:text-[#E85D26] flex items-center gap-1 transition-colors">
            <RotateCcw size={10} /> Reset rates & qtys
          </button>
        </div>
        {laborItems.length === 0 && customLab.length === 0 ? (
          <p className="text-sm text-[#AAA] py-4">Enter lot size, footprint, or driveway details above to see labor line items.</p>
        ) : (
          <div className="border border-[#DDD8D0] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Task</th>
                  <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">$/Unit</th>
                  <th className="text-right px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {laborItems.map(item => {
                  const rate = effectiveRate(item, rates);
                  return (
                    <tr key={item.label} className="hover:bg-[#FAF8F5]">
                      <td className="px-4 py-2.5 text-[#333]">{item.label}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input type="number" min="0" step="1"
                          value={savedLabQtys[item.label] ?? String(item.qty)}
                          onChange={e => setSavedLabQtys(prev => ({ ...prev, [item.label]: e.target.value }))}
                          className={`w-20 text-right bg-transparent border-b focus:outline-none tabular-nums ${savedLabQtys[item.label] !== undefined ? "border-[#E85D26] text-[#E85D26] font-semibold" : "border-transparent hover:border-[#DDD8D0] text-[#555]"}`} />
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#888] text-xs">{item.unit}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input type="number" min="0" step="0.01" value={rates[item.label] ?? String(item.nationalAvg)}
                          onChange={e => setSavedRates(prev => ({ ...prev, [item.label]: e.target.value }))}
                          className="w-20 text-right bg-transparent border-b border-transparent hover:border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-[#555] tabular-nums" />
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[#1A1A1A] tabular-nums">${fmt(effectiveQty(item, savedLabQtys) * rate)}</td>
                    </tr>
                  );
                })}
                {customLab.map(row => (
                  <tr key={row.id} className="bg-[#FFFDF9] hover:bg-[#FAF8F5]">
                    <td className="px-4 py-2">
                      <input value={row.label} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))}
                        placeholder="Task name" className="w-full bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm text-[#333]" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" value={row.qty} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, qty: e.target.value } : r))}
                        className="w-16 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input value={row.unit} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, unit: e.target.value } : r))}
                        className="w-12 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-xs" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" step="0.01" value={row.rate} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, rate: e.target.value } : r))}
                        className="w-20 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm font-medium tabular-nums">${fmt((parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0))}</span>
                        <button onClick={() => setCustomLab(prev => prev.filter(r => r.id !== row.id))} className="text-[#CCC] hover:text-red-500 transition-colors"><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[#DDD8D0] bg-[#F7F4F0]">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 font-bold text-[#1A1A1A] text-sm uppercase tracking-wider">Labor Total</td>
                  <td className="px-4 py-2.5 text-right font-black text-[#1A1A1A]">${fmt(labTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <button onClick={() => setCustomLab(prev => [...prev, { id: newId(), label: "", qty: "", unit: "sqft", rate: "" }])}
          className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E85D26] hover:text-[#c94d1f] transition-colors">
          <Plus size={13} /> Add custom labor
        </button>
      </div>

      {/* Grand total */}
      <div className="bg-[#1A1A1A] text-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Materials</div>
            <div className="font-black text-lg">${fmt(matTotal)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Labor</div>
            <div className="font-black text-lg">${fmt(labTotal)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Site Work Total</div>
          <div className="font-black text-4xl">${fmt(grandTotal)}</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FOUNDATION TAB
───────────────────────────────────────────── */
type FoundationType = "slab" | "basement" | "crawlspace";
type FoundationClimate = "cold" | "mixed" | "hot";
type BasementDepth = "8" | "9" | "10";

interface FoundationInputs {
  sqft: string;
  perimeter: string;
  perimeterOverride: boolean;
  foundationType: FoundationType;
  climate: FoundationClimate;
  basementDepth: BasementDepth;
  haulSpoil: boolean;
}

const DEFAULT_FOUNDATION: FoundationInputs = {
  sqft: "",
  perimeter: "",
  perimeterOverride: false,
  foundationType: "slab",
  climate: "cold",
  basementDepth: "8",
  haulSpoil: true,
};

function getFoundationMatItems(inputs: FoundationInputs): MatItem[] {
  const sqft = parseFloat(inputs.sqft) || 0;
  const autoPerim = Math.ceil(Math.sqrt(sqft) * 4);
  const perim = inputs.perimeterOverride ? (parseFloat(inputs.perimeter) || autoPerim) : autoPerim;
  const depth = parseFloat(inputs.basementDepth) || 8;

  if (inputs.foundationType === "slab") {
    // Thickened-edge footing: 16" wide × 4" stone bed
    const footingStoneCY = Math.ceil(perim * (16 / 12) * (4 / 12) / 27);
    const items: MatItem[] = [
      { label: "#57 Crushed Stone — Footing Bed (4\", 16\" wide)", qty: footingStoneCY, unit: "CY", price: 48 },
      { label: "Compacted Gravel Base — Slab Field (4\")", qty: Math.ceil(sqft * (4 / 12) / 27), unit: "CY", price: 48 },
      { label: "6-Mil Polyethylene Vapor Barrier", qty: Math.ceil(sqft * 1.1), unit: "sqft", price: 0.14 },
      { label: "Rebar #4 (12\" OC each way)", qty: Math.ceil(sqft * 2 * 1.1), unit: "LF", price: 0.82 },
      { label: "Ready-Mix Concrete 3,000 PSI (4\" slab + thickened edge)", qty: Math.ceil((sqft * (4 / 12) / 27) + (perim * (16 / 12) * (8 / 12) / 27)), unit: "CY", price: 195 },
      { label: "Form Boards 2×8 (perimeter)", qty: perim, unit: "LF", price: 2.45 },
      { label: "Anchor Bolts (every 6')", qty: Math.ceil(perim / 6), unit: "ea", price: 2.25 },
    ];
    if (inputs.climate === "cold") {
      items.splice(3, 0, { label: "2\" XPS Rigid Foam Insulation (under slab)", qty: sqft, unit: "sqft", price: 1.15 });
    }
    return items;
  }

  if (inputs.foundationType === "basement") {
    // Spread footing: 24" wide × 6" stone bed at bottom of excavation
    const excavCY = Math.ceil(sqft * depth / 27 * 1.25);
    const footingStoneCY = Math.ceil(perim * (24 / 12) * (6 / 12) / 27);
    return [
      ...(inputs.haulSpoil ? [{ label: "Haul-off Disposal — Excavated Basement Spoil", qty: excavCY, unit: "CY", price: 28 } as MatItem] : []),
      { label: "#57 Crushed Stone — Footing Bed (6\", 24\" wide)", qty: footingStoneCY, unit: "CY", price: 48 },
      { label: "Ready-Mix Concrete — Footings (24\" wide × 12\" deep)", qty: Math.ceil(perim * (24 / 12) * (12 / 12) / 27), unit: "CY", price: 195 },
      { label: "Footing Rebar #5 (3 continuous bars)", qty: Math.ceil(perim * 3 * 1.1), unit: "LF", price: 0.98 },
      { label: "Ready-Mix Concrete — Foundation Walls", qty: Math.ceil(perim * depth * (8 / 12) / 27), unit: "CY", price: 195 },
      { label: "Wall Rebar #5 (vertical, 24\" OC)", qty: Math.ceil((perim / 2) * depth * 1.1), unit: "LF", price: 0.98 },
      { label: "Exterior Waterproofing Membrane", qty: Math.ceil(perim * depth), unit: "sqft", price: 1.15 },
      { label: "Dimple Drainage Board", qty: Math.ceil(perim * depth), unit: "sqft", price: 0.82 },
      { label: "4\" Perforated Drain Tile", qty: perim, unit: "LF", price: 1.65 },
      { label: "Drainage Gravel (perimeter trench)", qty: Math.ceil(perim * 1 * 1 / 27), unit: "CY", price: 48 },
      { label: "Compacted Gravel Base — Basement Slab (4\")", qty: Math.ceil(sqft * (4 / 12) / 27), unit: "CY", price: 48 },
      { label: "6-Mil Vapor Barrier (basement floor)", qty: Math.ceil(sqft * 1.1), unit: "sqft", price: 0.14 },
      { label: "Ready-Mix Concrete — Basement Slab (3.5\")", qty: Math.ceil(sqft * (3.5 / 12) / 27), unit: "CY", price: 195 },
      { label: "Anchor Bolts (every 6')", qty: Math.ceil(perim / 6), unit: "ea", price: 2.25 },
    ];
  }

  // crawlspace — continuous footing: 16" wide × 4" stone bed
  const frostDepthFtMat: Record<FoundationClimate, number> = { cold: 4.5, mixed: 4.0, hot: 4.0 };
  const frostFtMat = frostDepthFtMat[inputs.climate] ?? 1.5;
  const trenchCYMat = Math.ceil(perim * (24 / 12) * frostFtMat / 27);
  const footingStoneCY = Math.ceil(perim * (16 / 12) * (4 / 12) / 27);
  const blocks = Math.ceil(perim * 3 / 0.89);
  return [
    ...(inputs.haulSpoil ? [{ label: "Haul-off Disposal — Footing Trench Spoil", qty: trenchCYMat, unit: "CY", price: 28 } as MatItem] : []),
    { label: "#57 Crushed Stone — Footing Bed (4\", 16\" wide)", qty: footingStoneCY, unit: "CY", price: 48 },
    { label: "Ready-Mix Concrete — Footings (16\" wide × 8\" deep)", qty: Math.ceil(perim * (16 / 12) * (8 / 12) / 27), unit: "CY", price: 195 },
    { label: "CMU Block 8\"×8\"×16\"", qty: blocks, unit: "ea", price: 3.25 },
    { label: "Mortar Mix", qty: Math.ceil(blocks / 35), unit: "bag", price: 9.85 },
    { label: "Anchor Bolts (every 6')", qty: Math.ceil(perim / 6), unit: "ea", price: 2.25 },
    { label: "6-Mil Ground Vapor Barrier", qty: Math.ceil(sqft * 1.1), unit: "sqft", price: 0.14 },
    { label: "Foundation Vents", qty: Math.ceil(sqft / 150), unit: "ea", price: 28 },
  ];
}

function getFoundationLaborItems(inputs: FoundationInputs): LaborItem[] {
  const sqft = parseFloat(inputs.sqft) || 0;
  const autoPerim = Math.ceil(Math.sqrt(sqft) * 4);
  const perim = inputs.perimeterOverride ? (parseFloat(inputs.perimeter) || autoPerim) : autoPerim;
  const depth = parseFloat(inputs.basementDepth) || 8;

  if (inputs.foundationType === "slab") {
    // Footing trench is the thickened-edge perimeter — machine trim after bulk grade
    const footingStoneCY = Math.ceil(perim * (16 / 12) * (4 / 12) / 27);
    return [
      { label: "Site Prep & Bulk Grading (machine)", qty: sqft, unit: "sqft", nationalAvg: 1.45 },
      { label: "Footing Trench Trim & Level (machine)", qty: perim, unit: "LF", nationalAvg: 6.25 },
      { label: "#57 Stone Footing Bed — Place & Compact", qty: footingStoneCY, unit: "CY", nationalAvg: 24.50 },
      { label: "Gravel Base Compact — Slab Field", qty: sqft, unit: "sqft", nationalAvg: 1.05 },
      { label: "Thickened Edge Footing (form, pour & strip)", qty: perim, unit: "LF", nationalAvg: 22.50 },
      { label: "Slab Pour & Finish", qty: sqft, unit: "sqft", nationalAvg: 6.25 },
    ];
  }

  if (inputs.foundationType === "basement") {
    // Full hole excavation + footing stone bed at bottom of hole
    const excavCY = Math.ceil(sqft * depth / 27 * 1.25);
    const footingStoneCY = Math.ceil(perim * (24 / 12) * (6 / 12) / 27);
    const wallArea = perim * depth;
    return [
      { label: inputs.haulSpoil ? "Full Basement Excavation (machine, incl. haul)" : "Full Basement Excavation (machine — spoil stockpiled on-site)", qty: excavCY, unit: "CY", nationalAvg: inputs.haulSpoil ? 18.50 : 14.50 },
      { label: "#57 Stone Footing Bed — Place & Compact (bottom of hole)", qty: footingStoneCY, unit: "CY", nationalAvg: 24.50 },
      { label: "Footing (form, pour & strip)", qty: perim, unit: "LF", nationalAvg: 26.50 },
      { label: "Foundation Wall (form, pour & strip)", qty: perim, unit: "LF", nationalAvg: 38.50 },
      { label: "Waterproofing & Drainage Install", qty: wallArea, unit: "sqft", nationalAvg: 6.25 },
      { label: "Gravel Base Compact — Basement Slab", qty: sqft, unit: "sqft", nationalAvg: 1.05 },
      { label: "Basement Slab Pour & Finish", qty: sqft, unit: "sqft", nationalAvg: 5.85 },
    ];
  }

  // crawlspace — must excavate footing trenches to frost depth, then place stone
  const frostDepthFt: Record<FoundationClimate, number> = { cold: 4.5, mixed: 4.0, hot: 4.0 };
  const frostFt = frostDepthFt[inputs.climate] ?? 1.5;
  const trenchCY = Math.ceil(perim * (24 / 12) * frostFt / 27); // 24" wide trench × frost depth
  const footingStoneCY = Math.ceil(perim * (16 / 12) * (4 / 12) / 27);
  return [
    { label: inputs.haulSpoil ? `Footing Trench Excavation — ${frostFt * 12}" frost depth (machine, incl. haul)` : `Footing Trench Excavation — ${frostFt * 12}" frost depth (machine — spoil stockpiled on-site)`, qty: trenchCY, unit: "CY", nationalAvg: inputs.haulSpoil ? 18.50 : 14.50 },
    { label: "#57 Stone Footing Bed — Place & Compact", qty: footingStoneCY, unit: "CY", nationalAvg: 24.50 },
    { label: "Footing (form, pour & strip)", qty: perim, unit: "LF", nationalAvg: 26.50 },
    { label: "CMU Wall Lay & Mortar", qty: perim, unit: "LF", nationalAvg: 34.50 },
    { label: "Vapor Barrier Install", qty: sqft, unit: "sqft", nationalAvg: 0.82 },
  ];
}

function FoundationTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<FoundationInputs>(SK.foundation, DEFAULT_FOUNDATION);
  const [project] = useProject();
  const tabInputs: FoundationInputs = { ...DEFAULT_FOUNDATION, ...rawInputs };
  const inputs: FoundationInputs = {
    ...tabInputs,
    sqft: tabInputs.sqft || project.sqft,
    perimeter: tabInputs.perimeter || (tabInputs.perimeterOverride ? project.linearFeet : ""),
  };
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.foundationRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.foundMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.foundMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.foundLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.foundCMat, []);
  const [customLab, setCustomLab] = useLocalStorage<CustomLaborRow[]>(SK.foundCLab, []);

  const set = <K extends keyof FoundationInputs>(k: K, v: FoundationInputs[K]) =>
    setInputs(prev => ({ ...prev, [k]: v }));

  const sqft = parseFloat(inputs.sqft) || 0;
  const autoPerim = sqft > 0 ? Math.ceil(Math.sqrt(sqft) * 4) : 0;
  const effectivePerim = inputs.perimeterOverride ? (parseFloat(inputs.perimeter) || autoPerim) : autoPerim;

  const matItems = getFoundationMatItems(inputs);
  const laborItems = getFoundationLaborItems(inputs);

  const rates = { ...defaultRates(laborItems), ...savedRates };
  const matPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };

  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const labTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLab);
  const grandTotal = matTotal + labTotal;

  const typeLabel = inputs.foundationType === "slab" ? "Slab-on-Grade" : inputs.foundationType === "basement" ? "Full Basement" : "Crawl Space";

  const concreteCY = (() => {
    if (!sqft) return 0;
    if (inputs.foundationType === "slab") {
      return Math.ceil(sqft * (4 / 12) / 27);
    }
    if (inputs.foundationType === "basement") {
      const depth = parseFloat(inputs.basementDepth) || 8;
      return Math.ceil(effectivePerim * 2 * 1 / 27) + Math.ceil(effectivePerim * depth * (8 / 12) / 27) + Math.ceil(sqft * (3.5 / 12) / 27);
    }
    return Math.ceil(effectivePerim * (16 / 12) * (8 / 12) / 27);
  })();

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase font-serif text-[#1A1A1A] mb-1">Foundation & Concrete</h2>
          <p className="text-sm text-[#888]">Configure your foundation type and footprint — materials and labor auto-calculate.</p>
        </div>
        {canUndo && <UndoBtn onUndo={undo} />}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Field label="Foundation Type">
          <select value={inputs.foundationType} onChange={e => set("foundationType", e.target.value as FoundationType)}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            <option value="slab">Slab-on-Grade</option>
            <option value="basement">Full Basement</option>
            <option value="crawlspace">Crawl Space</option>
          </select>
        </Field>

        <Field label="Footprint (sqft)">
          <NumberInput value={inputs.sqft} onChange={v => set("sqft", v)} placeholder="e.g. 1500" />
          {!tabInputs.sqft && project.sqft && <ProjectBadge />}
        </Field>

        <Field label="Climate Zone" note="Affects underslab insulation for slab foundations">
          <select value={inputs.climate} onChange={e => set("climate", e.target.value as FoundationClimate)}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            <option value="cold">Cold (heating-dominated)</option>
            <option value="mixed">Mixed</option>
            <option value="hot">Hot (cooling-dominated)</option>
          </select>
        </Field>

        {inputs.foundationType === "basement" && (
          <Field label="Basement Depth">
            <select value={inputs.basementDepth} onChange={e => set("basementDepth", e.target.value as BasementDepth)}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              <option value="8">8 ft</option>
              <option value="9">9 ft</option>
              <option value="10">10 ft</option>
            </select>
          </Field>
        )}

        {(inputs.foundationType === "basement" || inputs.foundationType === "crawlspace") && (
          <div className="flex items-start gap-3 pt-1 sm:col-span-2 lg:col-span-1">
            <input type="checkbox" id="haulSpoil" checked={inputs.haulSpoil}
              onChange={e => set("haulSpoil", e.target.checked)}
              className="mt-0.5 accent-[#E85D26] w-4 h-4 shrink-0 cursor-pointer" />
            <label htmlFor="haulSpoil" className="text-sm text-[#333] cursor-pointer leading-snug">
              <span className="font-semibold">Haul off excavated spoil</span>
              <span className="block text-xs text-[#888] mt-0.5">Uncheck if spoil is reused on-site for backfill &amp; regrading — removes disposal cost and drops excavation rate to $9.50/CY</span>
            </label>
          </div>
        )}

        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block text-xs font-bold uppercase tracking-widest text-[#777] mb-1.5">Perimeter (LF)</label>
          <div className="flex gap-2 items-center">
            <input type="number" min="0" value={inputs.perimeterOverride ? inputs.perimeter : String(autoPerim || "")}
              readOnly={!inputs.perimeterOverride}
              onChange={e => set("perimeter", e.target.value)}
              placeholder={autoPerim ? String(autoPerim) : "enter sqft first"}
              className={`flex-1 bg-[#FAF8F5] border px-4 py-2.5 text-[#1A1A1A] focus:outline-none transition-colors ${inputs.perimeterOverride ? "border-[#E85D26] focus:border-[#E85D26]" : "border-[#DDD8D0] text-[#999]"}`} />
            <button onClick={() => {
              set("perimeterOverride", !inputs.perimeterOverride);
              if (!inputs.perimeterOverride) set("perimeter", String(autoPerim));
            }}
              className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wider border transition-colors whitespace-nowrap ${inputs.perimeterOverride ? "bg-[#E85D26] text-white border-[#E85D26]" : "bg-[#FAF8F5] text-[#888] border-[#DDD8D0] hover:border-[#E85D26] hover:text-[#E85D26]"}`}>
              {inputs.perimeterOverride ? "Override" : "Auto"}
            </button>
          </div>
          <p className="text-xs text-[#AAA] mt-1">Auto = √sqft × 4 = {autoPerim || "—"} LF. Override for non-square footprints.</p>
        </div>
      </div>

      {/* Info box */}
      {sqft > 0 && (
        <div className="mb-6 p-4 bg-[#FFF8F5] border border-[#E85D26]/20 text-sm">
          <span className="font-bold text-[#E85D26] uppercase tracking-wider text-xs">Estimate Snapshot — </span>
          <span className="text-[#555]">
            {typeLabel} · {sqft.toLocaleString()} sqft · {effectivePerim} LF perimeter
            {inputs.foundationType === "basement" && ` · ${inputs.basementDepth} ft depth`}
            {inputs.foundationType !== "crawlspace" && ` · ~${concreteCY} CY concrete`}
            {inputs.foundationType === "crawlspace" && ` · ~${concreteCY} CY footing concrete`}
            {inputs.climate === "cold" && inputs.foundationType === "slab" && " · XPS insulation included"}
          </span>
        </div>
      )}

      {/* Materials */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold uppercase tracking-widest text-xs text-[#777]">Materials</h3>
          <button onClick={() => { setSavedMatPrices({}); setSavedMatQtys({}); }} className="text-[10px] text-[#AAA] hover:text-[#E85D26] flex items-center gap-1 transition-colors">
            <RotateCcw size={10} /> Reset prices & qtys
          </button>
        </div>
        <div className="border border-[#DDD8D0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Item</th>
                <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Qty</th>
                <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Unit</th>
                <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">$/Unit</th>
                <th className="text-right px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EDE8]">
              {matItems.map(item => {
                const price = effectiveMatPrice(item, matPrices);
                return (
                  <tr key={item.label} className="hover:bg-[#FAF8F5]">
                    <td className="px-4 py-2.5 text-[#333]">{item.label}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" min="0" step="1"
                        value={savedMatQtys[item.label] ?? String(item.qty)}
                        onChange={e => setSavedMatQtys(prev => ({ ...prev, [item.label]: e.target.value }))}
                        className={`w-20 text-right bg-transparent border-b focus:outline-none tabular-nums ${savedMatQtys[item.label] !== undefined ? "border-[#E85D26] text-[#E85D26] font-semibold" : "border-transparent hover:border-[#DDD8D0] text-[#555]"}`} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#888] text-xs">{item.unit}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" min="0" step="0.01" value={matPrices[item.label] ?? String(item.price)}
                        onChange={e => setSavedMatPrices(prev => ({ ...prev, [item.label]: e.target.value }))}
                        className="w-20 text-right bg-transparent border-b border-transparent hover:border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-[#555] tabular-nums" />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-[#1A1A1A] tabular-nums">${fmt(effectiveQty(item, savedMatQtys) * price)}</td>
                  </tr>
                );
              })}
              {customMat.map(row => (
                <tr key={row.id} className="bg-[#FFFDF9] hover:bg-[#FAF8F5]">
                  <td className="px-4 py-2">
                    <input value={row.label} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))}
                      placeholder="Item name" className="w-full bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm text-[#333]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={row.qty} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, qty: e.target.value } : r))}
                      className="w-16 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input value={row.unit} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, unit: e.target.value } : r))}
                      className="w-12 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" step="0.01" value={row.price} onChange={e => setCustomMat(prev => prev.map(r => r.id === row.id ? { ...r, price: e.target.value } : r))}
                      className="w-20 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-medium tabular-nums">${fmt((parseFloat(row.qty) || 0) * (parseFloat(row.price) || 0))}</span>
                      <button onClick={() => setCustomMat(prev => prev.filter(r => r.id !== row.id))} className="text-[#CCC] hover:text-red-500 transition-colors"><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[#DDD8D0] bg-[#F7F4F0]">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 font-bold text-[#1A1A1A] text-sm uppercase tracking-wider">Materials Total</td>
                <td className="px-4 py-2.5 text-right font-black text-[#1A1A1A]">${fmt(matTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={() => setCustomMat(prev => [...prev, { id: newId(), label: "", qty: "", unit: "ea", price: "" }])}
          className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E85D26] hover:text-[#c94d1f] transition-colors">
          <Plus size={13} /> Add custom material
        </button>
      </div>

      {/* Labor */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold uppercase tracking-widest text-xs text-[#777]">Labor <span className="font-normal text-[#AAA] normal-case tracking-normal">(RSMeans 75th percentile — edit any rate)</span></h3>
          <button onClick={() => { setSavedRates({}); setSavedLabQtys({}); }} className="text-[10px] text-[#AAA] hover:text-[#E85D26] flex items-center gap-1 transition-colors">
            <RotateCcw size={10} /> Reset rates & qtys
          </button>
        </div>
        <div className="border border-[#DDD8D0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Task</th>
                <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Qty</th>
                <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Unit</th>
                <th className="text-right px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">$/Unit</th>
                <th className="text-right px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#777]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EDE8]">
              {laborItems.map(item => {
                const rate = effectiveRate(item, rates);
                return (
                  <tr key={item.label} className="hover:bg-[#FAF8F5]">
                    <td className="px-4 py-2.5 text-[#333]">{item.label}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" min="0" step="1"
                        value={savedLabQtys[item.label] ?? String(item.qty)}
                        onChange={e => setSavedLabQtys(prev => ({ ...prev, [item.label]: e.target.value }))}
                        className={`w-20 text-right bg-transparent border-b focus:outline-none tabular-nums ${savedLabQtys[item.label] !== undefined ? "border-[#E85D26] text-[#E85D26] font-semibold" : "border-transparent hover:border-[#DDD8D0] text-[#555]"}`} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#888] text-xs">{item.unit}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" min="0" step="0.01" value={rates[item.label] ?? String(item.nationalAvg)}
                        onChange={e => setSavedRates(prev => ({ ...prev, [item.label]: e.target.value }))}
                        className="w-20 text-right bg-transparent border-b border-transparent hover:border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-[#555] tabular-nums" />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-[#1A1A1A] tabular-nums">${fmt(effectiveQty(item, savedLabQtys) * rate)}</td>
                  </tr>
                );
              })}
              {customLab.map(row => (
                <tr key={row.id} className="bg-[#FFFDF9] hover:bg-[#FAF8F5]">
                  <td className="px-4 py-2">
                    <input value={row.label} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))}
                      placeholder="Task name" className="w-full bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm text-[#333]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={row.qty} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, qty: e.target.value } : r))}
                      className="w-16 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input value={row.unit} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, unit: e.target.value } : r))}
                      className="w-12 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" step="0.01" value={row.rate} onChange={e => setCustomLab(prev => prev.map(r => r.id === row.id ? { ...r, rate: e.target.value } : r))}
                      className="w-20 text-right bg-transparent border-b border-[#DDD8D0] focus:border-[#E85D26] focus:outline-none text-sm" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-medium tabular-nums">${fmt((parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0))}</span>
                      <button onClick={() => setCustomLab(prev => prev.filter(r => r.id !== row.id))} className="text-[#CCC] hover:text-red-500 transition-colors"><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[#DDD8D0] bg-[#F7F4F0]">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 font-bold text-[#1A1A1A] text-sm uppercase tracking-wider">Labor Total</td>
                <td className="px-4 py-2.5 text-right font-black text-[#1A1A1A]">${fmt(labTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={() => setCustomLab(prev => [...prev, { id: newId(), label: "", qty: "", unit: "LF", rate: "" }])}
          className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#E85D26] hover:text-[#c94d1f] transition-colors">
          <Plus size={13} /> Add custom labor
        </button>
      </div>

      {/* Grand total */}
      <div className="bg-[#1A1A1A] text-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Materials</div>
            <div className="font-black text-lg">${fmt(matTotal)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Labor</div>
            <div className="font-black text-lg">${fmt(labTotal)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Foundation Total</div>
          <div className="font-black text-4xl">${fmt(grandTotal)}</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   WALL TAB
───────────────────────────────────────────── */
type StudSize = "2x4-16" | "2x6-16" | "2x6-24";
interface WallInputs {
  linearFeet: string; ceilingHeight: string; studSize: StudSize;
  exteriorSheathing: boolean; insulation: boolean; drywall: boolean;
  interiorLF: string; interiorDrywall: boolean;
  blockingLF: string;
  intDoorCount: string; extDoorCount: string; windowCount: string;
  stories: string;
  buildingWidth: string;
  roofPitch: string;
  includeWindowUnits: boolean;
  windowType: string;
  includeExtDoorUnits: boolean;
  extDoorEntryCount: string;
  extDoorSliderCount: string;
  extDoorFrenchCount: string;
  extDoorGarSingleCount: string;
  extDoorGarDoubleCount: string;
  includeIntDoorUnits: boolean;
  intDoorType: string;
  includeTrim: boolean;
  trimStyle: string;
  baseMoldingLF: string;
  buildType: "full" | "addition";
  sharedWallLF: string;
}

const STUD_CONFIG: Record<StudSize, { studLabel: string; plateLabel: string; studPrice: number; platePrice: number; ocSpacing: number; insulLabel: string; insulPrice: number }> = {
  "2x4-16": { studLabel: "2×4×8 Studs (16\" OC)", plateLabel: "2×4×16 Plates (3 per run)", studPrice: 5.48, platePrice: 10.97, ocSpacing: 1.333, insulLabel: "R-13 Batt Insulation", insulPrice: 0.55 },
  "2x6-16": { studLabel: "2×6×8 Studs (16\" OC)", plateLabel: "2×6×16 Plates (3 per run)", studPrice: 8.98, platePrice: 17.98, ocSpacing: 1.333, insulLabel: "R-21 Batt Insulation", insulPrice: 0.82 },
  "2x6-24": { studLabel: "2×6×8 Studs (24\" OC)", plateLabel: "2×6×16 Plates (3 per run)", studPrice: 8.98, platePrice: 17.98, ocSpacing: 2.0,   insulLabel: "R-21 Batt Insulation", insulPrice: 0.82 },
};

function migrateStudSize(v: unknown): StudSize {
  if (v === "2x4") return "2x4-16";
  if (v === "2x6") return "2x6-24";
  if (v === "2x4-16" || v === "2x6-16" || v === "2x6-24") return v;
  return "2x4-16";
}

const PRECUT_LABEL: Record<string, string> = {
  "8":  '92⅝"',
  "9":  '104⅝"',
  "10": '116⅝"',
  "11": '128⅝"',
  "12": '140⅝"',
};

const STUD_PRICES: Record<"2x4" | "2x6", Record<string, number>> = {
  "2x4": { "8": 5.48, "9": 6.48, "10": 7.48, "11": 8.48, "12": 9.48 },
  "2x6": { "8": 8.98, "9": 10.48, "10": 11.98, "11": 13.48, "12": 14.98 },
};

const WALL_MAT_PRICES = { osb: 38.98, drywall: 17.98 };
const DEFAULT_WALL: WallInputs = {
  linearFeet: "", ceilingHeight: "9", studSize: "2x4-16",
  exteriorSheathing: true, insulation: true, drywall: true,
  interiorLF: "", interiorDrywall: true,
  blockingLF: "",
  intDoorCount: "", extDoorCount: "", windowCount: "",
  stories: "", buildingWidth: "", roofPitch: "",
  buildType: "full", sharedWallLF: "",
  includeWindowUnits: false, windowType: "single_hung",
  includeExtDoorUnits: false,
  extDoorEntryCount: "", extDoorSliderCount: "", extDoorFrenchCount: "",
  extDoorGarSingleCount: "", extDoorGarDoubleCount: "",
  includeIntDoorUnits: false, intDoorType: "hollow_prehung",
  includeTrim: false, trimStyle: "craftsman", baseMoldingLF: "",
};

const WINDOW_TYPES: Record<string, { label: string; price: number }> = {
  single_hung:  { label: "Single-Hung Window",          price: 425 },
  double_hung:  { label: "Double-Hung Window",           price: 525 },
  casement:     { label: "Casement Window",              price: 595 },
  sliding:      { label: "Horizontal Sliding Window",    price: 465 },
  picture:      { label: "Picture Window",               price: 385 },
  egress:       { label: "Egress Window (below-grade)",  price: 795 },
};

const INT_DOOR_TYPES: Record<string, { label: string; price: number; laborAvg: number; laborLabel: string }> = {
  hollow_prehung: { label: 'Hollow-Core Prehung Door (2\'6″×6\'8″)', price: 118, laborAvg: 118, laborLabel: "Interior Door Hang & Hardware — Hollow-Core" },
  solid_prehung:  { label: "Solid-Core Prehung Door",               price: 215, laborAvg: 138, laborLabel: "Interior Door Hang & Hardware — Solid-Core" },
  pocket:         { label: "Pocket Door Kit",                        price: 375, laborAvg: 235, laborLabel: "Pocket Door Install & Hardware" },
  bifold:         { label: "Bifold Door (closet, pair)",             price: 158, laborAvg: 95,  laborLabel: "Bifold Door Install & Hardware" },
  barn:           { label: "Barn Door & Hardware Kit",               price: 485, laborAvg: 198, laborLabel: "Barn Door Install & Hardware" },
};

const TRIM_STYLES: Record<string, { label: string; basePrice: number; casingPrice: number }> = {
  basic:     { label: "Basic Colonial",    basePrice: 0.95, casingPrice: 1.10 },
  craftsman: { label: "Craftsman",         basePrice: 1.75, casingPrice: 2.10 },
  premium:   { label: "Premium / Custom",  basePrice: 2.85, casingPrice: 3.45 },
};

function getWallMatItems(inputs: WallInputs): MatItem[] {
  const sharedWall = inputs.buildType === "addition" ? (parseFloat(inputs.sharedWallLF) || 0) : 0;
  const lf = Math.max(0, (parseFloat(inputs.linearFeet) || 0) - sharedWall);
  const h = parseFloat(inputs.ceilingHeight) || 9;
  const storiesCount = parseInt(inputs.stories ?? "1") || 1;
  const area = lf * h * storiesCount;
  const sc = STUD_CONFIG[inputs.studSize] ?? STUD_CONFIG["2x4-16"];
  const family = inputs.studSize.startsWith("2x4") ? "2x4" : "2x6";
  const precutLabel = PRECUT_LABEL[inputs.ceilingHeight] ?? '92⅝"';
  const studPrice = STUD_PRICES[family][inputs.ceilingHeight] ?? STUD_PRICES[family]["8"];
  const studDim = family === "2x4" ? "2×4" : "2×6";
  const ocLabel = inputs.studSize === "2x6-24" ? "24\" OC" : "16\" OC";
  const floorSfx = storiesCount > 1 ? " (both floors)" : "";
  const studLabel = `${studDim}×${precutLabel} Pre-Cut Studs (${ocLabel})${floorSfx}`;
  const plateLabel = `${studDim}×16 Plates (1 bottom + 2 top)${floorSfx}`;

  const intLF = parseFloat(inputs.interiorLF) || 0;
  const intArea = intLF * h * storiesCount;
  const intPrecut = PRECUT_LABEL[inputs.ceilingHeight] ?? '92⅝"';

  const blkLF = parseFloat(inputs.blockingLF) || 0;

  const intDoors = parseInt(inputs.intDoorCount) || 0;
  const extDoorEntryN    = parseInt(inputs.extDoorEntryCount) || 0;
  const extDoorSliderN   = parseInt(inputs.extDoorSliderCount) || 0;
  const extDoorFrenchN   = parseInt(inputs.extDoorFrenchCount) || 0;
  const extDoorGarSingleN= parseInt(inputs.extDoorGarSingleCount) || 0;
  const extDoorGarDoubleN= parseInt(inputs.extDoorGarDoubleCount) || 0;
  const extDoors = inputs.includeExtDoorUnits
    ? extDoorEntryN + extDoorSliderN + extDoorFrenchN + extDoorGarSingleN + extDoorGarDoubleN
    : parseInt(inputs.extDoorCount) || 0;
  const windows = parseInt(inputs.windowCount) || 0;
  const totalRO = intDoors + extDoors + windows;

  const winCfg = WINDOW_TYPES[inputs.windowType] ?? WINDOW_TYPES.single_hung;
  const intDoorCfg = INT_DOOR_TYPES[inputs.intDoorType] ?? INT_DOOR_TYPES.hollow_prehung;
  const trimCfg = TRIM_STYLES[inputs.trimStyle] ?? TRIM_STYLES.craftsman;
  const baseMoldingLF = parseFloat(inputs.baseMoldingLF) || 0;

  // ── Gable ends ──
  const bw = parseFloat(inputs.buildingWidth) || 0;
  const pitch = parseFloat(inputs.roofPitch) || 0;
  const gableHeight = bw > 0 && pitch > 0 ? (pitch / 12) * (bw / 2) : 0;
  const gableArea = bw * gableHeight; // both triangular ends combined = 1 rectangle

  return [
    // ── Exterior walls (× stories) ──
    ...(lf > 0 ? [
      { label: studLabel, qty: Math.ceil((lf / sc.ocSpacing + 1) * storiesCount * WASTE), unit: "ea", price: studPrice },
      { label: plateLabel, qty: Math.ceil(lf * 3 * storiesCount * WASTE / 16), unit: "ea", price: sc.platePrice },
    ] : []),
    ...(lf > 0 && inputs.exteriorSheathing ? [
      { label: `Advantech Wall Sheathing 7/16" (4×8)${floorSfx}`, qty: Math.ceil(area * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.osb },
      { label: `Advantech Seam Tape (75 LF roll)${floorSfx}`, qty: Math.max(1, Math.ceil(area * WASTE / 300)), unit: "roll", price: 27.98 },
    ] : []),
    ...(lf > 0 && inputs.insulation ? [{ label: sc.insulLabel + floorSfx, qty: Math.ceil(area * WASTE), unit: "sqft", price: sc.insulPrice }] : []),
    ...(lf > 0 && inputs.drywall ? [{ label: `½" Drywall — Exterior Walls (4×8)${floorSfx}`, qty: Math.ceil(area * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.drywall }] : []),

    // ── Interior walls (× stories) ──
    ...(intLF > 0 ? [
      { label: `2×4×${intPrecut} Pre-Cut Studs — Interior (16" OC)${floorSfx}`, qty: Math.ceil((intLF / 1.333 + 1) * storiesCount * WASTE), unit: "ea", price: STUD_PRICES["2x4"][inputs.ceilingHeight] ?? 5.48 },
      { label: `2×4×16 Plates — Interior (1 bottom + 2 top)${floorSfx}`, qty: Math.ceil(intLF * 3 * storiesCount * WASTE / 16), unit: "ea", price: 10.97 },
    ] : []),
    ...(intLF > 0 && inputs.interiorDrywall ? [
      { label: `½" Drywall — Interior Walls, Both Sides (4×8)${floorSfx}`, qty: Math.ceil(intArea * 2 * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.drywall },
    ] : []),

    // ── Door & window rough opening framing (user enters total for all floors) ──
    ...(intDoors > 0 ? [
      { label: "King & Jack Studs — Interior Door RO (4 per opening)", qty: intDoors * 4, unit: "ea", price: STUD_PRICES["2x4"][inputs.ceilingHeight] ?? 5.48 },
      { label: "2×10×8 Header Boards — Interior Door (2 per opening)", qty: Math.ceil(intDoors * 2 * WASTE), unit: "ea", price: 19.98 },
    ] : []),
    ...(extDoors > 0 ? [
      { label: "King & Jack Studs — Exterior Door RO (4 per opening)", qty: extDoors * 4, unit: "ea", price: studPrice },
      { label: "2×10×8 Header Boards — Exterior Door (2 per opening)", qty: Math.ceil(extDoors * 2 * WASTE), unit: "ea", price: 19.98 },
      { label: "½\" Plywood Header Spacer — Exterior Door", qty: extDoors, unit: "ea", price: 5.25 },
    ] : []),
    ...(windows > 0 ? [
      { label: "King, Jack & Cripple Studs — Window RO (6 per opening)", qty: windows * 6, unit: "ea", price: studPrice },
      { label: "2×10×8 Header Boards — Window (2 per opening)", qty: Math.ceil(windows * 2 * WASTE), unit: "ea", price: 19.98 },
      { label: "Rough Sill Lumber — Window (1 per opening)", qty: windows, unit: "ea", price: 5.48 },
    ] : []),
    ...(totalRO > 0 ? [
      { label: "LVL Header Nails / Structural Screws (box)", qty: Math.ceil(totalRO / 8), unit: "box", price: 21.98 },
    ] : []),

    // ── 2×10 blocking ──
    ...(blkLF > 0 ? [
      { label: "2×10×8 Blocking Boards (cabinets, vanities, fixtures)", qty: Math.ceil(blkLF * WASTE / 8), unit: "ea", price: 19.98 },
    ] : []),

    // ── Gable end framing (2 ends, triangular — independent of story count) ──
    ...(gableArea > 0 ? [
      { label: `Gable End Studs — ${studDim} Cut Studs (both ends)`, qty: Math.ceil((bw / sc.ocSpacing + 1) * 2 * WASTE), unit: "ea", price: studPrice },
    ] : []),
    ...(gableArea > 0 && inputs.exteriorSheathing ? [
      { label: "Gable End Sheathing — Advantech 7/16\" (4×8)", qty: Math.ceil(gableArea * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.osb },
    ] : []),
    ...(gableArea > 0 && inputs.insulation ? [
      { label: `Gable End Insulation — ${sc.insulLabel}`, qty: Math.ceil(gableArea * WASTE), unit: "sqft", price: sc.insulPrice },
    ] : []),

    // ── Window units & flashing ──
    ...(inputs.includeWindowUnits && windows > 0 ? [
      { label: winCfg.label, qty: windows, unit: "ea", price: winCfg.price } as MatItem,
      { label: 'Window Flashing Tape (3″×75 LF roll)', qty: Math.max(1, Math.ceil(windows / 6)), unit: "roll", price: 32.98 },
      { label: "Flexible Sill Pan Flashing (LF)", qty: Math.ceil(windows * 2.5), unit: "LF", price: 2.35 },
    ] : []),

    // ── Exterior door units & flashing ──
    ...(inputs.includeExtDoorUnits ? [
      ...(extDoorEntryN  > 0 ? [{ label: "Entry Door — Prehung, Insulated Steel",  qty: extDoorEntryN,   unit: "ea", price: 595  } as MatItem] : []),
      ...(extDoorFrenchN > 0 ? [{ label: "French Door Pair — Prehung",              qty: extDoorFrenchN,  unit: "ea", price: 1485 } as MatItem] : []),
      ...(extDoorSliderN > 0 ? [{ label: "Sliding Glass Door (6 ft, prehung)",       qty: extDoorSliderN,  unit: "ea", price: 1050 } as MatItem] : []),
      ...(extDoorGarSingleN > 0 ? [{ label: "Garage Door — Single (9×7)",           qty: extDoorGarSingleN, unit: "ea", price: 985  } as MatItem] : []),
      ...(extDoorGarDoubleN > 0 ? [{ label: "Garage Door — Double (16×7)",          qty: extDoorGarDoubleN, unit: "ea", price: 1595 } as MatItem] : []),
      ...(extDoors > 0 ? [{ label: "Exterior Door Flashing / Z-Bar (per opening)",  qty: extDoors, unit: "ea", price: 16.50 } as MatItem] : []),
    ] : []),

    // ── Interior door units ──
    ...(inputs.includeIntDoorUnits && intDoors > 0 ? [
      { label: intDoorCfg.label, qty: intDoors, unit: "ea", price: intDoorCfg.price } as MatItem,
    ] : []),

    // ── Interior trim ──
    ...(inputs.includeTrim ? [
      ...(baseMoldingLF > 0 ? [{ label: `Base Molding — ${trimCfg.label}`, qty: baseMoldingLF, unit: "LF", price: trimCfg.basePrice } as MatItem] : []),
      ...(inputs.includeIntDoorUnits && intDoors > 0 ? [{ label: `Door Casing — ${trimCfg.label} (both sides, ~18 LF/door)`, qty: Math.ceil(intDoors * 18), unit: "LF", price: trimCfg.casingPrice } as MatItem] : []),
      ...(inputs.includeWindowUnits && windows > 0 ? [{ label: `Window Casing — ${trimCfg.label} (~12 LF/window)`, qty: Math.ceil(windows * 12), unit: "LF", price: trimCfg.casingPrice } as MatItem] : []),
    ] : []),
  ];
}
function getWallLaborItems(inputs: WallInputs): LaborItem[] {
  const sharedWall = inputs.buildType === "addition" ? (parseFloat(inputs.sharedWallLF) || 0) : 0;
  const lf = Math.max(0, (parseFloat(inputs.linearFeet) || 0) - sharedWall);
  const h = parseFloat(inputs.ceilingHeight) || 9;
  const storiesCount = parseInt(inputs.stories ?? "1") || 1;
  const area = Math.round(lf * h * storiesCount);
  const intLF = parseFloat(inputs.interiorLF) || 0;
  const intArea = Math.round(intLF * h * storiesCount);
  const blkLF = parseFloat(inputs.blockingLF) || 0;
  const intDoors = parseInt(inputs.intDoorCount) || 0;
  const extDoorEntryN    = parseInt(inputs.extDoorEntryCount) || 0;
  const extDoorSliderN   = parseInt(inputs.extDoorSliderCount) || 0;
  const extDoorFrenchN   = parseInt(inputs.extDoorFrenchCount) || 0;
  const extDoorGarSingleN= parseInt(inputs.extDoorGarSingleCount) || 0;
  const extDoorGarDoubleN= parseInt(inputs.extDoorGarDoubleCount) || 0;
  const extDoors = inputs.includeExtDoorUnits
    ? extDoorEntryN + extDoorSliderN + extDoorFrenchN + extDoorGarSingleN + extDoorGarDoubleN
    : parseInt(inputs.extDoorCount) || 0;
  const windows = parseInt(inputs.windowCount) || 0;
  const floorSfx = storiesCount > 1 ? " (both floors)" : "";
  const winCfg = WINDOW_TYPES[inputs.windowType] ?? WINDOW_TYPES.single_hung;
  const intDoorCfg = INT_DOOR_TYPES[inputs.intDoorType] ?? INT_DOOR_TYPES.hollow_prehung;
  const trimCfg = TRIM_STYLES[inputs.trimStyle] ?? TRIM_STYLES.craftsman;
  const baseMoldingLF = parseFloat(inputs.baseMoldingLF) || 0;

  const bw = parseFloat(inputs.buildingWidth) || 0;
  const pitch = parseFloat(inputs.roofPitch) || 0;
  const gableHeight = bw > 0 && pitch > 0 ? (pitch / 12) * (bw / 2) : 0;
  const gableArea = Math.round(bw * gableHeight);

  return [
    ...(lf > 0 ? [{ label: `Exterior Wall Framing${floorSfx}`, qty: area, unit: "sqft", nationalAvg: 5.85 }] : []),
    ...(lf > 0 && inputs.exteriorSheathing ? [{ label: `Advantech Sheathing Install & Seam Tape${floorSfx}`, qty: area, unit: "sqft", nationalAvg: 3.15 }] : []),
    ...(lf > 0 && inputs.insulation ? [{ label: `Insulation (Batt) Install${floorSfx}`, qty: area, unit: "sqft", nationalAvg: 1.95 }] : []),
    ...(lf > 0 && inputs.drywall ? [{ label: `Drywall Hang & Finish — Exterior Walls${floorSfx}`, qty: area, unit: "sqft", nationalAvg: 3.25 }] : []),
    ...(intLF > 0 ? [{ label: `Interior Wall Framing${floorSfx}`, qty: intArea, unit: "sqft", nationalAvg: 4.85 }] : []),
    ...(intLF > 0 && inputs.interiorDrywall ? [{ label: `Drywall Hang & Finish — Interior Walls (both sides)${floorSfx}`, qty: intArea * 2, unit: "sqft", nationalAvg: 3.25 }] : []),
    ...(intDoors > 0 ? [{ label: "Interior Door Rough Opening Framing", qty: intDoors, unit: "ea", nationalAvg: 148.00 }] : []),
    ...(extDoors > 0 ? [{ label: "Exterior Door Rough Opening Framing", qty: extDoors, unit: "ea", nationalAvg: 188.00 }] : []),
    ...(windows > 0 ? [{ label: "Window Rough Opening Framing", qty: windows, unit: "ea", nationalAvg: 158.00 }] : []),
    ...(blkLF > 0 ? [{ label: "2×10 Blocking Install (cabinets, vanities, fixtures)", qty: blkLF, unit: "LF", nationalAvg: 3.50 }] : []),
    ...(gableArea > 0 ? [{ label: "Gable End Framing (both ends)", qty: gableArea, unit: "sqft", nationalAvg: 5.85 }] : []),
    ...(gableArea > 0 && inputs.exteriorSheathing ? [{ label: "Gable End Sheathing Install", qty: gableArea, unit: "sqft", nationalAvg: 3.15 }] : []),

    // ── Window install ──
    ...(inputs.includeWindowUnits && windows > 0 ? [
      { label: "Window Install, Flash & Seal", qty: windows, unit: "ea", nationalAvg: 245.00 },
    ] : []),

    // ── Exterior door install ──
    ...(inputs.includeExtDoorUnits ? [
      ...((extDoorEntryN + extDoorFrenchN) > 0 ? [{ label: "Entry / French Door — Install, Flash & Weather-Seal", qty: extDoorEntryN + extDoorFrenchN, unit: "ea", nationalAvg: 295.00 }] : []),
      ...(extDoorSliderN > 0 ? [{ label: "Sliding Glass Door — Install, Flash & Seal", qty: extDoorSliderN, unit: "ea", nationalAvg: 365.00 }] : []),
      ...((extDoorGarSingleN + extDoorGarDoubleN) > 0 ? [{ label: "Garage Door — Install, Springs & Opener Rough-In", qty: extDoorGarSingleN + extDoorGarDoubleN, unit: "ea", nationalAvg: 465.00 }] : []),
    ] : []),

    // ── Interior door install ──
    ...(inputs.includeIntDoorUnits && intDoors > 0 ? [
      { label: intDoorCfg.laborLabel, qty: intDoors, unit: "ea", nationalAvg: intDoorCfg.laborAvg },
    ] : []),

    // ── Trim install ──
    ...(inputs.includeTrim ? [
      ...(baseMoldingLF > 0 ? [{ label: "Base Molding Install", qty: baseMoldingLF, unit: "LF", nationalAvg: 4.85 }] : []),
      ...(inputs.includeIntDoorUnits && intDoors > 0 ? [{ label: "Door Casing Install (both sides)", qty: Math.ceil(intDoors * 18), unit: "LF", nationalAvg: 5.65 }] : []),
      ...(inputs.includeWindowUnits && windows > 0 ? [{ label: "Window Casing Install", qty: Math.ceil(windows * 12), unit: "LF", nationalAvg: 5.65 }] : []),
    ] : []),
  ];
}
function WallTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<WallInputs>(SK.wall, DEFAULT_WALL);
  const [project] = useProject();
  const tabInputs: WallInputs = { ...DEFAULT_WALL, ...rawInputs, studSize: migrateStudSize(rawInputs?.studSize) };
  const autoPerim = project.sqft ? String(Math.ceil(Math.sqrt(parseFloat(project.sqft)) * 4)) : "";
  const inputs: WallInputs = {
    ...tabInputs,
    linearFeet: tabInputs.linearFeet || project.linearFeet || autoPerim,
    stories: tabInputs.stories || project.stories || "1",
    buildingWidth: tabInputs.buildingWidth || project.buildingWidth,
    roofPitch: tabInputs.roofPitch || (project.roofPitch ? project.roofPitch.split(":")[0] : ""),
  };
  const laborItems = getWallLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.wallRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.wallMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.wallMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.wallLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.wallCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.wallCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => { setSavedRates({}); setSavedLabQtys({}); }, [setSavedRates, setSavedLabQtys]);
  const matItems = getWallMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatQtyChange = useCallback((label: string, val: string) => setSavedMatQtys(p => ({ ...p, [label]: val })), [setSavedMatQtys]);
  const handleLabQtyChange = useCallback((label: string, val: string) => setSavedLabQtys(p => ({ ...p, [label]: val })), [setSavedLabQtys]);
  const handleMatReset = useCallback(() => { setSavedMatPrices({}); setSavedMatQtys({}); }, [setSavedMatPrices, setSavedMatQtys]);
  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const hasResults = (parseFloat(inputs.linearFeet) || 0) > 0 || (parseFloat(inputs.interiorLF) || 0) > 0 ||
    (parseInt(inputs.intDoorCount) || 0) > 0 || (parseInt(inputs.extDoorCount) || 0) > 0 ||
    (parseInt(inputs.windowCount) || 0) > 0 || (parseFloat(inputs.blockingLF) || 0) > 0;

  const SectionHeader = ({ title, note }: { title: string; note?: string }) => (
    <div className="flex items-baseline gap-3 mb-4 mt-6 first:mt-0 pb-2 border-b border-[#E8E4DF]">
      <span className="text-xs font-black uppercase tracking-widest text-[#E85D26]">{title}</span>
      {note && <span className="text-xs text-[#AAA]">{note}</span>}
    </div>
  );

  const storiesCount = parseInt(inputs.stories ?? "1") || 1;
  const bwNum = parseFloat(inputs.buildingWidth) || 0;
  const pitchNum = parseFloat(inputs.roofPitch) || 0;
  const gableHeightDisplay = (bwNum > 0 && pitchNum > 0) ? ((pitchNum / 12) * (bwNum / 2)).toFixed(1) : null;

  return (
    <div>
      {canUndo && <div className="flex justify-end mb-3 no-print"><UndoBtn onUndo={undo} /></div>}
      {/* ── Exterior Walls ── */}
      <div className="no-print">
        <SectionHeader title="Exterior Walls" note="Choose stud size, sheathing, insulation & drywall" />
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Build Type">
            <select value={tabInputs.buildType ?? "full"} onChange={e => setInputs(p => ({ ...p, buildType: e.target.value as "full" | "addition", sharedWallLF: "" }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              <option value="full">Full Build (4 walls)</option>
              <option value="addition">Addition (3 walls — ties into existing)</option>
            </select>
          </Field>
          {(tabInputs.buildType ?? "full") === "addition" && (
            <Field label="Shared Wall Length (ft)" note="The existing wall you're tying into — not framed">
              <NumberInput value={tabInputs.sharedWallLF} onChange={v => setInputs(p => ({ ...p, sharedWallLF: v }))} placeholder="e.g. 20" />
            </Field>
          )}
          <Field label="Number of Stories">
            <select value={tabInputs.stories} onChange={e => setInputs(p => ({ ...p, stories: e.target.value }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              {!tabInputs.stories && project.stories && <option value="">↑ from project ({project.stories === "1" ? "1 story" : "2 stories"})</option>}
              {!tabInputs.stories && !project.stories && <option value="">— select —</option>}
              <option value="1">1 story</option>
              <option value="2">2 stories</option>
            </select>
            {!tabInputs.stories && project.stories && <ProjectBadge label={`from project: ${project.stories === "1" ? "1 story" : "2 stories"}`} />}
          </Field>
          <Field label="Exterior Wall Linear Feet" note={storiesCount > 1 ? "Enter perimeter for one floor — quantities auto-doubled" : undefined}>
            <NumberInput value={inputs.linearFeet} onChange={v => setInputs(p => ({ ...p, linearFeet: v }))} placeholder="e.g. 180" />
            {!tabInputs.linearFeet && project.linearFeet && <ProjectBadge />}
            {!tabInputs.linearFeet && !project.linearFeet && autoPerim && <ProjectBadge label="estimated from sqft" />}
          </Field>
          <Field label="Ceiling Height (ft)" note={storiesCount > 1 ? "Per floor" : undefined}>
            <select value={inputs.ceilingHeight} onChange={e => setInputs(p => ({ ...p, ceilingHeight: e.target.value }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              {["8", "9", "10", "11", "12"].map(h => <option key={h} value={h}>{h} ft</option>)}
            </select>
          </Field>
          <Field label="Stud Size &amp; Spacing" note="2×6 uses R-21 insulation regardless of spacing">
            <select value={inputs.studSize} onChange={e => setInputs(p => ({ ...p, studSize: e.target.value as StudSize }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              <option value="2x4-16">2×4 @ 16″ OC</option>
              <option value="2x6-16">2×6 @ 16″ OC</option>
              <option value="2x6-24">2×6 @ 24″ OC</option>
            </select>
          </Field>
          <div className="flex flex-col gap-4">
            <Toggle checked={inputs.exteriorSheathing} onChange={v => setInputs(p => ({ ...p, exteriorSheathing: v }))} label="Advantech Exterior Sheathing" />
            <Toggle checked={inputs.insulation} onChange={v => setInputs(p => ({ ...p, insulation: v }))} label={(inputs.studSize === "2x6-16" || inputs.studSize === "2x6-24") ? "Insulation (R-21 Batts)" : "Insulation (R-13 Batts)"} />
            <Toggle checked={inputs.drywall} onChange={v => setInputs(p => ({ ...p, drywall: v }))} label='Drywall — Exterior Walls (½", one side)' />
          </div>
        </div>

        {/* ── Gable Ends ── */}
        <SectionHeader title="Gable Ends" note="Triangular wall area at each end of the roof — uses same stud size & sheathing as exterior walls" />
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Building Width (ft)" note="Gable span — the narrow dimension of the building">
            <NumberInput value={inputs.buildingWidth} onChange={v => setInputs(p => ({ ...p, buildingWidth: v }))} placeholder="e.g. 28" />
            {!tabInputs.buildingWidth && project.buildingWidth && <ProjectBadge />}
          </Field>
          <Field label="Roof Pitch (rise per 12)" note={gableHeightDisplay ? `Gable height: ${gableHeightDisplay} ft` : "e.g. 6 = 6:12 pitch"}>
            <select value={tabInputs.roofPitch} onChange={e => setInputs(p => ({ ...p, roofPitch: e.target.value }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              {!tabInputs.roofPitch && project.roofPitch && <option value="">↑ from project ({project.roofPitch})</option>}
              {!tabInputs.roofPitch && !project.roofPitch && <option value="">— select —</option>}
              {["2","4","5","6","7","8","9","10","12"].map(p => <option key={p} value={p}>{p}:12</option>)}
            </select>
            {!tabInputs.roofPitch && project.roofPitch && <ProjectBadge label={`from project: ${project.roofPitch}`} />}
          </Field>
        </div>
        {!inputs.buildingWidth && (
          <p className="text-xs text-[#AAA] mt-2">Leave Building Width blank to skip gable end materials.</p>
        )}

        {/* ── Windows & Exterior Doors ── */}
        <SectionHeader title="Windows & Exterior Doors" note="Toggle to add unit costs, flashing & install labor" />

        {/* Windows panel */}
        <div className="mb-4">
          <Toggle checked={inputs.includeWindowUnits} onChange={v => setInputs(p => ({ ...p, includeWindowUnits: v }))} label="Price window units, flashing & install" />
          {inputs.includeWindowUnits && (
            <div className="mt-3 pl-4 border-l-2 border-[#E85D26]/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Window Count" note="Drives rough opening framing + unit cost">
                <NumberInput value={inputs.windowCount} onChange={v => setInputs(p => ({ ...p, windowCount: v }))} placeholder="e.g. 18" />
              </Field>
              <Field label="Window Type" note={`$${(WINDOW_TYPES[inputs.windowType] ?? WINDOW_TYPES.single_hung).price.toLocaleString()} / unit — override in table`}>
                <select value={inputs.windowType} onChange={e => setInputs(p => ({ ...p, windowType: e.target.value }))}
                  className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
                  {Object.entries(WINDOW_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label} — ${v.price.toLocaleString()}/ea</option>)}
                </select>
              </Field>
            </div>
          )}
          {!inputs.includeWindowUnits && (
            <div className="mt-2 pl-4">
              <Field label="Window Count" note="King + jack + cripple studs + 2×10 header + sill">
                <NumberInput value={inputs.windowCount} onChange={v => setInputs(p => ({ ...p, windowCount: v }))} placeholder="e.g. 18" />
              </Field>
            </div>
          )}
        </div>

        {/* Exterior Doors panel */}
        <div className="mb-4">
          <Toggle checked={inputs.includeExtDoorUnits} onChange={v => setInputs(p => ({ ...p, includeExtDoorUnits: v }))} label="Price exterior door units, flashing & install" />
          {inputs.includeExtDoorUnits && (
            <div className="mt-3 pl-4 border-l-2 border-[#E85D26]/30">
              <p className="text-xs text-[#AAA] mb-3">Enter count per type — totals drive rough opening framing automatically</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Field label="Entry Door" note="$595/ea">
                  <NumberInput value={inputs.extDoorEntryCount} onChange={v => setInputs(p => ({ ...p, extDoorEntryCount: v }))} placeholder="0" />
                </Field>
                <Field label="French Pair" note="$1,485/ea">
                  <NumberInput value={inputs.extDoorFrenchCount} onChange={v => setInputs(p => ({ ...p, extDoorFrenchCount: v }))} placeholder="0" />
                </Field>
                <Field label="Sliding Glass" note="$1,050/ea">
                  <NumberInput value={inputs.extDoorSliderCount} onChange={v => setInputs(p => ({ ...p, extDoorSliderCount: v }))} placeholder="0" />
                </Field>
                <Field label="Garage Single" note="$985/ea (9×7)">
                  <NumberInput value={inputs.extDoorGarSingleCount} onChange={v => setInputs(p => ({ ...p, extDoorGarSingleCount: v }))} placeholder="0" />
                </Field>
                <Field label="Garage Double" note="$1,595/ea (16×7)">
                  <NumberInput value={inputs.extDoorGarDoubleCount} onChange={v => setInputs(p => ({ ...p, extDoorGarDoubleCount: v }))} placeholder="0" />
                </Field>
              </div>
            </div>
          )}
          {!inputs.includeExtDoorUnits && (
            <div className="mt-2 pl-4">
              <Field label="Exterior Door Count" note="King + jack studs + 2×10 header + spacer">
                <NumberInput value={inputs.extDoorCount} onChange={v => setInputs(p => ({ ...p, extDoorCount: v }))} placeholder="e.g. 3" />
              </Field>
            </div>
          )}
        </div>

        {/* ── Interior Walls ── */}
        <SectionHeader title="Interior Walls" note="Always 2×4 @ 16″ OC — drywall applied both sides" />
        <div className="grid md:grid-cols-2 gap-6 mb-4">
          <Field label="Interior Wall Linear Feet">
            <NumberInput value={inputs.interiorLF} onChange={v => setInputs(p => ({ ...p, interiorLF: v }))} placeholder="e.g. 120" />
          </Field>
          <div className="flex items-end pb-1">
            <Toggle checked={inputs.interiorDrywall} onChange={v => setInputs(p => ({ ...p, interiorDrywall: v }))} label='Drywall — Interior Walls (½", both sides)' />
          </div>
        </div>

        {/* Interior Doors panel */}
        <div className="mb-4">
          <Toggle checked={inputs.includeIntDoorUnits} onChange={v => setInputs(p => ({ ...p, includeIntDoorUnits: v }))} label="Price interior door units & install" />
          {inputs.includeIntDoorUnits && (
            <div className="mt-3 pl-4 border-l-2 border-[#E85D26]/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Interior Door Count" note="Drives rough opening framing + unit cost">
                <NumberInput value={inputs.intDoorCount} onChange={v => setInputs(p => ({ ...p, intDoorCount: v }))} placeholder="e.g. 12" />
              </Field>
              <Field label="Door Type" note={`$${(INT_DOOR_TYPES[inputs.intDoorType] ?? INT_DOOR_TYPES.hollow_prehung).price}/unit — override in table`}>
                <select value={inputs.intDoorType} onChange={e => setInputs(p => ({ ...p, intDoorType: e.target.value }))}
                  className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
                  {Object.entries(INT_DOOR_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label} — ${v.price}/ea</option>)}
                </select>
              </Field>
            </div>
          )}
          {!inputs.includeIntDoorUnits && (
            <div className="mt-2 pl-4">
              <Field label="Interior Door Count" note="King + jack studs + 2×10 header">
                <NumberInput value={inputs.intDoorCount} onChange={v => setInputs(p => ({ ...p, intDoorCount: v }))} placeholder="e.g. 12" />
              </Field>
            </div>
          )}
        </div>

        {/* Trim panel */}
        <div className="mb-4">
          <Toggle checked={inputs.includeTrim} onChange={v => setInputs(p => ({ ...p, includeTrim: v }))} label="Include interior trim (base molding & door/window casing)" />
          {inputs.includeTrim && (
            <div className="mt-3 pl-4 border-l-2 border-[#E85D26]/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Trim Style" note="Applies to base molding & all casing">
                <select value={inputs.trimStyle} onChange={e => setInputs(p => ({ ...p, trimStyle: e.target.value }))}
                  className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
                  {Object.entries(TRIM_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label} — base ${v.basePrice}/LF, casing ${v.casingPrice}/LF</option>)}
                </select>
              </Field>
              <Field label="Base Molding (LF)" note="Measure total perimeter of all finished rooms">
                <NumberInput value={inputs.baseMoldingLF} onChange={v => setInputs(p => ({ ...p, baseMoldingLF: v }))} placeholder="e.g. 480" />
              </Field>
              {(inputs.includeIntDoorUnits || inputs.includeWindowUnits) && (
                <div className="sm:col-span-2 text-xs text-[#888] bg-[#FAF8F5] border border-[#E8E4DF] px-3 py-2">
                  Door casing auto-computed: {(parseInt(inputs.intDoorCount)||0)} doors × 18 LF = {(parseInt(inputs.intDoorCount)||0)*18} LF
                  {inputs.includeWindowUnits && ` · Window casing: ${(parseInt(inputs.windowCount)||0)} windows × 12 LF = ${(parseInt(inputs.windowCount)||0)*12} LF`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Wall Blocking ── */}
        <SectionHeader title="Wall Blocking" note="2×10 nailer blocking for cabinets, vanities &amp; wall-mounted fixtures" />
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Blocking Linear Feet" note="Measure each run of cabinets, vanity walls, grab bars, TV mounts, etc.">
            <NumberInput value={inputs.blockingLF} onChange={v => setInputs(p => ({ ...p, blockingLF: v }))} placeholder="e.g. 45" />
          </Field>
        </div>
      </div>

      {hasResults ? (
        <div className="mt-8 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} qtys={savedMatQtys} onQtyChange={handleMatQtyChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} qtys={savedLabQtys} onQtyChange={handleLabQtyChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Enter exterior or interior wall dimensions above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   FLOOR TAB
───────────────────────────────────────────── */
type AdhesiveType = "liquid" | "spray";
type JoistType = "2x10" | "2x12" | "tji_9.5" | "tji_11.875" | "tji_14";
type JoistSpacing = "12" | "16" | "19.2" | "24";
type RimType = "solid" | "advantech";
type BeamType = "none" | "triple_2x12" | "lvl_3.5x9.5" | "lvl_3.5x11.25" | "lvl_5.25x9.5" | "lvl_5.25x11.25";

interface FloorInputs {
  buildingWidth: string;
  buildingLength: string;
  finish: string;
  includeSubfloor: boolean;
  adhesiveType: AdhesiveType;
  includeFraming: boolean;
  joistType: JoistType;
  joistSpacing: JoistSpacing;
  rimType: RimType;
  beamType: BeamType;
  beamCount: string;
  stories: string;
  includeBasementStairs: boolean;
  basementRisers: string;
  includeInteriorStairs: boolean;
  interiorRisers: string;
}

const FLOOR_MAT_PRICES: Record<string, number> = { lvp: 3.45, carpet: 2.65, carpet_pad: 3.25, hardwood: 7.45, tile: 4.25, none: 0 };
const FLOOR_LABELS: Record<string, string> = { lvp: "LVP — Luxury Vinyl Plank", carpet: "Carpet", carpet_pad: "Carpet w/ Pad — Mid-Grade", hardwood: "Hardwood", tile: "Ceramic / Porcelain Tile", none: "None" };
const FLOOR_LABOR: Record<string, number> = { lvp: 4.85, carpet: 2.45, carpet_pad: 2.75, hardwood: 9.85, tile: 14.50, none: 0 };

const JOIST_LABEL: Record<JoistType, string> = {
  "2x10":       '2×10 Floor Joists',
  "2x12":       '2×12 Floor Joists',
  "tji_9.5":    'TJI 9-1/2" Engineered I-Joists',
  "tji_11.875": 'TJI 11-7/8" Engineered I-Joists',
  "tji_14":     'TJI 14" Engineered I-Joists',
};
const JOIST_PRICE: Record<JoistType, number> = {
  "2x10": 2.25, "2x12": 2.95,
  "tji_9.5": 2.85, "tji_11.875": 3.85, "tji_14": 4.95,
};
const JOIST_SPACING_FT: Record<JoistSpacing, number> = { "12": 1.0, "16": 4 / 3, "19.2": 1.6, "24": 2.0 };

const JOIST_MAX_SPAN: Record<JoistType, Record<JoistSpacing, number>> = {
  "2x10":       { "12": 16.4, "16": 14.9, "19.2": 13.8, "24": 12.2 },
  "2x12":       { "12": 19.8, "16": 18.0, "19.2": 16.5, "24": 14.9 },
  "tji_9.5":    { "12": 20.5, "16": 18.5, "19.2": 17.0, "24": 15.0 },
  "tji_11.875": { "12": 24.5, "16": 22.0, "19.2": 20.0, "24": 18.0 },
  "tji_14":     { "12": 28.0, "16": 25.5, "19.2": 23.5, "24": 21.0 },
};

const BEAM_LABEL: Record<string, string> = {
  "triple_2x12":    'Triple 2×12 Built-Up Beam',
  "lvl_3.5x9.5":   'LVL Beam 3-1/2"×9-1/2"',
  "lvl_3.5x11.25":  'LVL Beam 3-1/2"×11-1/4"',
  "lvl_5.25x9.5":  'LVL Beam 5-1/4"×9-1/2"',
  "lvl_5.25x11.25": 'LVL Beam 5-1/4"×11-1/4"',
};
const BEAM_PRICE: Record<string, number> = {
  "triple_2x12": 2.95,
  "lvl_3.5x9.5": 10.50, "lvl_3.5x11.25": 13.50,
  "lvl_5.25x9.5": 15.50, "lvl_5.25x11.25": 19.50,
};

const DEFAULT_FLOOR: FloorInputs = {
  buildingWidth: "", buildingLength: "", finish: "lvp", includeSubfloor: true, adhesiveType: "liquid",
  includeFraming: false, joistType: "2x10", joistSpacing: "16",
  rimType: "advantech", beamType: "none", beamCount: "1",
  stories: "",
  includeBasementStairs: false, basementRisers: "13",
  includeInteriorStairs: false, interiorRisers: "14",
};

const ADHESIVE_CONFIG: Record<AdhesiveType, { label: string; coverage: number; unit: string; price: number }> = {
  liquid: { label: "Subfloor Construction Adhesive (28 oz tube)", coverage: 83,  unit: "tube", price: 9.85  },
  spray:  { label: "Subfloor Construction Adhesive (Spray)",      coverage: 365, unit: "can",  price: 32.98 },
};

const STD_LUMBER_LENGTHS = [8, 10, 12, 14, 16, 18, 20];
const STD_LVL_LENGTHS   = [12, 14, 16, 18, 20];

function boardSplit(runLF: number, stdLengths: number[], primaryPrefs: number[]): number[] {
  if (runLF <= 0) return [];
  const single = stdLengths.find(l => l >= runLF);
  if (single) return [single];
  for (const l1 of primaryPrefs) {
    const minL2 = runLF - l1 + 2;
    const l2 = stdLengths.find(l => l >= minL2);
    if (l2) return [l1, l2];
  }
  return [stdLengths[stdLengths.length - 1], stdLengths[stdLengths.length - 1]];
}

type LVLConfig = { plies: number; pieceLabel: string; pricePerPlyLF: number };
const LVL_CONFIG: Record<string, LVLConfig> = {
  "lvl_3.5x9.5":   { plies: 2, pieceLabel: '1-3/4"×9-1/2" LVL',   pricePerPlyLF: 5.25 },
  "lvl_3.5x11.25": { plies: 2, pieceLabel: '1-3/4"×11-1/4" LVL',  pricePerPlyLF: 6.75 },
  "lvl_5.25x9.5":  { plies: 3, pieceLabel: '1-3/4"×9-1/2" LVL',   pricePerPlyLF: 5.17 },
  "lvl_5.25x11.25":{ plies: 3, pieceLabel: '1-3/4"×11-1/4" LVL',  pricePerPlyLF: 6.42 },
};

function getFloorFramingMatItems(inputs: FloorInputs): MatItem[] {
  if (!inputs.includeFraming) return [];
  const span = parseFloat(inputs.buildingWidth) || 0;
  const runLength = parseFloat(inputs.buildingLength) || 0;
  if (span === 0 || runLength === 0) return [];
  const sqft = span * runLength;
  const storiesCount = parseInt(inputs.stories ?? "1") || 1;

  const spacingFt = JOIST_SPACING_FT[inputs.joistSpacing ?? "16"] ?? (4 / 3);
  const joistCount = Math.ceil(runLength / spacingFt) + 1;
  const joistLF = Math.ceil(joistCount * (span + 1) * WASTE) * storiesCount;
  const rimLF = Math.ceil((2 * runLength + 2 * span) * WASTE) * storiesCount;
  const beamCount = Math.max(1, parseInt(inputs.beamCount) || 1);
  const beamRunLF = Math.ceil(runLength * WASTE);
  const isTJI = inputs.joistType.startsWith("tji");

  const floorLabel = storiesCount > 1 ? " (both floors)" : "";
  const items: MatItem[] = [];

  items.push({ label: JOIST_LABEL[inputs.joistType] + floorLabel, qty: joistLF, unit: "LF", price: JOIST_PRICE[inputs.joistType] });

  if (inputs.rimType === "advantech") {
    items.push({ label: 'Advantech 1-1/8" Rim Board' + floorLabel, qty: rimLF, unit: "LF", price: 5.85 });
  } else {
    const rimLabel = (inputs.joistType === "2x10" ? '2×10 Solid Lumber Rim Joist'
      : inputs.joistType === "2x12" ? '2×12 Solid Lumber Rim Joist'
      : 'LVL Rim Board (matches TJI depth)') + floorLabel;
    const rimPrice = inputs.joistType === "2x10" ? 1.85 : inputs.joistType === "2x12" ? 2.45 : 6.50;
    items.push({ label: rimLabel, qty: rimLF, unit: "LF", price: rimPrice });
  }

  if (inputs.beamType !== "none") {
    if (inputs.beamType === "triple_2x12") {
      const plies = 3 * beamCount;
      const split = boardSplit(runLength, STD_LUMBER_LENGTHS, [16, 18, 20]);
      const tally = split.reduce<Record<number, number>>((a, l) => ({ ...a, [l]: (a[l] ?? 0) + 1 }), {});
      Object.entries(tally).forEach(([lenStr, count]) => {
        const len = Number(lenStr);
        items.push({
          label: `Triple 2×12 Beam — 2×12×${len}' Boards`,
          qty: plies * count,
          unit: "ea",
          price: parseFloat((2.45 * len).toFixed(2)),
        });
      });
    } else {
      const lvl = LVL_CONFIG[inputs.beamType];
      if (lvl) {
        const totalPlies = lvl.plies * beamCount;
        const split = boardSplit(runLength, STD_LVL_LENGTHS, [20, 18, 16]);
        const tally = split.reduce<Record<number, number>>((a, l) => ({ ...a, [l]: (a[l] ?? 0) + 1 }), {});
        Object.entries(tally).forEach(([lenStr, count]) => {
          const len = Number(lenStr);
          items.push({
            label: `${lvl.pieceLabel} — ${len}' Pieces (staggered)`,
            qty: totalPlies * count,
            unit: "ea",
            price: parseFloat((lvl.pricePerPlyLF * len).toFixed(2)),
          });
        });
      }
    }
    items.push({ label: "Beam Post Caps & Saddle Hardware", qty: beamCount * 3, unit: "ea", price: 22.50 });
  }

  const hangerQty = Math.max(0, joistCount - 2) * storiesCount;
  if (hangerQty > 0) {
    items.push({
      label: (isTJI ? 'TJI Joist Hangers (IUS / ILTUS Series)' : 'Joist Hangers (LUS Series)') + floorLabel,
      qty: hangerQty, unit: "ea", price: isTJI ? 4.65 : 3.65,
    });
  }

  if (!isTJI && span > 10) {
    const blockLF = Math.ceil(joistCount * 1.5 * WASTE) * storiesCount;
    const blockLabel = (inputs.joistType === "2x10" ? '2×10 Solid Blocking' : '2×12 Solid Blocking') + floorLabel;
    items.push({ label: blockLabel, qty: blockLF, unit: "LF", price: JOIST_PRICE[inputs.joistType] });
  }

  if (inputs.includeBasementStairs) {
    const risers = Math.max(3, parseInt(inputs.basementRisers) || 13);
    items.push({ label: 'Basement Stair — 2×12 Stringers (14 ft)', qty: 3, unit: "ea", price: 62.98 });
    items.push({ label: 'Basement Stair — 2×12 Treads', qty: risers - 1, unit: "ea", price: 11.98 });
    items.push({ label: "Basement Stair Framing Hardware & Fasteners", qty: 1, unit: "lot", price: 58.00 });
  }

  if (inputs.includeInteriorStairs) {
    const risers = Math.max(3, parseInt(inputs.interiorRisers) || 14);
    items.push({ label: 'Interior Stair — 2×12 Stringers (14 ft)', qty: 3, unit: "ea", price: 62.98 });
    items.push({ label: 'Interior Stair — 2×12 Treads', qty: risers - 1, unit: "ea", price: 11.98 });
    items.push({ label: 'Interior Stair Opening — Double 2×10 Header', qty: 10, unit: "LF", price: 2.95 });
    items.push({ label: "Interior Stair Framing Hardware & Fasteners", qty: 1, unit: "lot", price: 72.00 });
  }

  return items;
}

function getFloorFramingLaborItems(inputs: FloorInputs): LaborItem[] {
  if (!inputs.includeFraming) return [];
  const span = parseFloat(inputs.buildingWidth) || 0;
  const runLength = parseFloat(inputs.buildingLength) || 0;
  if (span === 0 || runLength === 0) return [];
  const sqft = span * runLength;
  const storiesCount = parseInt(inputs.stories ?? "1") || 1;
  const floorLabel = storiesCount > 1 ? " (both floors)" : "";

  const rimLF = Math.ceil(2 * runLength + 2 * span) * storiesCount;
  const beamCount = Math.max(1, parseInt(inputs.beamCount) || 1);
  const beamLF = Math.ceil(runLength) * beamCount;
  const items: LaborItem[] = [];

  items.push({ label: "Floor Joist Framing & Layout" + floorLabel, qty: sqft * storiesCount, unit: "sqft", nationalAvg: 3.45 });
  items.push({ label: "Rim / Band Joist Install" + floorLabel, qty: rimLF, unit: "LF", nationalAvg: 2.85 });

  if (inputs.beamType !== "none") {
    items.push({ label: "Main Beam Set & Hardware", qty: beamLF, unit: "LF", nationalAvg: 8.25 });
  }

  if (inputs.includeBasementStairs) {
    items.push({ label: "Basement Stair Rough Framing", qty: 1, unit: "ea", nationalAvg: 685 });
  }

  if (inputs.includeInteriorStairs) {
    items.push({ label: "Interior Stair Rough Framing & Opening", qty: 1, unit: "ea", nationalAvg: 865 });
  }

  return items;
}

function getFloorMatItems(inputs: FloorInputs): MatItem[] {
  const sqft = (parseFloat(inputs.buildingWidth) || 0) * (parseFloat(inputs.buildingLength) || 0);
  const storiesCount = parseInt(inputs.stories ?? "1") || 1;
  const totalSqft = sqft * storiesCount;
  const floorLabel = storiesCount > 1 ? " (both floors)" : "";
  const adhesive = ADHESIVE_CONFIG[inputs.adhesiveType ?? "liquid"];
  return [
    ...getFloorFramingMatItems(inputs),
    ...(inputs.includeSubfloor ? [
      { label: `Advantech 3/4" Subfloor Panel (4×8)${floorLabel}`, qty: Math.ceil(totalSqft * WASTE / 32), unit: "sheet", price: 58.98 },
      { label: adhesive.label + floorLabel, qty: Math.max(1, Math.ceil(totalSqft * WASTE / adhesive.coverage)), unit: adhesive.unit, price: adhesive.price },
    ] : []),
    ...(inputs.finish === "carpet_pad" ? [
      { label: `Carpet — Mid-Grade Broadloom (26 oz face wt)${floorLabel}`, qty: Math.ceil(totalSqft * WASTE), unit: "sqft", price: 3.25 },
      { label: `Carpet Pad — 6 lb Rebond 7/16"${floorLabel}`, qty: Math.ceil(totalSqft * WASTE), unit: "sqft", price: 0.75 },
    ] : inputs.finish !== "none" ? [
      { label: FLOOR_LABELS[inputs.finish] + floorLabel, qty: Math.ceil(totalSqft * WASTE), unit: "sqft", price: FLOOR_MAT_PRICES[inputs.finish] ?? 0 },
    ] : []),
  ];
}
function getFloorLaborItems(inputs: FloorInputs): LaborItem[] {
  const sqft = Math.round((parseFloat(inputs.buildingWidth) || 0) * (parseFloat(inputs.buildingLength) || 0));
  const storiesCount = parseInt(inputs.stories ?? "1") || 1;
  const totalSqft = sqft * storiesCount;
  const floorLabel = storiesCount > 1 ? " (both floors)" : "";
  return [
    ...getFloorFramingLaborItems(inputs),
    ...(inputs.includeSubfloor ? [{ label: `Advantech Subfloor Install (glued & screwed)${floorLabel}`, qty: totalSqft, unit: "sqft", nationalAvg: 1.85 }] : []),
    ...(inputs.finish !== "none" ? [{ label: `${FLOOR_LABELS[inputs.finish]} Installation${floorLabel}`, qty: totalSqft, unit: "sqft", nationalAvg: FLOOR_LABOR[inputs.finish] ?? 0 }] : []),
  ];
}

function FloorTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<FloorInputs>(SK.floor, DEFAULT_FLOOR);
  const [project] = useProject();
  const tabInputs: FloorInputs = { ...DEFAULT_FLOOR, ...rawInputs };
  const fpSqft = parseFloat(project.footprintSqft || project.sqft) || 0;
  const autoFloorW = fpSqft > 0 ? String(Math.ceil(Math.sqrt(fpSqft))) : "";
  const autoFloorL = fpSqft > 0 && autoFloorW ? String(Math.ceil(fpSqft / Math.ceil(Math.sqrt(fpSqft)))) : "";
  const inputs: FloorInputs = {
    ...tabInputs,
    buildingWidth: tabInputs.buildingWidth || project.buildingWidth || autoFloorW,
    buildingLength: tabInputs.buildingLength || project.buildingLength || autoFloorL,
    stories: tabInputs.stories || project.stories || "1",
  };
  const set = useCallback(<K extends keyof FloorInputs>(k: K, v: FloorInputs[K]) => setInputs(p => ({ ...p, [k]: v })), [setInputs]);
  const laborItems = getFloorLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.floorRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.floorMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.floorMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.floorLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.floorCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.floorCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => { setSavedRates({}); setSavedLabQtys({}); }, [setSavedRates, setSavedLabQtys]);
  const matItems = getFloorMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatQtyChange = useCallback((label: string, val: string) => setSavedMatQtys(p => ({ ...p, [label]: val })), [setSavedMatQtys]);
  const handleLabQtyChange = useCallback((label: string, val: string) => setSavedLabQtys(p => ({ ...p, [label]: val })), [setSavedLabQtys]);
  const handleMatReset = useCallback(() => { setSavedMatPrices({}); setSavedMatQtys({}); }, [setSavedMatPrices, setSavedMatQtys]);
  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const widthVal  = parseFloat(inputs.buildingWidth)  || 0;
  const lengthVal = parseFloat(inputs.buildingLength) || 0;
  const sqftVal   = widthVal * lengthVal;
  const hasResults = sqftVal > 0;
  const framingMissing = inputs.includeFraming && (widthVal === 0 || lengthVal === 0);
  const maxSpan = JOIST_MAX_SPAN[inputs.joistType]?.[inputs.joistSpacing] ?? 0;
  const beamNeeded = widthVal > 0 && maxSpan > 0 && widthVal > maxSpan;

  return (
    <div>
      {canUndo && <div className="flex justify-end mb-3 no-print"><UndoBtn onUndo={undo} /></div>}
      <div className="flex flex-col gap-6 no-print">

        {/* ── Building dimensions + story count ── */}
        <div className="grid md:grid-cols-3 gap-6">
          <Field label="Building Width (ft)" note="Clear span direction — joists run this way">
            <NumberInput value={inputs.buildingWidth} onChange={v => set("buildingWidth", v)} placeholder="e.g. 28" />
            {!tabInputs.buildingWidth && project.buildingWidth && <ProjectBadge />}
            {!tabInputs.buildingWidth && !project.buildingWidth && autoFloorW && <ProjectBadge label="estimated from sqft" />}
          </Field>
          <Field label="Building Length (ft)" note="Beam run direction — parallel to the beam">
            <NumberInput value={inputs.buildingLength} onChange={v => set("buildingLength", v)} placeholder="e.g. 48" />
            {!tabInputs.buildingLength && project.buildingLength && <ProjectBadge />}
            {!tabInputs.buildingLength && !project.buildingLength && autoFloorL && <ProjectBadge label="estimated from sqft" />}
          </Field>
          <Field
            label="Floor Area (sq ft)"
            note={sqftVal > 0 ? `${widthVal} × ${lengthVal} = ${sqftVal.toLocaleString()} SF` : "Auto-calculated from width × length"}
          >
            <div className="w-full bg-[#F0EDE8] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] font-medium">
              {sqftVal > 0 ? sqftVal.toLocaleString() + " SF" : "—"}
            </div>
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Number of Stories">
            <select value={tabInputs.stories} onChange={e => set("stories", e.target.value)} className={SELECT_CLS}>
              {!tabInputs.stories && project.stories && <option value="">↑ from project ({project.stories === "1" ? "1 story" : "2 stories"})</option>}
              {!tabInputs.stories && !project.stories && <option value="">— select —</option>}
              <option value="1">1 Story</option>
              <option value="2">2 Stories</option>
            </select>
            {!tabInputs.stories && project.stories && <ProjectBadge label={`from project: ${project.stories === "1" ? "1 story" : "2 stories"}`} />}
          </Field>
        </div>

        {/* ── Floor system framing ── */}
        <div className="border border-[#DDD8D0] p-4 flex flex-col gap-4">
          <Toggle
            checked={inputs.includeFraming}
            onChange={v => set("includeFraming", v)}
            label="Include Floor System Framing (joists, rim board, beam, stairs)"
          />
          {inputs.includeFraming && (
            <>
              {framingMissing && (
                <div className="border border-[#E85D26] bg-[#FFF8F5] px-3 py-2 text-sm text-[#E85D26]">
                  ⚠ Enter Building Width and Length above to calculate framing quantities.
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Joist Type">
                  <select value={inputs.joistType} onChange={e => set("joistType", e.target.value as JoistType)} className={SELECT_CLS}>
                    <option value="2x10">2×10 Solid Lumber</option>
                    <option value="2x12">2×12 Solid Lumber</option>
                    <option value="tji_9.5">TJI 9-1/2" Engineered I-Joist</option>
                    <option value="tji_11.875">TJI 11-7/8" Engineered I-Joist</option>
                    <option value="tji_14">TJI 14" Engineered I-Joist</option>
                  </select>
                </Field>
                <Field label="Joist Spacing (OC)">
                  <select value={inputs.joistSpacing} onChange={e => set("joistSpacing", e.target.value as JoistSpacing)} className={SELECT_CLS}>
                    <option value="12">12" O.C.</option>
                    <option value="16">16" O.C.</option>
                    <option value="19.2">19.2" O.C.</option>
                    <option value="24">24" O.C.</option>
                  </select>
                </Field>
                <Field label="Rim / Band Joist Type">
                  <select value={inputs.rimType} onChange={e => set("rimType", e.target.value as RimType)} className={SELECT_CLS}>
                    <option value="advantech">Advantech 1-1/8" Rim Board</option>
                    <option value="solid">Solid Lumber (matches joist) / LVL Rim</option>
                  </select>
                </Field>
                <Field
                  label="Main Beam Type"
                  note={
                    widthVal === 0 ? "Enter Building Width above to see if a beam is required" :
                    beamNeeded
                      ? `⚠ ${widthVal} ft exceeds max (${maxSpan} ft) — beam required to support joists`
                      : `✓ ${widthVal} ft is within max span (${maxSpan} ft) — no beam needed`
                  }
                >
                  <select value={inputs.beamType} onChange={e => set("beamType", e.target.value as BeamType)} className={SELECT_CLS}>
                    <option value="none">No Beam — joists span full width</option>
                    <option value="triple_2x12">Triple 2×12 Built-Up Beam</option>
                    <option value="lvl_3.5x9.5">LVL 3-1/2"×9-1/2"</option>
                    <option value="lvl_3.5x11.25">LVL 3-1/2"×11-1/4"</option>
                    <option value="lvl_5.25x9.5">LVL 5-1/4"×9-1/2"</option>
                    <option value="lvl_5.25x11.25">LVL 5-1/4"×11-1/4"</option>
                  </select>
                </Field>
                {inputs.beamType !== "none" && (
                  <Field label="Number of Beams" note="Parallel beams subdividing the span">
                    <select value={inputs.beamCount} onChange={e => set("beamCount", e.target.value)} className={SELECT_CLS}>
                      <option value="1">1 beam</option>
                      <option value="2">2 beams</option>
                      <option value="3">3 beams</option>
                    </select>
                  </Field>
                )}
              </div>

              {/* Stair systems */}
              <div className="flex flex-col gap-3 pt-1 border-t border-[#EEE]">
                <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">Stair Systems</p>
                <Toggle
                  checked={inputs.includeBasementStairs ?? false}
                  onChange={v => set("includeBasementStairs", v)}
                  label="Basement / Crawl Space Stair System"
                />
                {inputs.includeBasementStairs && (
                  <Field label="Number of Risers" note="Typical 8 ft basement = 13 risers">
                    <NumberInput value={inputs.basementRisers ?? "13"} onChange={v => set("basementRisers", v)} placeholder="13" />
                  </Field>
                )}
                {(inputs.stories ?? "1") === "2" && (
                  <>
                    <Toggle
                      checked={inputs.includeInteriorStairs ?? false}
                      onChange={v => set("includeInteriorStairs", v)}
                      label="Interior Stair — 1st to 2nd Floor"
                    />
                    {inputs.includeInteriorStairs && (
                      <Field label="Number of Risers" note="Typical 9 ft 1st floor = 14 risers">
                        <NumberInput value={inputs.interiorRisers ?? "14"} onChange={v => set("interiorRisers", v)} placeholder="14" />
                      </Field>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Subfloor ── */}
        <div className="flex flex-col gap-4">
          <Toggle checked={inputs.includeSubfloor} onChange={v => set("includeSubfloor", v)} label={'Include Advantech 3/4" Subfloor'} />
          {inputs.includeSubfloor && (
            <Field label="Subfloor Adhesive Type">
              <select value={inputs.adhesiveType ?? "liquid"} onChange={e => set("adhesiveType", e.target.value as AdhesiveType)} className={SELECT_CLS}>
                <option value="liquid">Liquid — 28 oz tube (~83 sqft/tube)</option>
                <option value="spray">Spray can (~365 sqft/can)</option>
              </select>
            </Field>
          )}
        </div>

        {/* ── Finish flooring ── */}
        <Field label="Finish Flooring Type">
          <select value={inputs.finish} onChange={e => set("finish", e.target.value)} className={SELECT_CLS}>
            <option value="lvp">LVP — Luxury Vinyl Plank</option>
            <option value="carpet">Carpet (budget broadloom)</option>
            <option value="carpet_pad">Carpet w/ Pad — Mid-Grade</option>
            <option value="hardwood">Hardwood</option>
            <option value="tile">Ceramic / Porcelain Tile</option>
            <option value="none">None (subfloor only)</option>
          </select>
        </Field>

      </div>
      {hasResults ? (
        <div className="mt-8 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} qtys={savedMatQtys} onQtyChange={handleMatQtyChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} qtys={savedLabQtys} onQtyChange={handleLabQtyChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Enter floor area above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ROOF TAB
───────────────────────────────────────────── */
interface RoofInputs {
  footprintSqft: string; pitch: string; archShingles: boolean; iceWater: boolean; includeDecking: boolean;
  roofSystem: "truss" | "rafter";
  roofType: "pitched" | "shed";
  rafterSize: "" | "2x8" | "2x10" | "2x12";
  buildingWidth: string;
  buildingLength: string;
  roofSpacing: "16" | "24";
}
const PITCH_FACTORS: Record<string, number> = { "2:12": 1.014, "4:12": 1.054, "5:12": 1.083, "6:12": 1.118, "7:12": 1.158, "8:12": 1.202, "9:12": 1.250, "10:12": 1.302, "12:12": 1.414 };
const DEFAULT_ROOF: RoofInputs = { footprintSqft: "", pitch: "", archShingles: true, iceWater: true, includeDecking: false, roofSystem: "truss", roofType: "pitched", rafterSize: "", buildingWidth: "", buildingLength: "", roofSpacing: "24" };

// Truss price by full span
const TRUSS_PRICE_TIERS: { maxSpan: number; price: number }[] = [
  { maxSpan: 24, price: 215 }, { maxSpan: 32, price: 298 },
  { maxSpan: 40, price: 405 }, { maxSpan: 48, price: 525 },
  { maxSpan: Infinity, price: 648 },
];
function trussUnitPrice(span: number): number {
  return TRUSS_PRICE_TIERS.find(t => span <= t.maxSpan)?.price ?? 525;
}
// Rafter / ceiling joist config by half-span
const RAFTER_CFG: { maxHalfSpan: number; rSize: string; rPrice: number; rdgSize: string; rdgPrice: number; cjSize: string; cjPrice: number }[] = [
  { maxHalfSpan: 14, rSize: "2×8",  rPrice: 22.98, rdgSize: "2×10", rdgPrice: 29.98, cjSize: "2×8",  cjPrice: 22.98 },
  { maxHalfSpan: 18, rSize: "2×10", rPrice: 29.98, rdgSize: "2×12", rdgPrice: 38.98, cjSize: "2×10", cjPrice: 29.98 },
  { maxHalfSpan: Infinity, rSize: "2×12", rPrice: 38.98, rdgSize: "2×12", rdgPrice: 38.98, cjSize: "2×12", cjPrice: 38.98 },
];
function rafterCfg(span: number) { return RAFTER_CFG.find(r => span <= r.maxHalfSpan) ?? RAFTER_CFG[RAFTER_CFG.length - 1]; }
const RAFTER_SIZE_CFG: Record<string, typeof RAFTER_CFG[0]> = {
  "2x8":  { maxHalfSpan: 14,       rSize: "2×8",  rPrice: 22.98, rdgSize: "2×10", rdgPrice: 29.98, cjSize: "2×8",  cjPrice: 22.98 },
  "2x10": { maxHalfSpan: 18,       rSize: "2×10", rPrice: 29.98, rdgSize: "2×12", rdgPrice: 38.98, cjSize: "2×10", cjPrice: 29.98 },
  "2x12": { maxHalfSpan: Infinity, rSize: "2×12", rPrice: 38.98, rdgSize: "2×12", rdgPrice: 38.98, cjSize: "2×12", cjPrice: 38.98 },
};
function resolveRc(rafterSize: string, span: number) {
  return (rafterSize && RAFTER_SIZE_CFG[rafterSize]) ? RAFTER_SIZE_CFG[rafterSize] : rafterCfg(span);
}
const STD_BOARD_LENGTHS = [8, 10, 12, 14, 16, 18, 20];
function nextStdLen(lf: number): number { return STD_BOARD_LENGTHS.find(l => l >= lf) ?? 20; }

function getRoofMatItems(inputs: RoofInputs): MatItem[] {
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actual = fp * factor;
  const bw = parseFloat(inputs.buildingWidth) || 0;
  const bl = parseFloat(inputs.buildingLength) || 0;
  const spacing = parseInt(inputs.roofSpacing ?? "24") || 24;
  const spacingFt = spacing / 12;
  const hasFraming = bw > 0 && bl > 0;

  const roofSystem = inputs.roofSystem ?? "truss";
  const framingItems: MatItem[] = [];
  if (hasFraming) {
    if (roofSystem === "truss") {
      const trussCount = Math.ceil(bl / spacingFt) + 1;
      const tPrice = trussUnitPrice(bw);
      framingItems.push(
        { label: `Prefab Gable Roof Trusses — ${bw.toFixed(0)}' Span (${spacing}" OC)`, qty: trussCount, unit: "ea", price: tPrice },
        { label: `Gable End Trusses — Ladder Frame (${bw.toFixed(0)}' Span)`, qty: 2, unit: "ea", price: Math.round(tPrice * 1.15) },
        { label: "Hurricane Ties — H2.5A Truss Clip (2 per truss, both bearing walls)", qty: trussCount * 2, unit: "ea", price: 2.25 },
        { label: "Structural Screws — Truss to Top Plate (box)", qty: Math.max(1, Math.ceil(trussCount / 15)), unit: "box", price: 21.98 },
        { label: "2×4×16 Temporary Bracing Lumber", qty: Math.max(2, Math.ceil(bl / 16) * 3), unit: "ea", price: 11.98 },
      );
    } else if ((inputs.roofType ?? "pitched") === "shed") {
      // Shed (single-slope) rafter system — full-width span, ledger at high side, no ridge/collar ties/ceiling joists
      const rc = resolveRc(inputs.rafterSize ?? "", bw);
      const rafterRunFt = bw + 2; // full span + overhang tail
      const rafterBoardLen = nextStdLen(rafterRunFt * factor);
      const rafterCount = Math.ceil(bl / spacingFt) + 1;

      // Ledger board fastened to existing wall at high side
      const ledgerLF = bl + 2;
      const ledgerBoardLen = nextStdLen(ledgerLF <= 16 ? ledgerLF : 20);
      const ledgerCount = Math.ceil(ledgerLF / ledgerBoardLen);

      framingItems.push(
        { label: `${rc.rSize}×${rafterBoardLen}' Shed Rafters (${spacing}" OC, single slope, ${bw.toFixed(0)}' span)`, qty: Math.ceil(rafterCount * WASTE), unit: "ea", price: rc.rPrice },
        { label: `${rc.rdgSize}×${ledgerBoardLen}' Ledger Board — High Side`, qty: ledgerCount, unit: "ea", price: rc.rdgPrice },
        { label: "Hurricane Ties — H2.5A Rafter Clip (1 per rafter at plate)", qty: rafterCount, unit: "ea", price: 2.25 },
        { label: "Structural Screws — Ledger & Rafter (box)", qty: Math.max(1, Math.ceil(rafterCount / 40)), unit: "box", price: 21.98 },
        { label: "Ring Shank Nails — Rafter to Plate (box)", qty: Math.max(1, Math.ceil(rafterCount / 50)), unit: "box", price: 17.98 },
      );
    } else {
      // Pitched (gable) rafter system
      const halfSpan = bw / 2;
      const rc = resolveRc(inputs.rafterSize ?? "", halfSpan);
      const rafterRunFt = halfSpan + 2; // +2 ft rafter tail / overhang
      const rafterBoardLen = nextStdLen(rafterRunFt * factor);
      const raftersPerSide = Math.ceil(bl / spacingFt) + 1;
      const totalRafters = raftersPerSide * 2;

      // Ridge board
      const ridgeLF = bl + 4;
      const ridgeBoardLen = nextStdLen(ridgeLF <= 16 ? ridgeLF : 20);
      const ridgeBoardCount = Math.ceil(ridgeLF / ridgeBoardLen);

      // Collar ties (2×4, every 4 ft OC, length ≈ span/3)
      const collarCount = Math.ceil(bl / 4);
      const collarLF = bw / 3;
      const collarBoardLen = nextStdLen(collarLF);

      // Ceiling joists (same spacing, span = buildingWidth)
      const cjCount = Math.ceil(bl / spacingFt) + 1;
      const cjBoardLen = nextStdLen(bw + 1);

      framingItems.push(
        { label: `${rc.rSize}×${rafterBoardLen}' Common Rafters (${spacing}" OC, both sides)`, qty: Math.ceil(totalRafters * WASTE), unit: "ea", price: rc.rPrice },
        { label: `${rc.rdgSize}×${ridgeBoardLen}' Ridge Board`, qty: ridgeBoardCount, unit: "ea", price: rc.rdgPrice },
        { label: `2×4×${collarBoardLen}' Collar Ties (every 4' OC)`, qty: Math.ceil(collarCount * WASTE), unit: "ea", price: 5.98 },
        { label: `${rc.cjSize}×${cjBoardLen}' Ceiling Joists (${spacing}" OC)`, qty: Math.ceil(cjCount * WASTE), unit: "ea", price: rc.cjPrice },
        { label: "Hurricane Ties — H2.5A Rafter Clip (1 per rafter at plate)", qty: totalRafters, unit: "ea", price: 2.25 },
        { label: "Structural Screws — Ridge & Rafter (box)", qty: Math.max(1, Math.ceil(totalRafters / 40)), unit: "box", price: 21.98 },
        { label: "Ring Shank Nails — Ceiling Joist & Rafter (box)", qty: Math.max(1, Math.ceil(totalRafters / 50)), unit: "box", price: 17.98 },
      );
    }
  }

  return [
    ...framingItems,
    ...(inputs.archShingles ? [{ label: "Architectural Shingles (bundle)", qty: Math.ceil((actual / 100) * 3.33 * WASTE), unit: "bundle", price: 48.98 }] : []),
    { label: "Synthetic Underlayment", qty: Math.ceil(actual * WASTE), unit: "sqft", price: 0.18 },
    ...(inputs.includeDecking ? [
      { label: "Advantech Roof Sheathing 7/16\" (4×8)", qty: Math.ceil(actual * WASTE / 32), unit: "sheet", price: 38.98 },
      { label: "Advantech Seam Tape (75 LF roll)", qty: Math.max(1, Math.ceil(actual * WASTE / 300)), unit: "roll", price: 27.98 },
    ] : []),
    ...(inputs.iceWater ? [{ label: "Ice & Water Shield", qty: Math.ceil(fp * 0.25 * WASTE), unit: "sqft", price: 0.62 }] : []),
  ];
}
function getRoofLaborItems(inputs: RoofInputs): LaborItem[] {
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actual = Math.round(fp * factor);
  const bw = parseFloat(inputs.buildingWidth) || 0;
  const bl = parseFloat(inputs.buildingLength) || 0;
  const spacing = parseInt(inputs.roofSpacing ?? "24") || 24;
  const hasFraming = bw > 0 && bl > 0;

  const framingLabor: LaborItem[] = [];
  if (hasFraming) {
    const spacingFt = spacing / 12;
    if ((inputs.roofSystem ?? "truss") === "truss") {
      const trussCount = Math.ceil(bl / spacingFt) + 1;
      // RSMeans 06 17 53 — light residential truss set, 75th %ile
      framingLabor.push(
        { label: "Roof Truss Delivery & Crane Set", qty: trussCount + 2, unit: "ea", nationalAvg: 72.00 },
        { label: "Truss Bracing, Tie-Down & Sheathing Blocking", qty: actual || Math.round(bw * bl * factor), unit: "sqft", nationalAvg: 1.15 },
      );
    } else if ((inputs.roofType ?? "pitched") === "shed") {
      // RSMeans 06 11 10 — single-slope stick-built framing (no ceiling joists)
      framingLabor.push(
        { label: "Roof Framing — Shed Rafters & Ledger Board", qty: actual || Math.round(bw * bl * factor), unit: "sqft", nationalAvg: 6.50 },
      );
    } else {
      // RSMeans 06 11 10 — stick-built roof framing, rafters + ridge + collar ties, 75th %ile
      framingLabor.push(
        { label: "Roof Framing — Rafters, Ridge Board & Collar Ties", qty: actual || Math.round(bw * bl * factor), unit: "sqft", nationalAvg: 7.25 },
        { label: "Ceiling Joist Framing", qty: fp || Math.round(bw * bl), unit: "sqft", nationalAvg: 2.45 },
      );
    }
  }

  return [
    ...framingLabor,
    ...(inputs.archShingles ? [{ label: "Shingle Installation", qty: actual, unit: "sqft", nationalAvg: 4.85 }] : []),
    { label: "Underlayment & Flashing Install", qty: actual, unit: "sqft", nationalAvg: 1.25 },
    ...(inputs.includeDecking ? [{ label: "Advantech Roof Sheathing Install & Seam Tape", qty: actual, unit: "sqft", nationalAvg: 2.65 }] : []),
    ...(inputs.iceWater ? [{ label: "Ice & Water Shield Install", qty: Math.round(fp * 0.25), unit: "sqft", nationalAvg: 1.45 }] : []),
  ];
}
function RoofTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<RoofInputs>(SK.roof, DEFAULT_ROOF);
  const [project] = useProject();
  const tabInputs: RoofInputs = { ...DEFAULT_ROOF, ...rawInputs };
  const inputs: RoofInputs = {
    ...tabInputs,
    footprintSqft: tabInputs.footprintSqft || project.footprintSqft || project.sqft,
    buildingWidth: tabInputs.buildingWidth || project.buildingWidth,
    buildingLength: tabInputs.buildingLength || project.buildingLength,
    pitch: tabInputs.pitch || project.roofPitch || "",
  };
  const laborItems = getRoofLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.roofRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.roofMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.roofMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.roofLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.roofCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.roofCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => { setSavedRates({}); setSavedLabQtys({}); }, [setSavedRates, setSavedLabQtys]);
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actualArea = fp * factor;
  const matItems = getRoofMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatQtyChange = useCallback((label: string, val: string) => setSavedMatQtys(p => ({ ...p, [label]: val })), [setSavedMatQtys]);
  const handleLabQtyChange = useCallback((label: string, val: string) => setSavedLabQtys(p => ({ ...p, [label]: val })), [setSavedLabQtys]);
  const handleMatReset = useCallback(() => { setSavedMatPrices({}); setSavedMatQtys({}); }, [setSavedMatPrices, setSavedMatQtys]);
  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const bwNum = parseFloat(inputs.buildingWidth) || 0;
  const blNum = parseFloat(inputs.buildingLength) || 0;
  const hasFramingInputs = bwNum > 0 && blNum > 0;
  const spacingNum = parseInt(inputs.roofSpacing ?? "24") || 24;
  const trussCountDisplay = hasFramingInputs ? Math.ceil(blNum / (spacingNum / 12)) + 1 : null;
  const isShed = inputs.roofSystem === "rafter" && (inputs.roofType ?? "pitched") === "shed";
  const rcSpan = isShed ? bwNum : bwNum / 2;
  const rc = bwNum > 0 ? resolveRc(inputs.rafterSize ?? "", rcSpan) : null;

  const SH = ({ title, note }: { title: string; note?: string }) => (
    <div className="flex items-baseline gap-3 mb-4 mt-6 first:mt-0 pb-2 border-b border-[#E8E4DF]">
      <span className="text-xs font-black uppercase tracking-widest text-[#E85D26]">{title}</span>
      {note && <span className="text-xs text-[#AAA]">{note}</span>}
    </div>
  );

  return (
    <div>
      {canUndo && <div className="flex justify-end mb-3 no-print"><UndoBtn onUndo={undo} /></div>}
      <div className="no-print">
        {/* ── Framing System ── */}
        <SH title="Roof Framing System" note="Trusses are factory-built; rafters are site-cut — leave dimensions blank to skip framing" />
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Framing System">
            <select value={inputs.roofSystem} onChange={e => setInputs(p => ({ ...p, roofSystem: e.target.value as "truss" | "rafter", roofSpacing: e.target.value === "truss" ? "24" : "16" }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              <option value="truss">Prefabricated Trusses</option>
              <option value="rafter">Stick-Built Rafters</option>
            </select>
          </Field>
          <Field label="Framing Spacing (OC)">
            <select value={inputs.roofSpacing ?? "24"} onChange={e => setInputs(p => ({ ...p, roofSpacing: e.target.value as "16" | "24" }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              <option value="16">16″ OC</option>
              <option value="24">24″ OC</option>
            </select>
          </Field>
          {inputs.roofSystem === "rafter" && (
            <>
              <Field label="Roof Type">
                <select value={inputs.roofType ?? "pitched"} onChange={e => setInputs(p => ({ ...p, roofType: e.target.value as "pitched" | "shed" }))}
                  className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
                  <option value="pitched">Pitched / Gable</option>
                  <option value="shed">Shed (Single Slope)</option>
                </select>
              </Field>
              <Field label="Rafter Size" note={!inputs.rafterSize && rc ? `auto: ${rc.rSize}` : undefined}>
                <select value={inputs.rafterSize ?? ""} onChange={e => setInputs(p => ({ ...p, rafterSize: e.target.value as RoofInputs["rafterSize"] }))}
                  className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
                  <option value="">Auto (from span)</option>
                  <option value="2x8">2×8</option>
                  <option value="2x10">2×10</option>
                  <option value="2x12">2×12</option>
                </select>
              </Field>
            </>
          )}
          <Field label="Building Width (ft)" note={inputs.roofSystem === "truss" ? "Full truss span" : isShed ? `Full rafter span${bwNum > 0 && rc ? ` → ${rc.rSize}` : ""}` : `Half-span${bwNum > 0 && rc ? ` ${(bwNum / 2).toFixed(1)}' → ${rc.rSize}` : ""}`}>
            <NumberInput value={inputs.buildingWidth} onChange={v => setInputs(p => ({ ...p, buildingWidth: v }))} placeholder="e.g. 28" />
            {!tabInputs.buildingWidth && project.buildingWidth && <ProjectBadge />}
          </Field>
          <Field label="Building Length (ft)" note={trussCountDisplay ? `${trussCountDisplay} ${inputs.roofSystem === "truss" ? "trusses" : isShed ? "rafters" : "rafter pairs"} at ${spacingNum}" OC` : undefined}>
            <NumberInput value={inputs.buildingLength} onChange={v => setInputs(p => ({ ...p, buildingLength: v }))} placeholder="e.g. 48" />
            {!tabInputs.buildingLength && project.buildingLength && <ProjectBadge />}
          </Field>
        </div>
        {hasFramingInputs && inputs.roofSystem === "truss" && (
          <InfoBox>
            <strong>{trussCountDisplay} trusses</strong> ({spacingNum}″ OC) &nbsp;·&nbsp; {bwNum.toFixed(0)}' span &nbsp;·&nbsp; unit price: <strong>${trussUnitPrice(bwNum).toLocaleString()}/ea</strong> &nbsp;·&nbsp; + 2 gable end trusses
          </InfoBox>
        )}
        {hasFramingInputs && inputs.roofSystem === "rafter" && rc && isShed && (
          <InfoBox>
            <strong>{rc.rSize} shed rafters</strong> &nbsp;·&nbsp; {bwNum.toFixed(0)}' span &nbsp;·&nbsp; {rc.rdgSize} ledger board &nbsp;·&nbsp; {Math.ceil(blNum / (spacingNum / 12)) + 1} rafters at {spacingNum}″ OC
          </InfoBox>
        )}
        {hasFramingInputs && inputs.roofSystem === "rafter" && rc && !isShed && (
          <InfoBox>
            <strong>{rc.rSize} rafters</strong> &nbsp;·&nbsp; {rc.rdgSize} ridge board &nbsp;·&nbsp; {rc.cjSize} ceiling joists &nbsp;·&nbsp; {Math.ceil(blNum / (spacingNum / 12)) + 1} rafter pairs per side
          </InfoBox>
        )}

        {/* ── Roof Surface ── */}
        <SH title="Roof Surface" note="Shingles, decking & ice/water shield" />
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Roof Footprint (sq ft)" note="Floor plan area under the roof — not the sloped surface">
            <NumberInput value={inputs.footprintSqft} onChange={v => setInputs(p => ({ ...p, footprintSqft: v }))} placeholder="e.g. 1400" />
            {!tabInputs.footprintSqft && (project.footprintSqft || project.sqft) && <ProjectBadge />}
          </Field>
          <Field label="Roof Pitch">
            <select value={tabInputs.pitch} onChange={e => setInputs(p => ({ ...p, pitch: e.target.value }))}
              className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
              {!tabInputs.pitch && project.roofPitch && <option value="">↑ from project ({project.roofPitch})</option>}
              {!tabInputs.pitch && !project.roofPitch && <option value="">— select pitch —</option>}
              {Object.keys(PITCH_FACTORS).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {!tabInputs.pitch && project.roofPitch && <ProjectBadge label={`from project: ${project.roofPitch}`} />}
          </Field>
          {fp > 0 && (
            <InfoBox>
              Actual roof surface: <strong>{Math.ceil(actualArea).toLocaleString()} sqft</strong> &nbsp;·&nbsp; {(actualArea / 100).toFixed(1)} roofing squares
            </InfoBox>
          )}
          <div className="flex flex-col gap-4">
            <Toggle checked={inputs.archShingles} onChange={v => setInputs(p => ({ ...p, archShingles: v }))} label="Architectural Shingles" />
            <Toggle checked={inputs.includeDecking} onChange={v => setInputs(p => ({ ...p, includeDecking: v }))} label="Include Advantech Roof Sheathing" />
            <Toggle checked={inputs.iceWater} onChange={v => setInputs(p => ({ ...p, iceWater: v }))} label="Include Ice & Water Shield" />
          </div>
        </div>
      </div>
      {(fp > 0 || hasFramingInputs) ? (
        <div className="mt-8 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} qtys={savedMatQtys} onQtyChange={handleMatQtyChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} qtys={savedLabQtys} onQtyChange={handleLabQtyChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Enter building dimensions above to see framing, or enter roof footprint for shingles & decking." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PLUMBING TAB
───────────────────────────────────────────── */
interface PlumbingInputs { homeSqft: string; fullBaths: number; halfBaths: number; hasKitchen: boolean; hasLaundry: boolean; spigots: number; }
const DEFAULT_PLUMBING: PlumbingInputs = { homeSqft: "", fullBaths: 1, halfBaths: 0, hasKitchen: true, hasLaundry: true, spigots: 2 };

function getPlumbingMatItems(i: PlumbingInputs): MatItem[] {
  const sqft = parseFloat(i.homeSqft) || 0;
  const pf = sqft > 0 ? Math.max(1.0, Math.sqrt(sqft / 1000)) : 1;
  const pex12Branch = (i.fullBaths * 45) + (i.halfBaths * 25) + (i.hasKitchen ? 20 : 0) + (i.hasLaundry ? 15 : 0);
  const pvc3Branch = (i.fullBaths * 30) + (i.halfBaths * 20);
  const pvc2Branch = (i.hasKitchen ? 15 : 0) + (i.hasLaundry ? 10 : 0);
  const hasFixtures = pex12Branch > 0;
  const pex34Trunk = hasFixtures ? Math.ceil(Math.sqrt(sqft) * 0.6) : 0;
  const pvc4Trunk = (i.fullBaths + i.halfBaths) > 0 ? Math.ceil(Math.sqrt(sqft) * 0.5) : 0;
  const pex34Outdoor = i.spigots * 25;
  const pex12 = Math.ceil(pex12Branch * pf * WASTE);
  const pex34 = Math.ceil((pex34Trunk + pex34Outdoor) * WASTE);
  const pvc3 = Math.ceil(pvc3Branch * pf * WASTE);
  const pvc4 = Math.ceil(pvc4Trunk * WASTE);
  const pvc2 = Math.ceil(pvc2Branch * pf * WASTE);
  const shutoffs = (i.fullBaths * 4) + (i.halfBaths * 3) + (i.hasKitchen ? 2 : 0) + (i.hasLaundry ? 2 : 0);
  const ptraps = (i.fullBaths * 2) + (i.halfBaths * 1) + (i.hasKitchen ? 1 : 0) + (i.hasLaundry ? 1 : 0);
  const waxRings = i.fullBaths + i.halfBaths;
  const items: MatItem[] = [];
  if (pex12 > 0) items.push({ label: 'PEX-A ½" Supply Branches', qty: pex12, unit: "LF", price: 0.95 });
  if (pex34 > 0) items.push({ label: 'PEX-A ¾" Supply Trunk / Outdoor Runs', qty: pex34, unit: "LF", price: 1.35 });
  if (pvc4 > 0) items.push({ label: '4" PVC Main Drain / Stack', qty: pvc4, unit: "LF", price: 5.25 });
  if (pvc3 > 0) items.push({ label: '3" PVC Drain Branches (Bathrooms)', qty: pvc3, unit: "LF", price: 3.45 });
  if (pvc2 > 0) items.push({ label: '2" PVC Drain (Kitchen/Laundry)', qty: pvc2, unit: "LF", price: 2.45 });
  if (shutoffs > 0) items.push({ label: "½\" Shut-Off Valves", qty: shutoffs, unit: "ea", price: 12.50 });
  if (ptraps > 0) items.push({ label: "P-Traps", qty: ptraps, unit: "ea", price: 15.50 });
  if (waxRings > 0) items.push({ label: "Toilet Wax Ring & Closet Flange", qty: waxRings, unit: "ea", price: 12.50 });
  if (i.spigots > 0) items.push({ label: "Frost-Free Outdoor Spigot", qty: i.spigots, unit: "ea", price: 32.50 });
  if (i.hasLaundry) items.push({ label: "Laundry Box & Valves", qty: 1, unit: "ea", price: 52.00 });
  return items;
}
function getPlumbingLaborItems(i: PlumbingInputs): LaborItem[] {
  const items: LaborItem[] = [];
  if (i.fullBaths > 0) items.push({ label: "Full Bathroom Rough-In", qty: i.fullBaths, unit: "ea", nationalAvg: 2150 });
  if (i.halfBaths > 0) items.push({ label: "Half Bath / Powder Room Rough-In", qty: i.halfBaths, unit: "ea", nationalAvg: 1250 });
  if (i.hasKitchen) items.push({ label: "Kitchen Plumbing Rough-In", qty: 1, unit: "ea", nationalAvg: 825 });
  if (i.hasLaundry) items.push({ label: "Laundry Hookup Rough-In", qty: 1, unit: "ea", nationalAvg: 685 });
  if (i.spigots > 0) items.push({ label: "Outdoor Spigot Rough-In", qty: i.spigots, unit: "ea", nationalAvg: 265 });
  return items;
}
function PlumbingTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<PlumbingInputs>(SK.plumbing, DEFAULT_PLUMBING);
  const [project] = useProject();
  const tabInputs: PlumbingInputs = { ...DEFAULT_PLUMBING, ...rawInputs };
  const inputs: PlumbingInputs = {
    ...tabInputs,
    homeSqft: tabInputs.homeSqft || project.sqft,
  };
  const laborItems = getPlumbingLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.plumbingRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.plumbMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.plumbMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.plumbLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.plumbCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.plumbCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => { setSavedRates({}); setSavedLabQtys({}); }, [setSavedRates, setSavedLabQtys]);
  const matItems = getPlumbingMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatQtyChange = useCallback((label: string, val: string) => setSavedMatQtys(p => ({ ...p, [label]: val })), [setSavedMatQtys]);
  const handleLabQtyChange = useCallback((label: string, val: string) => setSavedLabQtys(p => ({ ...p, [label]: val })), [setSavedLabQtys]);
  const handleMatReset = useCallback(() => { setSavedMatPrices({}); setSavedMatQtys({}); }, [setSavedMatPrices, setSavedMatQtys]);
  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const totalRooms = inputs.fullBaths + inputs.halfBaths + (inputs.hasKitchen ? 1 : 0) + (inputs.hasLaundry ? 1 : 0) + inputs.spigots;
  const sqftVal = parseFloat(inputs.homeSqft) || 0;
  const pf = sqftVal > 0 ? Math.max(1.0, parseFloat(Math.sqrt(sqftVal / 1000).toFixed(2))) : 1;
  return (
    <div>
      {canUndo && <div className="flex justify-end mb-3 no-print"><UndoBtn onUndo={undo} /></div>}
      <p className="text-sm text-[#666] mb-6 no-print">Pipe quantities scale with house size — a bathroom at the far end of a 3,000 sqft home needs significantly more pipe than one in a 1,000 sqft house.</p>
      <div className="mb-6 no-print">
        <Field label="Home Size (sq ft)" note="Used to estimate pipe run lengths from fixtures to main stack and service entry">
          <input type="number" min={0} placeholder="e.g. 2000" value={inputs.homeSqft}
            onChange={e => setInputs(p => ({ ...p, homeSqft: e.target.value }))}
            className="w-full border border-[#DDD8D0] px-4 py-3 text-base focus:outline-none focus:border-[#E85D26]" />
          {!tabInputs.homeSqft && project.sqft && <ProjectBadge />}
        </Field>
        {sqftVal > 0 && <div className="mt-2 text-xs text-[#888]">Pipe run distance factor: <strong>{pf.toFixed(2)}×</strong></div>}
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8 mb-8 no-print">
        <Stepper label="Full Bathrooms" value={inputs.fullBaths} onChange={v => setInputs(p => ({ ...p, fullBaths: v }))} max={8} note="Toilet + sink + tub or shower" />
        <Stepper label="Half Baths / Powder Rooms" value={inputs.halfBaths} onChange={v => setInputs(p => ({ ...p, halfBaths: v }))} max={4} note="Toilet + sink only" />
        <Stepper label="Outdoor Spigots" value={inputs.spigots} onChange={v => setInputs(p => ({ ...p, spigots: v }))} max={6} note="Garden hose connections" />
      </div>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#777] no-print">Also include</div>
      <div className="grid sm:grid-cols-2 gap-3 mb-6 no-print">
        <CheckCard checked={inputs.hasKitchen} onChange={v => setInputs(p => ({ ...p, hasKitchen: v }))} label="Kitchen Sink" description="Hot & cold supply, drain hookup" />
        <CheckCard checked={inputs.hasLaundry} onChange={v => setInputs(p => ({ ...p, hasLaundry: v }))} label="Laundry Room" description="Washer hookup — hot, cold & drain" />
      </div>
      {totalRooms > 0 ? (
        <div className="mt-8 flex flex-col gap-0">
          {!sqftVal && <div className="mb-3 no-print"><InfoBox>Enter your home size above for more accurate pipe run quantities.</InfoBox></div>}
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} qtys={savedMatQtys} onQtyChange={handleMatQtyChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} qtys={savedLabQtys} onQtyChange={handleLabQtyChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Select at least one room or fixture above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ELECTRICAL TAB
───────────────────────────────────────────── */
interface ElectricalInputs {
  sqft: string; bedrooms: number; bathrooms: number;
  appliances: { electricRange: boolean; electricDryer: boolean; dishwasher: boolean; evCharger: boolean; garage: boolean; hotTub: boolean; };
}
const DEFAULT_ELECTRICAL: ElectricalInputs = {
  sqft: "", bedrooms: 3, bathrooms: 2,
  appliances: { electricRange: false, electricDryer: false, dishwasher: true, evCharger: false, garage: false, hotTub: false },
};
function getElectricalMatItems(inp: ElectricalInputs): MatItem[] {
  const sqft = parseFloat(inp.sqft) || 0;
  const { bedrooms, bathrooms, appliances } = inp;
  const lightingCircuits = Math.max(1, Math.ceil(sqft / 600));
  const outletCircuits = Math.max(1, Math.ceil(sqft / 400));
  const kitchenCircuits = 3;
  const bathroomCircuits = Math.max(1, bathrooms);
  const romex142 = Math.ceil(lightingCircuits * 150 * WASTE);
  const romex122 = Math.ceil((outletCircuits + kitchenCircuits + bathroomCircuits + bedrooms + (appliances.dishwasher ? 1 : 0) + (appliances.garage ? 1 : 0)) * 100 * WASTE);
  const romex103 = Math.ceil(((appliances.electricRange ? 1 : 0) + (appliances.electricDryer ? 1 : 0)) * 60 * WASTE);
  const romex63 = Math.ceil(((appliances.evCharger ? 1 : 0) + (appliances.hotTub ? 1 : 0)) * 60 * WASTE);
  const totalOutlets = Math.ceil(sqft / 25);
  const gfciOutlets = (bathrooms * 2) + 4 + (appliances.garage ? 2 : 0);
  const afciBreakers = bedrooms + Math.ceil(sqft / 600);
  const stdBreakers = Math.ceil(sqft / 400) + kitchenCircuits + bathroomCircuits + (appliances.dishwasher ? 1 : 0) + (appliances.garage ? 1 : 0);
  const twoPolBreakers = (appliances.electricRange ? 1 : 0) + (appliances.electricDryer ? 1 : 0) + (appliances.evCharger ? 1 : 0) + (appliances.hotTub ? 1 : 0);
  const panelSize = (appliances.evCharger && appliances.hotTub) ? "400A" : "200A";
  const panelPrice = panelSize === "400A" ? 1650 : 685;
  const items: MatItem[] = [{ label: `${panelSize} Main Panel with Main Breaker`, qty: 1, unit: "ea", price: panelPrice }];
  if (romex142 > 0) items.push({ label: "14/2 Romex — Lighting Circuits", qty: romex142, unit: "LF", price: 0.72 });
  if (romex122 > 0) items.push({ label: "12/2 Romex — Outlet & General Circuits", qty: romex122, unit: "LF", price: 0.85 });
  if (romex103 > 0) items.push({ label: "10/3 Romex — Range / Dryer (240V)", qty: romex103, unit: "LF", price: 1.95 });
  if (romex63 > 0) items.push({ label: "6/3 Romex — EV Charger / Hot Tub (240V)", qty: romex63, unit: "LF", price: 3.85 });
  items.push({ label: "Standard Duplex Outlets", qty: Math.max(0, totalOutlets - gfciOutlets), unit: "ea", price: 3.25 });
  items.push({ label: "GFCI Outlets (Kitchen, Bath, Garage, Exterior)", qty: gfciOutlets, unit: "ea", price: 18.50 });
  items.push({ label: "AFCI Breakers (Bedrooms & Living Areas)", qty: afciBreakers, unit: "ea", price: 48.50 });
  if (stdBreakers > 0) items.push({ label: "Standard 15/20A Circuit Breakers", qty: stdBreakers, unit: "ea", price: 10.50 });
  if (twoPolBreakers > 0) items.push({ label: "2-Pole 240V Breakers (Appliances)", qty: twoPolBreakers, unit: "ea", price: 24.50 });
  return items;
}
function getElectricalLaborItems(inp: ElectricalInputs): LaborItem[] {
  const sqft = parseFloat(inp.sqft) || 0;
  const { bedrooms, bathrooms, appliances } = inp;
  const totalCircuits = Math.ceil(sqft / 600) + Math.ceil(sqft / 400) + 3 + Math.max(1, bathrooms) + bedrooms
    + (appliances.dishwasher ? 1 : 0) + (appliances.garage ? 1 : 0)
    + (appliances.electricRange ? 1 : 0) + (appliances.electricDryer ? 1 : 0)
    + (appliances.evCharger ? 1 : 0) + (appliances.hotTub ? 1 : 0);
  const items: LaborItem[] = [
    { label: "Panel Installation & Setup", qty: 1, unit: "ea", nationalAvg: 1450 },
    { label: "Circuit Rough-In (per circuit)", qty: totalCircuits, unit: "circuit", nationalAvg: 485 },
  ];
  if (appliances.evCharger) items.push({ label: "EV Charger Circuit (240V)", qty: 1, unit: "ea", nationalAvg: 1750 });
  if (appliances.hotTub) items.push({ label: "Hot Tub / Spa Circuit (240V, GFCI)", qty: 1, unit: "ea", nationalAvg: 1750 });
  return items;
}
function ElectricalTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<ElectricalInputs>(SK.electrical, DEFAULT_ELECTRICAL);
  const [project] = useProject();
  const tabInputs: ElectricalInputs = { ...DEFAULT_ELECTRICAL, ...rawInputs };
  const inputs: ElectricalInputs = {
    ...tabInputs,
    sqft: tabInputs.sqft || project.sqft,
  };
  const setApp = useCallback((key: keyof ElectricalInputs["appliances"], val: boolean) =>
    setInputs(p => ({ ...p, appliances: { ...p.appliances, [key]: val } })), [setInputs]);
  const laborItems = getElectricalLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.electricalRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.elecMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.elecMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.elecLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.elecCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.elecCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => { setSavedRates({}); setSavedLabQtys({}); }, [setSavedRates, setSavedLabQtys]);
  const sqft = parseFloat(inputs.sqft) || 0;
  const matItems = getElectricalMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatQtyChange = useCallback((label: string, val: string) => setSavedMatQtys(p => ({ ...p, [label]: val })), [setSavedMatQtys]);
  const handleLabQtyChange = useCallback((label: string, val: string) => setSavedLabQtys(p => ({ ...p, [label]: val })), [setSavedLabQtys]);
  const handleMatReset = useCallback(() => { setSavedMatPrices({}); setSavedMatQtys({}); }, [setSavedMatPrices, setSavedMatQtys]);
  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const panelSize = (inputs.appliances.evCharger && inputs.appliances.hotTub) ? "400A" : "200A";
  return (
    <div>
      {canUndo && <div className="flex justify-end mb-3 no-print"><UndoBtn onUndo={undo} /></div>}
      <p className="text-sm text-[#666] mb-6 no-print">Tell us about your home — we handle the circuit math.</p>
      <div className="grid sm:grid-cols-3 gap-8 mb-8 no-print">
        <div className="sm:col-span-1"><Field label="Home Size (sq ft)"><NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 2000" />{!tabInputs.sqft && project.sqft && <ProjectBadge />}</Field></div>
        <Stepper label="Bedrooms" value={inputs.bedrooms} onChange={v => setInputs(p => ({ ...p, bedrooms: v }))} min={1} max={8} />
        <Stepper label="Bathrooms" value={inputs.bathrooms} onChange={v => setInputs(p => ({ ...p, bathrooms: v }))} min={1} max={8} />
      </div>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#777] no-print">Which of these does your home have?</div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4 no-print">
        <CheckCard checked={inputs.appliances.dishwasher} onChange={v => setApp("dishwasher", v)} label="Dishwasher" description="Dedicated 20A circuit" />
        <CheckCard checked={inputs.appliances.electricRange} onChange={v => setApp("electricRange", v)} label="Electric Stove / Range" description="240V 50A dedicated circuit" />
        <CheckCard checked={inputs.appliances.electricDryer} onChange={v => setApp("electricDryer", v)} label="Electric Clothes Dryer" description="240V 30A dedicated circuit" />
        <CheckCard checked={inputs.appliances.garage} onChange={v => setApp("garage", v)} label="Attached Garage" description="Dedicated GFCI circuit" />
        <CheckCard checked={inputs.appliances.evCharger} onChange={v => setApp("evCharger", v)} label="EV Car Charger" description="240V 50A dedicated circuit" />
        <CheckCard checked={inputs.appliances.hotTub} onChange={v => setApp("hotTub", v)} label="Hot Tub / Spa" description="240V 50A GFCI circuit" />
      </div>
      {sqft > 0 && <div className="mb-6 no-print"><InfoBox>Based on your inputs, we recommend a <strong>{panelSize} service panel</strong>.{inputs.appliances.evCharger && inputs.appliances.hotTub && " EV charger + hot tub together typically require a 400A upgrade."}</InfoBox></div>}
      {sqft > 0 ? (
        <div className="mt-4 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} qtys={savedMatQtys} onQtyChange={handleMatQtyChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} qtys={savedLabQtys} onQtyChange={handleLabQtyChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Enter your home size above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   HVAC TAB
───────────────────────────────────────────── */
interface HvacInputs { sqft: string; stories: string; climate: string; system: string; gasFireplace: boolean; }
const DEFAULT_HVAC: HvacInputs = { sqft: "", stories: "", climate: "mixed", system: "gas-central", gasFireplace: false };
const HEATING_BTU: Record<string, number> = { cold: 45, mixed: 35, hot: 25 };
const COOLING_BTU: Record<string, number> = { cold: 20, mixed: 25, hot: 35 };

function sizeFurnace(btu: number): { label: string; price: number } {
  if (btu <= 60000) return { label: "60,000 BTU Gas Furnace", price: 985 };
  if (btu <= 80000) return { label: "80,000 BTU Gas Furnace", price: 1225 };
  if (btu <= 100000) return { label: "100,000 BTU Gas Furnace", price: 1545 };
  return { label: "120,000 BTU Gas Furnace", price: 1845 };
}
function sizeAC(btu: number): { label: string; tons: number; price: number } {
  const sizes = [{ btu: 18000, tons: 1.5, price: 1385 }, { btu: 24000, tons: 2, price: 1585 }, { btu: 30000, tons: 2.5, price: 1745 }, { btu: 36000, tons: 3, price: 1885 }, { btu: 42000, tons: 3.5, price: 2085 }, { btu: 48000, tons: 4, price: 2385 }, { btu: 60000, tons: 5, price: 2885 }];
  const match = sizes.find(s => s.btu >= btu) ?? sizes[sizes.length - 1];
  return { label: `${match.tons}-Ton A/C Condenser`, tons: match.tons, price: match.price };
}
function sizeHP(btu: number): { label: string; tons: number; price: number } {
  const sizes = [{ btu: 18000, tons: 1.5, price: 2085 }, { btu: 24000, tons: 2, price: 2385 }, { btu: 30000, tons: 2.5, price: 2685 }, { btu: 36000, tons: 3, price: 3085 }, { btu: 42000, tons: 3.5, price: 3485 }, { btu: 48000, tons: 4, price: 3885 }, { btu: 60000, tons: 5, price: 4585 }];
  const match = sizes.find(s => s.btu >= btu) ?? sizes[sizes.length - 1];
  return { label: `${match.tons}-Ton Heat Pump`, tons: match.tons, price: match.price };
}
function sizeBoiler(btu: number): { label: string; price: number } {
  if (btu <= 60000) return { label: "60,000 BTU Condensing Boiler (On-Demand)", price: 2350 };
  if (btu <= 80000) return { label: "80,000 BTU Condensing Boiler (On-Demand)", price: 2850 };
  if (btu <= 100000) return { label: "100,000 BTU Condensing Boiler (On-Demand)", price: 3450 };
  return { label: "120,000 BTU Condensing Boiler (On-Demand)", price: 4050 };
}
function getHvacMatItems(inp: HvacInputs): MatItem[] {
  const sqft = parseFloat(inp.sqft) || 0;
  const { climate, system, gasFireplace } = inp;
  const heatBtu = sqft * (HEATING_BTU[climate] ?? 35);
  const coolBtu = sqft * (COOLING_BTU[climate] ?? 25);
  const registers = Math.ceil(sqft / 150);
  const returns = Math.ceil(sqft / 300);
  const ductLF = Math.ceil(sqft * 0.85 * WASTE);
  let items: MatItem[] = [];
  if (system === "mini-split") {
    const heads = Math.ceil(sqft / 500);
    items = [
      { label: `Mini-Split Indoor Heads (${heads}×12,000 BTU)`, qty: heads, unit: "ea", price: 985 },
      { label: "Mini-Split Outdoor Condenser Unit", qty: 1, unit: "ea", price: 1485 + Math.max(0, heads - 2) * 1050 },
      { label: "Refrigerant Lineset", qty: heads * 25, unit: "LF", price: 7.25 },
      { label: "Control Wiring", qty: heads * 25, unit: "LF", price: 1.05 },
    ];
  } else if (system === "on-demand-hydro") {
    const boiler = sizeBoiler(heatBtu);
    const baseboardLF = Math.ceil(sqft / 60);
    const pexLF = Math.ceil(baseboardLF * 2 * WASTE);
    items = [
      { label: boiler.label, qty: 1, unit: "ea", price: boiler.price },
      { label: "Baseboard Fin-Tube Radiators", qty: baseboardLF, unit: "LF", price: 22.50 },
      { label: 'PEX-B ¾" Heating Loop Tubing', qty: pexLF, unit: "LF", price: 0.82 },
      { label: "Circulator Pump", qty: 1, unit: "ea", price: 225 },
      { label: "Expansion Tank", qty: 1, unit: "ea", price: 85 },
      { label: "Pressure Relief Valve", qty: 1, unit: "ea", price: 35 },
      { label: "Zone Manifold (2–4 zones)", qty: 1, unit: "ea", price: 225 },
      { label: "Programmable Thermostat", qty: 1, unit: "ea", price: 155 },
    ];
  } else {
    if (system === "gas-central") {
      const furnace = sizeFurnace(heatBtu);
      const ac = sizeAC(coolBtu);
      items.push({ label: furnace.label, qty: 1, unit: "ea", price: furnace.price });
      items.push({ label: ac.label, qty: 1, unit: "ea", price: ac.price });
      items.push({ label: "Evaporator Coil / Air Handler", qty: 1, unit: "ea", price: 825 });
      items.push({ label: "Refrigerant Lineset (25 LF)", qty: 25, unit: "LF", price: 7.25 });
    } else {
      const hp = sizeHP(Math.max(heatBtu, coolBtu));
      items.push({ label: hp.label, qty: 1, unit: "ea", price: hp.price });
      items.push({ label: "Air Handler / Indoor Unit", qty: 1, unit: "ea", price: 865 });
      items.push({ label: "Refrigerant Lineset (25 LF)", qty: 25, unit: "LF", price: 7.25 });
    }
    items.push({ label: "Flex Duct", qty: ductLF, unit: "LF", price: 3.25 });
    items.push({ label: "Supply Registers", qty: registers, unit: "ea", price: 16.50 });
    items.push({ label: "Return Air Grilles", qty: returns, unit: "ea", price: 22.50 });
    items.push({ label: "Programmable Thermostat", qty: 1, unit: "ea", price: 155 });
  }
  if (gasFireplace) {
    items.push({ label: "Direct-Vent Gas / Propane Fireplace", qty: 1, unit: "ea", price: 1850 });
    items.push({ label: "Direct-Vent Vent Kit", qty: 1, unit: "ea", price: 365 });
    items.push({ label: 'Gas Line Stub to Fireplace (½" black iron)', qty: 10, unit: "LF", price: 3.85 });
  }
  return items;
}
function getHvacLaborItems(inp: HvacInputs): LaborItem[] {
  const sqft = parseFloat(inp.sqft) || 0;
  const items: LaborItem[] = [];
  if (inp.system === "mini-split") {
    const heads = Math.ceil(sqft / 500);
    items.push({ label: "Mini-Split Installation (per head)", qty: heads, unit: "head", nationalAvg: 2150 });
    items.push({ label: "Outdoor Unit Set & Startup", qty: 1, unit: "ea", nationalAvg: 1150 });
  } else if (inp.system === "on-demand-hydro") {
    items.push({ label: "Hydronic Rough-In, Boiler Set & Startup", qty: sqft, unit: "sqft", nationalAvg: 9.25 });
  } else {
    items.push({ label: "HVAC Rough-In & Equipment Set", qty: sqft, unit: "sqft", nationalAvg: 4.85 });
  }
  if (inp.gasFireplace) {
    items.push({ label: "Gas Fireplace Install & Vent", qty: 1, unit: "ea", nationalAvg: 1250 });
  }
  return items;
}
function HvacTab() {
  const { rawInputs, setInputs, undo, canUndo } = useTabUndo<HvacInputs>(SK.hvac, DEFAULT_HVAC);
  const [project] = useProject();
  const tabInputs: HvacInputs = { ...DEFAULT_HVAC, ...rawInputs };
  const inputs: HvacInputs = {
    ...tabInputs,
    sqft: tabInputs.sqft || project.sqft,
    stories: tabInputs.stories || project.stories || "1",
  };
  const laborItems = getHvacLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.hvacRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.hvacMatPrices, {});
  const [savedMatQtys, setSavedMatQtys] = useLocalStorage<QtyOverrides>(SK.hvacMatQtys, {});
  const [savedLabQtys, setSavedLabQtys] = useLocalStorage<QtyOverrides>(SK.hvacLabQtys, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.hvacCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.hvacCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => { setSavedRates({}); setSavedLabQtys({}); }, [setSavedRates, setSavedLabQtys]);
  const sqft = parseFloat(inputs.sqft) || 0;
  const heatBtu = sqft * (HEATING_BTU[inputs.climate] ?? 35);
  const coolBtu = sqft * (COOLING_BTU[inputs.climate] ?? 25);
  const matItems = getHvacMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatQtyChange = useCallback((label: string, val: string) => setSavedMatQtys(p => ({ ...p, [label]: val })), [setSavedMatQtys]);
  const handleLabQtyChange = useCallback((label: string, val: string) => setSavedLabQtys(p => ({ ...p, [label]: val })), [setSavedLabQtys]);
  const handleMatReset = useCallback(() => { setSavedMatPrices({}); setSavedMatQtys({}); }, [setSavedMatPrices, setSavedMatQtys]);
  const matTotal = matItems.reduce((s, r) => s + effectiveQty(r, savedMatQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + effectiveQty(i, savedLabQtys) * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const heads = Math.ceil(sqft / 500);
  return (
    <div>
      {canUndo && <div className="flex justify-end mb-3 no-print"><UndoBtn onUndo={undo} /></div>}
      <p className="text-sm text-[#666] mb-6 no-print">Tell us about your home — we calculate the equipment size you need.</p>
      <div className="grid md:grid-cols-2 gap-6 mb-6 no-print">
        <Field label="Home Size (sq ft)"><NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 2000" />{!tabInputs.sqft && project.sqft && <ProjectBadge />}</Field>
        <Field label="Number of Stories">
          <select value={tabInputs.stories} onChange={e => setInputs(p => ({ ...p, stories: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            {!tabInputs.stories && project.stories && <option value="">↑ from project ({project.stories === "1" ? "1 story" : "2 stories"})</option>}
            {!tabInputs.stories && !project.stories && <option value="">— select —</option>}
            <option value="1">1 story</option><option value="2">2 stories</option><option value="3">3 stories</option>
          </select>
          {!tabInputs.stories && project.stories && <ProjectBadge label={`from project: ${project.stories === "1" ? "1 story" : "2 stories"}`} />}
        </Field>
        <Field label="Climate / Region">
          <select value={inputs.climate} onChange={e => setInputs(p => ({ ...p, climate: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            <option value="cold">Cold winters (Northern states — MN, WI, ND, MT, ME…)</option>
            <option value="mixed">Mixed / Moderate (Central — OH, MO, VA, CO, OR…)</option>
            <option value="hot">Hot summers (Southern states — TX, FL, AZ, GA, SC…)</option>
          </select>
        </Field>
        <Field label="System Type">
          <select value={inputs.system} onChange={e => setInputs(p => ({ ...p, system: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            <option value="gas-central">Gas Furnace + Central A/C — Most common, uses ductwork</option>
            <option value="heat-pump">Electric Heat Pump — Heats & cools in one system, uses ductwork</option>
            <option value="mini-split">Mini-Split (Ductless) — No ductwork, room-by-room control</option>
            <option value="on-demand-hydro">On-Demand Boiler + Hot Water Baseboards — Heat only, no cooling, includes domestic hot water</option>
          </select>
        </Field>
        {sqft > 0 && (
          <InfoBox>
            {inputs.system === "mini-split"
              ? <>Recommended: <strong>{heads} indoor {heads === 1 ? "head" : "heads"}</strong> to cover {sqft.toLocaleString()} sqft.</>
              : inputs.system === "on-demand-hydro"
              ? <>Estimated load: <strong>{Math.round(heatBtu / 1000)}k BTU boiler</strong> / <strong>{Math.ceil(sqft / 60)} LF of baseboard</strong> for {sqft.toLocaleString()} sqft. No cooling — add a mini-split if needed later.</>
              : <>Estimated load: <strong>{Math.round(coolBtu / 12000 * 10) / 10} tons cooling</strong> / <strong>{Math.round(heatBtu / 1000)}k BTU heating</strong> for your climate.</>}
          </InfoBox>
        )}
      </div>
      <div className="mb-6 no-print">
        <p className="text-sm font-semibold text-[#1A1A1A] mb-3">Backup Heat Source</p>
        <CheckCard
          checked={inputs.gasFireplace}
          onChange={v => setInputs(p => ({ ...p, gasFireplace: v }))}
          label="Gas / Propane Fireplace (runs without electricity)"
          description="Direct-vent unit — operates during power outages, ideal backup heat source"
        />
      </div>
      {sqft > 0 ? (
        <div className="mt-4 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} qtys={savedMatQtys} onQtyChange={handleMatQtyChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} qtys={savedLabQtys} onQtyChange={handleLabQtyChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Enter your home size above to see your HVAC estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUMMARY TAB
───────────────────────────────────────────── */
function SummaryTab({ onNavigate, onPrint, visibleTabIds }: { onNavigate: (t: Exclude<Tab, "summary">) => void; onPrint: () => void; visibleTabIds: Set<string> }) {
  // Read all tab states — same keys as individual tabs; fresh on every mount
  const [project] = useProject();
  const [siteInputs] = useLocalStorage<SiteWorkInputs>(SK.sitework, DEFAULT_SITEWORK);
  const [siteSR] = useLocalStorage<LaborRates>(SK.siteworkRates, {});
  const [siteMP] = useLocalStorage<MatPrices>(SK.siteMatPrices, {});
  const [siteCM] = useLocalStorage<CustomMatRow[]>(SK.siteCMat, []);
  const [siteCL] = useLocalStorage<CustomLaborRow[]>(SK.siteCLab, []);
  const [siteMQtys] = useLocalStorage<QtyOverrides>(SK.siteMatQtys, {});
  const [siteLQtys] = useLocalStorage<QtyOverrides>(SK.siteLabQtys, {});

  const [foundInputs] = useLocalStorage<FoundationInputs>(SK.foundation, DEFAULT_FOUNDATION);
  const [foundSR] = useLocalStorage<LaborRates>(SK.foundationRates, {});
  const [foundMP] = useLocalStorage<MatPrices>(SK.foundMatPrices, {});
  const [foundCM] = useLocalStorage<CustomMatRow[]>(SK.foundCMat, []);
  const [foundCL] = useLocalStorage<CustomLaborRow[]>(SK.foundCLab, []);
  const [foundMQtys] = useLocalStorage<QtyOverrides>(SK.foundMatQtys, {});
  const [foundLQtys] = useLocalStorage<QtyOverrides>(SK.foundLabQtys, {});

  const [wallInputs] = useLocalStorage<WallInputs>(SK.wall, DEFAULT_WALL);
  const [wallSR] = useLocalStorage<LaborRates>(SK.wallRates, {});
  const [wallMP] = useLocalStorage<MatPrices>(SK.wallMatPrices, {});
  const [wallCM] = useLocalStorage<CustomMatRow[]>(SK.wallCMat, []);
  const [wallCL] = useLocalStorage<CustomLaborRow[]>(SK.wallCLab, []);
  const [wallMQtys] = useLocalStorage<QtyOverrides>(SK.wallMatQtys, {});
  const [wallLQtys] = useLocalStorage<QtyOverrides>(SK.wallLabQtys, {});

  const [floorInputs] = useLocalStorage<FloorInputs>(SK.floor, DEFAULT_FLOOR);
  const [floorSR] = useLocalStorage<LaborRates>(SK.floorRates, {});
  const [floorMP] = useLocalStorage<MatPrices>(SK.floorMatPrices, {});
  const [floorCM] = useLocalStorage<CustomMatRow[]>(SK.floorCMat, []);
  const [floorCL] = useLocalStorage<CustomLaborRow[]>(SK.floorCLab, []);
  const [floorMQtys] = useLocalStorage<QtyOverrides>(SK.floorMatQtys, {});
  const [floorLQtys] = useLocalStorage<QtyOverrides>(SK.floorLabQtys, {});

  const [roofInputs] = useLocalStorage<RoofInputs>(SK.roof, DEFAULT_ROOF);
  const [roofSR] = useLocalStorage<LaborRates>(SK.roofRates, {});
  const [roofMP] = useLocalStorage<MatPrices>(SK.roofMatPrices, {});
  const [roofCM] = useLocalStorage<CustomMatRow[]>(SK.roofCMat, []);
  const [roofCL] = useLocalStorage<CustomLaborRow[]>(SK.roofCLab, []);
  const [roofMQtys] = useLocalStorage<QtyOverrides>(SK.roofMatQtys, {});
  const [roofLQtys] = useLocalStorage<QtyOverrides>(SK.roofLabQtys, {});

  const [plumbInputs] = useLocalStorage<PlumbingInputs>(SK.plumbing, DEFAULT_PLUMBING);
  const [plumbSR] = useLocalStorage<LaborRates>(SK.plumbingRates, {});
  const [plumbMP] = useLocalStorage<MatPrices>(SK.plumbMatPrices, {});
  const [plumbCM] = useLocalStorage<CustomMatRow[]>(SK.plumbCMat, []);
  const [plumbCL] = useLocalStorage<CustomLaborRow[]>(SK.plumbCLab, []);
  const [plumbMQtys] = useLocalStorage<QtyOverrides>(SK.plumbMatQtys, {});
  const [plumbLQtys] = useLocalStorage<QtyOverrides>(SK.plumbLabQtys, {});

  const [elecInputs] = useLocalStorage<ElectricalInputs>(SK.electrical, DEFAULT_ELECTRICAL);
  const [elecSR] = useLocalStorage<LaborRates>(SK.electricalRates, {});
  const [elecMP] = useLocalStorage<MatPrices>(SK.elecMatPrices, {});
  const [elecCM] = useLocalStorage<CustomMatRow[]>(SK.elecCMat, []);
  const [elecCL] = useLocalStorage<CustomLaborRow[]>(SK.elecCLab, []);
  const [elecMQtys] = useLocalStorage<QtyOverrides>(SK.elecMatQtys, {});
  const [elecLQtys] = useLocalStorage<QtyOverrides>(SK.elecLabQtys, {});

  const [hvacInputs] = useLocalStorage<HvacInputs>(SK.hvac, DEFAULT_HVAC);
  const [hvacSR] = useLocalStorage<LaborRates>(SK.hvacRates, {});
  const [hvacMP] = useLocalStorage<MatPrices>(SK.hvacMatPrices, {});
  const [hvacCM] = useLocalStorage<CustomMatRow[]>(SK.hvacCMat, []);
  const [hvacCL] = useLocalStorage<CustomLaborRow[]>(SK.hvacCLab, []);
  const [hvacMQtys] = useLocalStorage<QtyOverrides>(SK.hvacMatQtys, {});
  const [hvacLQtys] = useLocalStorage<QtyOverrides>(SK.hvacLabQtys, {});

  const [markup, setMarkup] = useLocalStorage<string>(SK.markup, "15");

  // Compute per-tab totals
  const computeTab = (
    label: string,
    tabId: Exclude<Tab, "summary">,
    matItems: MatItem[],
    cMat: CustomMatRow[],
    savedMatPrices: MatPrices,
    matQtys: QtyOverrides,
    laborItems: LaborItem[],
    savedRates: LaborRates,
    labQtys: QtyOverrides,
    cLab: CustomLaborRow[],
    hasData: boolean,
  ) => {
    const rates = { ...defaultRates(laborItems), ...savedRates };
    const matPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
    const mat = matItems.reduce((s, r) => s + effectiveQty(r, matQtys) * effectiveMatPrice(r, matPrices), 0) + customMatTotal(cMat);
    const lab = laborItems.reduce((s, i) => s + effectiveQty(i, labQtys) * effectiveRate(i, rates), 0) + customLaborTotal(cLab);
    return { label, tabId, mat, lab, total: mat + lab, hasData };
  };

  // Apply the same project-level fallbacks each tab component uses so Summary
  // correctly recognises tabs as having data even when the user relied on the
  // project badge rather than re-typing values on the individual tab.
  const summaryAutoPerim = project.sqft ? String(Math.ceil(Math.sqrt(parseFloat(project.sqft)) * 4)) : "";
  const summaryFpSqft = parseFloat(project.footprintSqft || project.sqft) || 0;
  const summaryAutoW = summaryFpSqft > 0 ? String(Math.ceil(Math.sqrt(summaryFpSqft))) : "";
  const summaryAutoL = summaryFpSqft > 0 && summaryAutoW ? String(Math.ceil(summaryFpSqft / Math.ceil(Math.sqrt(summaryFpSqft)))) : "";
  const siteEff: SiteWorkInputs = { ...DEFAULT_SITEWORK, ...siteInputs, footprintSqft: siteInputs.footprintSqft || project.footprintSqft || project.sqft };
  const foundEff: FoundationInputs = { ...DEFAULT_FOUNDATION, ...foundInputs, sqft: foundInputs.sqft || project.sqft, perimeter: foundInputs.perimeter || (foundInputs.perimeterOverride ? project.linearFeet : "") };
  const wallEff: WallInputs = { ...DEFAULT_WALL, ...wallInputs, linearFeet: wallInputs.linearFeet || project.linearFeet || summaryAutoPerim, stories: wallInputs.stories || project.stories || "1", buildingWidth: wallInputs.buildingWidth || project.buildingWidth, roofPitch: wallInputs.roofPitch || (project.roofPitch ? project.roofPitch.split(":")[0] : "") };
  const floorEff: FloorInputs = { ...DEFAULT_FLOOR, ...floorInputs, buildingWidth: floorInputs.buildingWidth || project.buildingWidth || summaryAutoW, buildingLength: floorInputs.buildingLength || project.buildingLength || summaryAutoL, stories: floorInputs.stories || project.stories || "1" };
  const roofEff: RoofInputs = { ...DEFAULT_ROOF, ...roofInputs, footprintSqft: roofInputs.footprintSqft || project.footprintSqft || project.sqft, buildingWidth: roofInputs.buildingWidth || project.buildingWidth, buildingLength: roofInputs.buildingLength || project.buildingLength, pitch: roofInputs.pitch || project.roofPitch || "" };
  const elecEff: ElectricalInputs = { ...DEFAULT_ELECTRICAL, ...elecInputs, sqft: elecInputs.sqft || project.sqft };
  const hvacEff: HvacInputs = { ...DEFAULT_HVAC, ...hvacInputs, sqft: hvacInputs.sqft || project.sqft, stories: hvacInputs.stories || project.stories || "1" };

  const siteHasData = (() => {
    const lot = parseFloat(siteEff.lotSqft) || 0;
    const fp = parseFloat(siteEff.footprintSqft) || 0;
    const driveSqft = (parseFloat(siteEff.drivewayLength) || 0) * (parseFloat(siteEff.drivewayWidth) || 12);
    return lot > 0 || fp > 0 || (siteEff.includeDriveway && driveSqft > 0);
  })();

  const rows = [
    computeTab("Site Work", "sitework", getSiteWorkMatItems(siteEff), siteCM, siteMP, siteMQtys, getSiteWorkLaborItems(siteEff), siteSR, siteLQtys, siteCL, siteHasData),
    computeTab("Foundation", "foundation", getFoundationMatItems(foundEff), foundCM, foundMP, foundMQtys, getFoundationLaborItems(foundEff), foundSR, foundLQtys, foundCL, (parseFloat(foundEff.sqft) || 0) > 0),
    computeTab("Walls", "wall", getWallMatItems(wallEff), wallCM, wallMP, wallMQtys, getWallLaborItems(wallEff), wallSR, wallLQtys, wallCL, (parseFloat(wallEff.linearFeet) || 0) > 0),
    computeTab("Floors", "floor", getFloorMatItems(floorEff), floorCM, floorMP, floorMQtys, getFloorLaborItems(floorEff), floorSR, floorLQtys, floorCL, ((parseFloat(floorEff.buildingWidth) || 0) * (parseFloat(floorEff.buildingLength) || 0)) > 0),
    computeTab("Roofing", "roof", getRoofMatItems(roofEff), roofCM, roofMP, roofMQtys, getRoofLaborItems(roofEff), roofSR, roofLQtys, roofCL, (parseFloat(roofEff.footprintSqft) || 0) > 0),
    computeTab("Plumbing", "plumbing", getPlumbingMatItems(plumbInputs), plumbCM, plumbMP, plumbMQtys, getPlumbingLaborItems(plumbInputs), plumbSR, plumbLQtys, plumbCL, (plumbInputs.fullBaths + plumbInputs.halfBaths + plumbInputs.spigots + (plumbInputs.hasKitchen ? 1 : 0) + (plumbInputs.hasLaundry ? 1 : 0)) > 0),
    computeTab("Electrical", "electrical", getElectricalMatItems(elecEff), elecCM, elecMP, elecMQtys, getElectricalLaborItems(elecEff), elecSR, elecLQtys, elecCL, (parseFloat(elecEff.sqft) || 0) > 0),
    computeTab("Heating & Cooling", "hvac", getHvacMatItems(hvacEff), hvacCM, hvacMP, hvacMQtys, getHvacLaborItems(hvacEff), hvacSR, hvacLQtys, hvacCL, (parseFloat(hvacEff.sqft) || 0) > 0),
  ];

  const visibleRows = rows.filter(r => visibleTabIds.has(r.tabId));
  const filledRows = visibleRows.filter(r => r.hasData);
  const totalMat = filledRows.reduce((s, r) => s + r.mat, 0);
  const totalLab = filledRows.reduce((s, r) => s + r.lab, 0);
  const subtotal = totalMat + totalLab;
  const markupPct = parseFloat(markup) || 0;
  const markupAmt = subtotal * markupPct / 100;
  const grandTotal = subtotal + markupAmt;

  const hasAnyData = filledRows.length > 0;

  return (
    <div>
      {/* Print-only header */}
      <div className="hidden print-show mb-8 pb-6 border-b-2 border-[#1A1A1A]">
        <div className="text-[11px] uppercase tracking-widest font-bold text-[#E85D26] mb-1">EstimatorX.pro — Project Estimate</div>
        <div className="text-xs text-[#777]">Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
      </div>

      {!hasAnyData ? (
        <div className="p-10 text-center border-2 border-dashed border-[#DDD8D0]">
          <div className="text-4xl mb-4">📋</div>
          <div className="text-lg font-bold text-[#1A1A1A] mb-2">No estimate data yet</div>
          <p className="text-sm text-[#888] mb-6 max-w-sm mx-auto">
            Fill in at least one of your selected tabs to see your project total here.
          </p>
          <button onClick={() => onNavigate(visibleRows[0]?.tabId ?? "sitework")} className="bg-[#E85D26] text-white font-bold px-6 py-2.5 hover:bg-[#c94d1f] transition-colors text-sm">
            Start with {visibleRows[0]?.label ?? "Site Work"}
          </button>
        </div>
      ) : (
        <>
          {/* Rollup table */}
          <div className="border border-[#DDD8D0] overflow-hidden mb-3">
            <div className="bg-[#2C2825] text-white px-6 py-3">
              <span className="font-bold uppercase tracking-widest text-xs">Project Estimate Summary</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#777]">Assembly</th>
                  <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#777]">Materials</th>
                  <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#777]">Labor</th>
                  <th className="text-right px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#777]">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EDE8]">
                {visibleRows.map(r => (
                  <tr key={r.tabId} className={r.hasData ? "hover:bg-[#FAF8F5]" : "opacity-35"}>
                    <td className="px-6 py-3 font-medium text-[#1A1A1A]">
                      <div className="flex items-center gap-3">
                        {r.label}
                        {!r.hasData && (
                          <button onClick={() => onNavigate(r.tabId)} className="no-print text-[10px] text-[#E85D26] border border-[#E85D26]/30 bg-[#FFF8F5] px-2 py-0.5 hover:bg-[#E85D26] hover:text-white transition-colors">
                            + Add data
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[#555]">{r.hasData ? `$${fmt(r.mat)}` : "—"}</td>
                    <td className="px-4 py-3 text-right text-[#555]">{r.hasData ? `$${fmt(r.lab)}` : "—"}</td>
                    <td className="px-6 py-3 text-right font-semibold text-[#1A1A1A]">{r.hasData ? `$${fmt(r.total)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#F7F4F0] border-t-2 border-[#DDD8D0]">
                  <td className="px-6 py-3 font-black text-[#1A1A1A] uppercase tracking-wide text-sm">Subtotal</td>
                  <td className="px-4 py-3 text-right font-bold text-[#1A1A1A]">${fmt(totalMat)}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#1A1A1A]">${fmt(totalLab)}</td>
                  <td className="px-6 py-3 text-right font-black text-[#E85D26] text-base">${fmt(subtotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Markup */}
          <div className="border border-[#DDD8D0] bg-white p-6 mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
              <div className="flex-1">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#777] mb-1.5">Markup / Overhead / Profit (%)</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="0" max="200" step="0.5" value={markup} onChange={e => setMarkup(e.target.value)}
                    className="no-print w-28 bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors text-lg font-bold" />
                  <span className="print-show hidden text-lg font-bold text-[#1A1A1A]">{markup}%</span>
                  <span className="text-lg font-bold text-[#888]">%</span>
                  <span className="text-sm text-[#888]">= <strong className="text-[#1A1A1A]">${fmt(markupAmt)}</strong> markup</span>
                </div>
                <p className="text-xs text-[#AAA] mt-1.5">Applied to combined materials + labor subtotal</p>
              </div>
              <div className="sm:text-right">
                <div className="text-xs font-bold uppercase tracking-widest text-[#777] mb-1">Base Subtotal</div>
                <div className="font-black text-xl text-[#1A1A1A]">${fmt(subtotal)}</div>
              </div>
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-[#1A1A1A] text-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-8">
              <div>
                <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Subtotal</div>
                <div className="font-black text-lg">${fmt(subtotal)}</div>
              </div>
              {markupPct > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Markup ({markup}%)</div>
                  <div className="font-black text-lg text-[#E85D26]">+${fmt(markupAmt)}</div>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest font-bold opacity-60 mb-0.5">Total Project Estimate</div>
              <div className="font-black text-4xl">${fmt(grandTotal)}</div>
            </div>
          </div>

          {/* Print action */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[10px] text-[#AAA]">Estimate for budgeting purposes only. Does not include permits, delivery, equipment rental, tax, or contingency.</p>
            <button onClick={onPrint} className="no-print flex items-center gap-2 bg-[#1A1A1A] text-white font-bold px-5 py-2.5 hover:bg-[#333] transition-colors text-sm">
              <Printer size={15} /> Print / Save as PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
const TABS: { id: Exclude<Tab, "summary">; label: string; group: "structural" | "mep" }[] = [
  { id: "sitework", label: "Site Work", group: "structural" },
  { id: "foundation", label: "Foundation", group: "structural" },
  { id: "wall", label: "Walls", group: "structural" },
  { id: "floor", label: "Floors", group: "structural" },
  { id: "roof", label: "Roofing", group: "structural" },
  { id: "plumbing", label: "Plumbing", group: "mep" },
  { id: "electrical", label: "Electrical", group: "mep" },
  { id: "hvac", label: "Heating & Cooling", group: "mep" },
];
const ALL_TAB_IDS = TABS.map(t => t.id) as string[];
const VISIBLE_TABS_KEY = "exVisibleTabs";
const TAB_PRESETS: { label: string; ids: string[] }[] = [
  { label: "All Trades", ids: ALL_TAB_IDS },
  { label: "Roofer", ids: ["roof"] },
  { label: "Framer", ids: ["wall", "floor"] },
  { label: "Foundation", ids: ["sitework", "foundation"] },
  { label: "Plumber", ids: ["plumbing"] },
  { label: "Electrician", ids: ["electrical"] },
  { label: "HVAC", ids: ["hvac"] },
  { label: "MEP", ids: ["plumbing", "electrical", "hvac"] },
];

function readVisibleTabs(): Set<string> {
  try {
    const saved = localStorage.getItem(VISIBLE_TABS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return new Set(parsed);
    }
  } catch { /* ignore */ }
  return new Set(ALL_TAB_IDS);
}

function TabConfigPanel({
  visibleTabIds, setVisibleTabIds, onClose,
}: {
  visibleTabIds: Set<string>;
  setVisibleTabIds: (v: Set<string>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep a stable ref to onClose so the effect never needs to re-run
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Close on any mousedown that isn't stopped by the panel itself
    const handler = () => onCloseRef.current();
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []); // empty deps — registered once, never re-registered

  const toggle = (id: string) => {
    const next = new Set(visibleTabIds);
    if (next.has(id) && next.size === 1) return; // keep at least one
    next.has(id) ? next.delete(id) : next.add(id);
    setVisibleTabIds(next);
  };

  const applyPreset = (ids: string[]) => setVisibleTabIds(new Set(ids));

  const structural = TABS.filter(t => t.group === "structural");
  const mep = TABS.filter(t => t.group === "mep");

  return (
    <div ref={ref} onMouseDown={e => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-50 bg-white border border-[#DDD8D0] shadow-lg w-72">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-white px-4 py-2.5 flex justify-between items-center">
        <span className="text-xs font-bold uppercase tracking-widest">Customize Tabs</span>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors"><X size={13} /></button>
      </div>

      {/* Presets */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#BBB] mb-2">Quick Presets</div>
        <div className="flex flex-wrap gap-1.5">
          {TAB_PRESETS.map(p => {
            const active = p.ids.length === visibleTabIds.size && p.ids.every(id => visibleTabIds.has(id));
            return (
              <button key={p.label} onClick={() => applyPreset(p.ids)}
                className={`px-2.5 py-1 text-xs font-semibold border transition-colors ${active ? "bg-[#E85D26] text-white border-[#E85D26]" : "bg-white text-[#555] border-[#DDD8D0] hover:border-[#E85D26] hover:text-[#E85D26]"}`}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[#F0EDE8] mx-4" />

      {/* Checkboxes */}
      <div className="px-4 py-3 space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#BBB] mb-1.5">Structural</div>
          <div className="space-y-1">
            {structural.map(t => (
              <label key={t.id} className="flex items-center gap-2.5 cursor-pointer group">
                <div onClick={() => toggle(t.id)}
                  className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 transition-colors ${visibleTabIds.has(t.id) ? "bg-[#E85D26] border-[#E85D26]" : "border-[#CCC] group-hover:border-[#E85D26]"}`}>
                  {visibleTabIds.has(t.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                </div>
                <span onClick={() => toggle(t.id)} className="text-sm text-[#333] select-none">{t.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#BBB] mb-1.5">Rough Systems</div>
          <div className="space-y-1">
            {mep.map(t => (
              <label key={t.id} className="flex items-center gap-2.5 cursor-pointer group">
                <div onClick={() => toggle(t.id)}
                  className={`w-4 h-4 border flex items-center justify-center flex-shrink-0 transition-colors ${visibleTabIds.has(t.id) ? "bg-[#E85D26] border-[#E85D26]" : "border-[#CCC] group-hover:border-[#E85D26]"}`}>
                  {visibleTabIds.has(t.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                </div>
                <span onClick={() => toggle(t.id)} className="text-sm text-[#333] select-none">{t.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 bg-[#FAF8F5] border-t border-[#F0EDE8] text-[10px] text-[#AAA]">
        Summary tab is always visible. Your selection is saved automatically.
      </div>
    </div>
  );
}

function EstimatorUserNav() {
  const { user } = useUser();
  const { signOut } = useClerk();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 border-l border-[#E0DAD3] pl-4">
      <span className="text-xs text-[#888] hidden sm:block truncate max-w-[180px]">
        {user.primaryEmailAddress?.emailAddress}
      </span>
      <button
        onClick={() => signOut({ redirectUrl: "/" })}
        className="text-xs font-bold uppercase tracking-wider text-[#E85D26] hover:text-[#D44A15] transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}

export default function Estimator({ sharedToken, sharedName }: { sharedToken?: string; sharedName?: string } = {}) {
  // Prime localStorage from URL on first render (before child hooks)
  const urlPrimed = useRef(false);
  if (!urlPrimed.current) {
    urlPrimed.current = true;
    try {
      const s = new URLSearchParams(window.location.search).get("s");
      if (s) {
        const decoded = deserializeState(s);
        if (decoded) primeLocalStorageFromSnapshot(decoded);
      }
    } catch {}
  }

  const [tab, setTab] = useState<Tab>("sitework");
  const [resetKey, setResetKey] = useState(0);
  const [upgradeFeature, setUpgradeFeature] = useState<GatedFeature | null>(null);
  const [showPlanImport, setShowPlanImport] = useState(false);
  const [inviteModal, setInviteModal] = useState<{ url: string; name: string } | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [visibleTabIds, setVisibleTabIdsRaw] = useState<Set<string>>(readVisibleTabs);
  const [showTabConfig, setShowTabConfig] = useState(false);
  const tabConfigAnchorRef = useRef<HTMLDivElement>(null);

  const setVisibleTabIds = useCallback((next: Set<string>) => {
    setVisibleTabIdsRaw(next);
    try { localStorage.setItem(VISIBLE_TABS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  }, []);

  // If the active tab gets hidden, jump to the first visible tab (or summary)
  useEffect(() => {
    if (tab !== "summary" && !visibleTabIds.has(tab)) {
      const first = ALL_TAB_IDS.find(id => visibleTabIds.has(id));
      setTab((first as Tab | undefined) ?? "summary");
    }
  }, [visibleTabIds, tab]);

  const printAccess = useFeatureAccess("print");
  const { refresh: refreshPlan, isXPlan } = useSubscription();

  // After returning from Stripe print checkout, verify the session and print.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    const action = params.get("action");
    const sessionId = params.get("session_id");
    const plan = params.get("plan");

    // Clean URL immediately
    window.history.replaceState({}, "", window.location.pathname);

    if (plan === "x_plan") {
      // X Plan subscription — just refresh subscription state
      void refreshPlan();
      return;
    }

    if (action === "print" && sessionId) {
      void (async () => {
        try {
          const base = import.meta.env.BASE_URL as string;
          const res = await fetch(`${base}api/stripe/verify-print`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          if (res.ok) { window.print(); }
        } catch { /* silent — user can retry */ }
      })();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const handleClear = useCallback(() => {
    clearAllLocalStorage();
    // Save the now-empty state as the snapshot for the active project
    const pid = pmActivePid();
    if (pid) pmSaveSnapshot(pid);
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    window.history.replaceState({}, "", url.toString());
    setTab("sitework");
    setResetKey(k => k + 1);
  }, []);

  const handlePrint = useCallback(() => {
    if (!printAccess.allowed) { setUpgradeFeature("print"); return; }
    window.print();
  }, [printAccess.allowed]);

  const handlePlanImport = useCallback(() => {
    if (!isXPlan) { setUpgradeFeature("cci"); return; }
    setShowPlanImport(true);
  }, [isXPlan]);

  const handleInvite = useCallback(async () => {
    if (!isXPlan) { setUpgradeFeature("cci"); return; }
    const state = readAllLocalStorage();
    const snapshot = serializeState(state);
    const pid = pmActivePid();
    const projects = pmReadIndex();
    const estimateName = projects.find(p => p.id === pid)?.name ?? "Shared Estimate";
    const base = import.meta.env.BASE_URL as string;
    setInviteCreating(true);
    try {
      const res = await fetch(`${base}api/shared`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: estimateName, snapshot }),
      });
      if (res.ok) {
        const data = await res.json() as { token: string };
        const basePath = base.replace(/\/$/, "");
        const url = `${window.location.origin}${basePath}/shared/${data.token}`;
        setInviteModal({ url, name: estimateName });
      }
    } catch { /* silent */ } finally {
      setInviteCreating(false);
    }
  }, [isXPlan]);

  // Auto-save to server every 5 seconds when in shared mode (only if data changed)
  const lastSavedSnapshotRef = useRef<string>("");
  useEffect(() => {
    if (!sharedToken) return;
    lastSavedSnapshotRef.current = serializeState(readAllLocalStorage());
    const interval = setInterval(() => {
      const current = serializeState(readAllLocalStorage());
      if (current === lastSavedSnapshotRef.current) return;
      setSaveStatus("saving");
      const base = import.meta.env.BASE_URL as string;
      void fetch(`${base}api/shared/${sharedToken}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: current }),
      }).then(r => {
        if (r.ok) { lastSavedSnapshotRef.current = current; setSaveStatus("saved"); }
        else { setSaveStatus("unsaved"); }
      }).catch(() => setSaveStatus("unsaved"));
    }, 5000);
    return () => clearInterval(interval);
  }, [sharedToken]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F7F4F0] text-[#1A1A1A]">
      {upgradeFeature && <PaywallModal trigger={upgradeFeature} onClose={() => setUpgradeFeature(null)} />}
      {showPlanImport && <PlanImportModal onClose={() => setShowPlanImport(false)} />}
      {inviteModal && <InviteModal url={inviteModal.url} estimateName={inviteModal.name} onClose={() => setInviteModal(null)} />}

      <header className="no-print sticky top-0 z-50 w-full border-b border-[#E0DAD3] bg-white shadow-sm">
        <div className="container mx-auto px-4 h-14 md:h-20 flex items-center justify-between">
          <Link href="/">
            <img src="/logo.png" alt="EstimatorX.pro" className="h-10 md:h-16 object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-[#888]">
              <Link href="/" className="hover:text-[#E85D26] transition-colors">Home</Link>
              <ChevronRight size={14} />
              <span className="text-[#1A1A1A] font-semibold">Estimator</span>
            </div>
            <EstimatorUserNav />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="no-print bg-[#1A1A1A] text-white py-8 md:py-14">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 md:w-10 h-[2px] bg-[#E85D26]" />
              <span className="text-[#E85D26] font-bold uppercase tracking-widest text-xs md:text-sm">Quick Estimating Tool</span>
            </div>
            <h1 className="text-2xl md:text-5xl font-black font-serif uppercase mb-2 md:mb-3">Material + Labor Estimator</h1>
            <p className="text-gray-400 text-sm md:text-lg max-w-2xl">Site work, foundation, framing, floors, roofing, plumbing, electrical, and HVAC — all with RSMeans national average labor rates built in.</p>
            {sharedToken ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#E85D26]" />
                  <span className="text-[#E85D26] text-xs font-bold uppercase tracking-widest">Shared Estimate</span>
                </div>
                <span className="text-white font-bold text-lg">{sharedName}</span>
                <span className={`text-xs font-bold uppercase tracking-widest ${saveStatus === "saved" ? "text-green-400" : saveStatus === "saving" ? "text-yellow-400" : "text-red-400"}`}>
                  {saveStatus === "saved" ? "● Saved" : saveStatus === "saving" ? "● Saving…" : "● Unsaved"}
                </span>
              </div>
            ) : (
              <ProjectSwitcher isXPlan={isXPlan} onUpgrade={() => setUpgradeFeature("cci")} />
            )}
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 md:py-10 max-w-5xl">
          {/* Tab bar */}
          <div className="no-print mb-6 md:mb-8">
            {/* Toolbar row — icon-only on mobile, sits above the tab strip */}
            <div className="flex items-center justify-end gap-1 border-b border-[#E8E4DF] pb-1 mb-0 md:hidden">
              {!sharedToken && (
                <button onClick={handlePlanImport} title="Import from plans PDF"
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#888] hover:text-[#E85D26] transition-colors">
                  <FileUp size={14} /><span className="font-semibold">Import</span>
                </button>
              )}
              {sharedToken ? (
                <span className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider ${saveStatus === "saved" ? "text-green-600" : saveStatus === "saving" ? "text-yellow-500" : "text-red-500"}`}>
                  {saveStatus === "saved" ? <Check size={13} /> : <RotateCcw size={13} className={saveStatus === "saving" ? "animate-spin" : ""} />}
                  {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
                </span>
              ) : (
                <button onClick={() => void handleInvite()} disabled={inviteCreating} title="Invite team member"
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#888] hover:text-[#E85D26] transition-colors disabled:opacity-50">
                  <Users size={14} /><span className="font-semibold">{inviteCreating ? "Creating…" : "Invite"}</span>
                </button>
              )}
              {!sharedToken && (
                <button onClick={handleClear} title="Clear all"
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#888] hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-[#888] hover:text-[#1A1A1A] transition-colors">
                <Printer size={14} />
              </button>
              {/* Customize tabs — mobile */}
              <div className="relative">
                <button onClick={() => setShowTabConfig(v => !v)} title="Customize tabs"
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors font-semibold ${showTabConfig ? "text-[#E85D26]" : "text-[#888] hover:text-[#E85D26]"}`}>
                  <SlidersHorizontal size={14} />
                </button>
                {showTabConfig && (
                  <TabConfigPanel visibleTabIds={visibleTabIds} setVisibleTabIds={setVisibleTabIds} onClose={() => setShowTabConfig(false)} />
                )}
              </div>
            </div>

            {/* Tab strip + toolbar (desktop) */}
            <div className="flex items-stretch border-b-2 border-[#DDD8D0]">
              {/* Scrollable tab area */}
              <div className="flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                <div className="flex min-w-max">
                  {/* Structural group — only shown if any structural tabs are visible */}
                  {TABS.filter(t => t.group === "structural" && visibleTabIds.has(t.id)).length > 0 && (
                    <div className="flex items-center gap-0">
                      <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest text-[#BBB] pr-3 whitespace-nowrap">Structural</span>
                      {TABS.filter(t => t.group === "structural" && visibleTabIds.has(t.id)).map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                          className={`px-3 md:px-5 py-3 font-bold uppercase tracking-wider text-xs md:text-sm transition-all border-b-2 -mb-[2px] whitespace-nowrap ${tab === t.id ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#888] hover:text-[#1A1A1A]"}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Only show divider if both groups have visible tabs */}
                  {TABS.filter(t => t.group === "structural" && visibleTabIds.has(t.id)).length > 0 &&
                   TABS.filter(t => t.group === "mep" && visibleTabIds.has(t.id)).length > 0 && (
                    <div className="hidden md:block w-px bg-[#DDD8D0] mx-2 self-stretch" />
                  )}
                  {/* MEP group */}
                  {TABS.filter(t => t.group === "mep" && visibleTabIds.has(t.id)).length > 0 && (
                    <div className="flex items-center gap-0 ml-1 md:ml-0 md:mx-4">
                      <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest text-[#BBB] pr-3 whitespace-nowrap">Rough Systems</span>
                      {TABS.filter(t => t.group === "mep" && visibleTabIds.has(t.id)).map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                          className={`px-3 md:px-5 py-3 font-bold uppercase tracking-wider text-xs md:text-sm transition-all border-b-2 -mb-[2px] whitespace-nowrap ${tab === t.id ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#888] hover:text-[#1A1A1A]"}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="hidden md:block w-px bg-[#DDD8D0] mx-2 self-stretch" />
                  <button onClick={() => setTab("summary")}
                    className={`px-3 md:px-5 py-3 font-bold uppercase tracking-wider text-xs md:text-sm transition-all border-b-2 -mb-[2px] whitespace-nowrap ${tab === "summary" ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#888] hover:text-[#1A1A1A]"}`}>
                    Summary
                  </button>
                </div>
              </div>

              {/* Toolbar — desktop only (mobile toolbar is above) */}
              <div className="hidden md:flex items-center gap-1 flex-shrink-0 pl-2">
                {!sharedToken && (
                  <button onClick={handlePlanImport} title="Import dimensions from building plans PDF"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-[#E85D26] transition-colors whitespace-nowrap">
                    <FileUp size={15} />
                    <span>Import Plans</span>
                  </button>
                )}
                {sharedToken ? (
                  <span className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider whitespace-nowrap ${saveStatus === "saved" ? "text-green-600" : saveStatus === "saving" ? "text-yellow-500" : "text-red-500"}`}>
                    {saveStatus === "saved" ? <Check size={15} /> : <RotateCcw size={15} className={saveStatus === "saving" ? "animate-spin" : ""} />}
                    {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
                  </span>
                ) : (
                  <button onClick={() => void handleInvite()} disabled={inviteCreating} title="Create an invite link for team members"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-[#E85D26] transition-colors whitespace-nowrap disabled:opacity-50">
                    <Users size={15} />
                    <span>{inviteCreating ? "Creating…" : "Invite"}</span>
                  </button>
                )}
                {!sharedToken && (
                  <button onClick={handleClear} title="Clear all inputs and start over"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-red-500 transition-colors whitespace-nowrap">
                    <Trash2 size={15} />
                    <span>Clear</span>
                  </button>
                )}
                <button onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-[#1A1A1A] transition-colors whitespace-nowrap">
                  <Printer size={16} />
                  <span>Print</span>
                </button>
                {/* Customize tabs — desktop */}
                <div className="relative" ref={tabConfigAnchorRef}>
                  <button onClick={() => setShowTabConfig(v => !v)} title="Customize tabs"
                    className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors whitespace-nowrap font-semibold ${showTabConfig ? "text-[#E85D26]" : "text-[#888] hover:text-[#E85D26]"}`}>
                    <SlidersHorizontal size={15} />
                    <span>Tabs</span>
                  </button>
                  {showTabConfig && (
                    <TabConfigPanel visibleTabIds={visibleTabIds} setVisibleTabIds={setVisibleTabIds} onClose={() => setShowTabConfig(false)} />
                  )}
                </div>
              </div>
            </div>
          </div>

          <ProjectSetupCard />
          <div key={resetKey} className="bg-white border border-[#DDD8D0] p-4 sm:p-8 shadow-sm">
            {tab === "sitework" && <SiteWorkTab />}
            {tab === "foundation" && <FoundationTab />}
            {tab === "wall" && <WallTab />}
            {tab === "floor" && <FloorTab />}
            {tab === "roof" && <RoofTab />}
            {tab === "plumbing" && <PlumbingTab />}
            {tab === "electrical" && <ElectricalTab />}
            {tab === "hvac" && <HvacTab />}
            {tab === "summary" && <SummaryTab onNavigate={t => setTab(t)} onPrint={handlePrint} visibleTabIds={visibleTabIds} />}
          </div>

          <div className="no-print mt-6 p-4 border border-[#DDD8D0] bg-white text-xs text-[#999] leading-relaxed">
            <strong className="text-[#555]">Disclaimer:</strong> This tool provides rough estimates for budgeting purposes only. Material prices reflect typical retail rates. Labor rates are sourced from RSMeans national averages — actual costs vary by region, trade, and market conditions. Always verify quantities and pricing with your suppliers and subcontractors. This estimate does not include permits, equipment rental, delivery, overhead, profit margin, or sales tax.
          </div>
        </div>
      </main>

      <footer className="no-print bg-[#2C2825] py-8 border-t border-black/20 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/logo.png" alt="EstimatorX.pro" className="h-10 object-contain brightness-0 invert opacity-60" />
          <span className="text-[#A09890] text-sm">&copy; {new Date().getFullYear()} EstimatorX.pro. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
