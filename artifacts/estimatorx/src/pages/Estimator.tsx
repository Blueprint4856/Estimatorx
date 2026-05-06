import { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { ChevronRight, Printer, RotateCcw, Link2, Trash2, Check, Plus, X } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";

type Tab = "wall" | "floor" | "roof" | "plumbing" | "electrical" | "hvac" | "summary";
const WASTE = 1.10;

/* ─────────────────────────────────────────────
   SHARED TYPES
───────────────────────────────────────────── */
interface MatItem { label: string; qty: number; unit: string; price: number; }
interface LaborItem { label: string; qty: number; unit: string; nationalAvg: number; }
type LaborRates = Record<string, string>;
type MatPrices = Record<string, string>;

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
} as const;

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

// ── Feature gate — paywall integration point ──────────────────────────────
type GatedFeature = "share" | "print" | "export";
function useFeatureAccess(_feature: GatedFeature): { allowed: boolean } {
  return { allowed: true };
}

function UpgradeModal({ feature, onClose }: { feature: GatedFeature; onClose: () => void }) {
  const label = feature === "share" ? "Shareable Links" : feature === "print" ? "Print / PDF Export" : "Export";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white max-w-sm w-full mx-4 p-8 text-center shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 bg-[#FFF0E8] rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-[#E85D26] text-2xl font-black">Pro</span>
        </div>
        <h2 className="text-xl font-black text-[#1A1A1A] mb-2">Upgrade to Unlock</h2>
        <p className="text-sm text-[#666] mb-6">
          <strong>{label}</strong> is available on the Pro plan. Upgrade to share estimates with clients, export PDFs, and more.
        </p>
        <button onClick={onClose} className="w-full bg-[#E85D26] text-white font-bold py-3 hover:bg-[#c94d1f] transition-colors">Got it</button>
        <button onClick={onClose} className="mt-3 w-full text-sm text-[#999] hover:text-[#555] transition-colors">Maybe later</button>
      </div>
    </div>
  );
}

// ── URL state helpers ──────────────────────────────────────────────────────
function readAllLocalStorage() {
  const get = <T,>(key: string): T | undefined => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : undefined; }
    catch { return undefined; }
  };
  return {
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
  };
}

type SnapshotState = ReturnType<typeof readAllLocalStorage>;

function serializeState(state: SnapshotState): string {
  try { return btoa(encodeURIComponent(JSON.stringify(state))); } catch { return ""; }
}
function deserializeState(encoded: string): SnapshotState | null {
  try { return JSON.parse(decodeURIComponent(atob(encoded))) as SnapshotState; } catch { return null; }
}
function primeLocalStorageFromSnapshot(state: SnapshotState) {
  const set = (key: string, val: unknown) => {
    if (val != null) try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  };
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
}
function clearAllLocalStorage() {
  Object.values(SK).forEach(k => { try { localStorage.removeItem(k); } catch {} });
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
function MaterialsTable({ rows, prices, onPriceChange, onReset }: {
  rows: MatItem[];
  prices: MatPrices;
  onPriceChange: (label: string, val: string) => void;
  onReset: () => void;
}) {
  const total = rows.reduce((s, r) => s + r.qty * effectiveMatPrice(r, prices), 0);
  return (
    <div className="border border-[#DDD8D0] overflow-hidden">
      <div className="bg-[#2C2825] text-white px-6 py-3 flex justify-between items-center">
        <span className="font-bold uppercase tracking-widest text-xs">Materials</span>
        <div className="flex items-center gap-4">
          <button onClick={onReset} className="no-print flex items-center gap-1.5 text-xs text-white/50 hover:text-[#E85D26] transition-colors">
            <RotateCcw size={11} /> Reset prices
          </button>
          <span className="text-[#E85D26] font-black text-base">${fmt(total)}</span>
        </div>
      </div>
      <table className="w-full text-sm">
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
            const changed = parseFloat(prices[r.label]) !== r.price;
            return (
              <tr key={i} className="hover:bg-[#FAF8F5]">
                <td className="px-5 py-2.5 text-[#1A1A1A] font-medium">
                  <div>{r.label}</div>
                  {changed && <div className="text-[10px] text-[#999]">Default: ${r.price.toFixed(2)}/{r.unit}</div>}
                </td>
                <td className="px-3 py-2.5 text-right text-[#555]">{r.qty.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right text-[#999]">{r.unit}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[#999] text-xs">$</span>
                    <input type="number" min="0" step="0.01"
                      value={prices[r.label] ?? String(r.price)}
                      onChange={e => onPriceChange(r.label, e.target.value)}
                      className={`no-print w-24 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${changed ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`} />
                    <span className={`print-rate-display hidden text-sm ${changed ? "text-[#E85D26] font-semibold" : "text-[#555]"}`}>${fmt(ep)}</span>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-right font-semibold text-[#1A1A1A]">${fmt(r.qty * ep)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-5 py-2.5 bg-[#FAF8F5] border-t border-[#DDD8D0] text-[10px] text-[#AAA]">
        Unit prices are national averages. Edit any price above to match your local supplier costs.
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
        <table className="w-full text-sm">
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
        <table className="w-full text-sm">
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

function LaborTable({ items, rates, onChange, onReset }: { items: LaborItem[]; rates: LaborRates; onChange: (l: string, v: string) => void; onReset: () => void; }) {
  const total = items.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);
  return (
    <div className="border border-[#DDD8D0] overflow-hidden">
      <div className="bg-[#1A1A1A] text-white px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="font-bold uppercase tracking-widest text-xs">Labor</span>
          <span className="text-[10px] bg-[#E85D26]/20 text-[#E85D26] border border-[#E85D26]/30 px-2 py-0.5 uppercase tracking-wider font-bold">RSMeans National Avg</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onReset} className="no-print flex items-center gap-1.5 text-xs text-white/50 hover:text-[#E85D26] transition-colors">
            <RotateCcw size={11} /> Reset rates
          </button>
          <span className="text-[#E85D26] font-black text-base">${fmt(total)}</span>
        </div>
      </div>
      <table className="w-full text-sm">
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
            const saved = rates[item.label];
            const changed = saved !== undefined && parseFloat(saved) !== item.nationalAvg;
            return (
              <tr key={i} className="hover:bg-[#FAF8F5]">
                <td className="px-5 py-2 text-[#1A1A1A] font-medium">
                  <div>{item.label}</div>
                  {changed && <div className="text-[10px] text-[#999]">Nat&apos;l avg: ${item.nationalAvg.toFixed(2)}/{item.unit}</div>}
                </td>
                <td className="px-3 py-2 text-right text-[#555]">{item.qty.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-[#999]">{item.unit}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[#999] text-xs">$</span>
                    <input type="number" min="0" step="0.01"
                      value={rates[item.label] ?? String(item.nationalAvg)}
                      onChange={e => onChange(item.label, e.target.value)}
                      className={`no-print w-24 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${changed ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`} />
                    <span className={`print-rate-display hidden text-sm ${changed ? "text-[#E85D26] font-semibold" : "text-[#555]"}`}>${fmt(rate)}</span>
                  </div>
                </td>
                <td className="px-5 py-2 text-right font-semibold text-[#1A1A1A]">${fmt(item.qty * rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-5 py-2.5 bg-[#FAF8F5] border-t border-[#DDD8D0] text-[10px] text-[#AAA]">
        Rates are RSMeans national averages. Edit any rate above to match your region or trade costs.
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

/* ─────────────────────────────────────────────
   WALL TAB
───────────────────────────────────────────── */
type StudSize = "2x4-16" | "2x6-16" | "2x6-24";
interface WallInputs { linearFeet: string; ceilingHeight: string; studSize: StudSize; exteriorSheathing: boolean; insulation: boolean; drywall: boolean; }

const STUD_CONFIG: Record<StudSize, { studLabel: string; plateLabel: string; studPrice: number; platePrice: number; ocSpacing: number; insulLabel: string; insulPrice: number }> = {
  "2x4-16": { studLabel: "2×4×8 Studs (16\" OC)", plateLabel: "2×4×8 Plates (3 per run)", studPrice: 5.48, platePrice: 5.48, ocSpacing: 1.333, insulLabel: "R-13 Batt Insulation", insulPrice: 0.55 },
  "2x6-16": { studLabel: "2×6×8 Studs (16\" OC)", plateLabel: "2×6×8 Plates (3 per run)", studPrice: 8.98, platePrice: 8.98, ocSpacing: 1.333, insulLabel: "R-21 Batt Insulation", insulPrice: 0.82 },
  "2x6-24": { studLabel: "2×6×8 Studs (24\" OC)", plateLabel: "2×6×8 Plates (3 per run)", studPrice: 8.98, platePrice: 8.98, ocSpacing: 2.0,   insulLabel: "R-21 Batt Insulation", insulPrice: 0.82 },
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

const WALL_MAT_PRICES = { osb: 34.98, drywall: 15.98 };
const DEFAULT_WALL: WallInputs = { linearFeet: "", ceilingHeight: "9", studSize: "2x4-16", exteriorSheathing: true, insulation: true, drywall: true };

function getWallMatItems(inputs: WallInputs): MatItem[] {
  const lf = parseFloat(inputs.linearFeet) || 0;
  const h = parseFloat(inputs.ceilingHeight) || 9;
  const area = lf * h;
  const sc = STUD_CONFIG[inputs.studSize] ?? STUD_CONFIG["2x4-16"];
  const family = inputs.studSize.startsWith("2x4") ? "2x4" : "2x6";
  const precutLabel = PRECUT_LABEL[inputs.ceilingHeight] ?? '92⅝"';
  const studPrice = STUD_PRICES[family][inputs.ceilingHeight] ?? STUD_PRICES[family]["8"];
  const studDim = family === "2x4" ? "2×4" : "2×6";
  const ocLabel = inputs.studSize === "2x6-24" ? "24\" OC" : "16\" OC";
  const studLabel = `${studDim}×${precutLabel} Pre-Cut Studs (${ocLabel})`;
  const plateLabel = `${studDim}×8 Plates (3 per run)`;
  return [
    { label: studLabel, qty: Math.ceil((lf / sc.ocSpacing + 1) * WASTE), unit: "ea", price: studPrice },
    { label: plateLabel, qty: Math.ceil(lf * 3 * WASTE / 8), unit: "ea", price: sc.platePrice },
    ...(inputs.exteriorSheathing ? [
      { label: "Advantech Wall Sheathing 7/16\" (4×8)", qty: Math.ceil(area * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.osb },
      { label: "Advantech Seam Tape (75 LF roll)", qty: Math.max(1, Math.ceil(area * WASTE / 300)), unit: "roll", price: 24.98 },
    ] : []),
    ...(inputs.insulation ? [{ label: sc.insulLabel, qty: Math.ceil(area * WASTE), unit: "sqft", price: sc.insulPrice }] : []),
    ...(inputs.drywall ? [{ label: "½\" Drywall (4×8)", qty: Math.ceil(area * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.drywall }] : []),
  ];
}
function getWallLaborItems(inputs: WallInputs): LaborItem[] {
  const lf = parseFloat(inputs.linearFeet) || 0;
  const h = parseFloat(inputs.ceilingHeight) || 9;
  const area = Math.round(lf * h);
  return [
    { label: "Stud Framing", qty: area, unit: "sqft", nationalAvg: 1.85 },
    ...(inputs.exteriorSheathing ? [{ label: "Advantech Sheathing Install & Seam Tape", qty: area, unit: "sqft", nationalAvg: 0.52 }] : []),
    ...(inputs.insulation ? [{ label: "Insulation (Batt) Install", qty: area, unit: "sqft", nationalAvg: 0.38 }] : []),
    ...(inputs.drywall ? [{ label: "Drywall Hang & Finish", qty: area, unit: "sqft", nationalAvg: 1.65 }] : []),
  ];
}
function WallTab() {
  const [rawInputs, setInputs] = useLocalStorage<WallInputs>(SK.wall, DEFAULT_WALL);
  const inputs: WallInputs = { ...DEFAULT_WALL, ...rawInputs, studSize: migrateStudSize(rawInputs?.studSize) };
  const laborItems = getWallLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.wallRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.wallMatPrices, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.wallCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.wallCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => setSavedRates({}), [setSavedRates]);
  const matItems = getWallMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatReset = useCallback(() => setSavedMatPrices({}), [setSavedMatPrices]);
  const matTotal = matItems.reduce((s, r) => s + r.qty * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const hasResults = (parseFloat(inputs.linearFeet) || 0) > 0;
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6 no-print">
        <Field label="Total Linear Feet of Wall" note="Include all walls — exterior and interior">
          <NumberInput value={inputs.linearFeet} onChange={v => setInputs(p => ({ ...p, linearFeet: v }))} placeholder="e.g. 240" />
        </Field>
        <Field label="Ceiling Height (ft)">
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
          <Toggle checked={inputs.drywall} onChange={v => setInputs(p => ({ ...p, drywall: v }))} label={'Interior Drywall (½")'} />
        </div>
      </div>
      {hasResults ? (
        <div className="mt-8 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Enter wall dimensions above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   FLOOR TAB
───────────────────────────────────────────── */
interface FloorInputs { sqft: string; finish: string; includeSubfloor: boolean; }
const FLOOR_MAT_PRICES: Record<string, number> = { lvp: 2.89, carpet: 2.49, hardwood: 5.98, tile: 3.49, none: 0 };
const FLOOR_LABELS: Record<string, string> = { lvp: "LVP — Luxury Vinyl Plank", carpet: "Carpet", hardwood: "Hardwood", tile: "Ceramic / Porcelain Tile", none: "None" };
const FLOOR_LABOR: Record<string, number> = { lvp: 2.15, carpet: 1.45, hardwood: 4.25, tile: 5.75, none: 0 };
const DEFAULT_FLOOR: FloorInputs = { sqft: "", finish: "lvp", includeSubfloor: true };

function getFloorMatItems(inputs: FloorInputs): MatItem[] {
  const sqft = parseFloat(inputs.sqft) || 0;
  return [
    ...(inputs.includeSubfloor ? [
      { label: "Advantech 3/4\" Subfloor Panel (4×8)", qty: Math.ceil(sqft * WASTE / 32), unit: "sheet", price: 52.98 },
      { label: "Subfloor Construction Adhesive (28 oz tube)", qty: Math.max(1, Math.ceil(sqft * WASTE / 40)), unit: "tube", price: 8.50 },
    ] : []),
    ...(inputs.finish !== "none" ? [{ label: FLOOR_LABELS[inputs.finish], qty: Math.ceil(sqft * WASTE), unit: "sqft", price: FLOOR_MAT_PRICES[inputs.finish] ?? 0 }] : []),
  ];
}
function getFloorLaborItems(inputs: FloorInputs): LaborItem[] {
  const sqft = Math.round(parseFloat(inputs.sqft) || 0);
  return [
    ...(inputs.includeSubfloor ? [{ label: "Advantech Subfloor Install (glued & screwed)", qty: sqft, unit: "sqft", nationalAvg: 0.95 }] : []),
    ...(inputs.finish !== "none" ? [{ label: `${FLOOR_LABELS[inputs.finish]} Installation`, qty: sqft, unit: "sqft", nationalAvg: FLOOR_LABOR[inputs.finish] ?? 0 }] : []),
  ];
}
function FloorTab() {
  const [inputs, setInputs] = useLocalStorage<FloorInputs>(SK.floor, DEFAULT_FLOOR);
  const laborItems = getFloorLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.floorRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.floorMatPrices, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.floorCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.floorCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => setSavedRates({}), [setSavedRates]);
  const matItems = getFloorMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatReset = useCallback(() => setSavedMatPrices({}), [setSavedMatPrices]);
  const matTotal = matItems.reduce((s, r) => s + r.qty * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const hasResults = (parseFloat(inputs.sqft) || 0) > 0;
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6 no-print">
        <Field label="Floor Area (sq ft)">
          <NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 1200" />
        </Field>
        <Field label="Finish Flooring Type">
          <select value={inputs.finish} onChange={e => setInputs(p => ({ ...p, finish: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            <option value="lvp">LVP — Luxury Vinyl Plank</option>
            <option value="carpet">Carpet</option>
            <option value="hardwood">Hardwood</option>
            <option value="tile">Ceramic / Porcelain Tile</option>
            <option value="none">None (subfloor only)</option>
          </select>
        </Field>
        <div>
          <Toggle checked={inputs.includeSubfloor} onChange={v => setInputs(p => ({ ...p, includeSubfloor: v }))} label={'Include Advantech 3/4" Subfloor'} />
        </div>
      </div>
      {hasResults ? (
        <div className="mt-8 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
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
interface RoofInputs { footprintSqft: string; pitch: string; archShingles: boolean; iceWater: boolean; includeDecking: boolean; }
const PITCH_FACTORS: Record<string, number> = { "4:12": 1.054, "5:12": 1.083, "6:12": 1.118, "7:12": 1.158, "8:12": 1.202, "9:12": 1.250, "10:12": 1.302, "12:12": 1.414 };
const DEFAULT_ROOF: RoofInputs = { footprintSqft: "", pitch: "6:12", archShingles: true, iceWater: true, includeDecking: false };

function getRoofMatItems(inputs: RoofInputs): MatItem[] {
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actual = fp * factor;
  return [
    ...(inputs.archShingles ? [{ label: "Architectural Shingles (bundle)", qty: Math.ceil((actual / 100) * 3.33 * WASTE), unit: "bundle", price: 38.98 }] : []),
    { label: "Synthetic Underlayment", qty: Math.ceil(actual * WASTE), unit: "sqft", price: 0.12 },
    ...(inputs.includeDecking ? [
      { label: "Advantech Roof Sheathing 7/16\" (4×8)", qty: Math.ceil(actual * WASTE / 32), unit: "sheet", price: 34.98 },
      { label: "Advantech Seam Tape (75 LF roll)", qty: Math.max(1, Math.ceil(actual * WASTE / 300)), unit: "roll", price: 24.98 },
    ] : []),
    ...(inputs.iceWater ? [{ label: "Ice & Water Shield", qty: Math.ceil(fp * 0.25 * WASTE), unit: "sqft", price: 0.45 }] : []),
  ];
}
function getRoofLaborItems(inputs: RoofInputs): LaborItem[] {
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actual = Math.round(fp * factor);
  return [
    ...(inputs.archShingles ? [{ label: "Shingle Installation", qty: actual, unit: "sqft", nationalAvg: 0.75 }] : []),
    { label: "Underlayment Install", qty: actual, unit: "sqft", nationalAvg: 0.12 },
    ...(inputs.includeDecking ? [{ label: "Advantech Roof Sheathing Install & Seam Tape", qty: actual, unit: "sqft", nationalAvg: 0.68 }] : []),
    ...(inputs.iceWater ? [{ label: "Ice & Water Shield Install", qty: Math.round(fp * 0.25), unit: "sqft", nationalAvg: 0.28 }] : []),
  ];
}
function RoofTab() {
  const [inputs, setInputs] = useLocalStorage<RoofInputs>(SK.roof, DEFAULT_ROOF);
  const laborItems = getRoofLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.roofRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.roofMatPrices, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.roofCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.roofCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => setSavedRates({}), [setSavedRates]);
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actualArea = fp * factor;
  const matItems = getRoofMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatReset = useCallback(() => setSavedMatPrices({}), [setSavedMatPrices]);
  const matTotal = matItems.reduce((s, r) => s + r.qty * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6 mb-6 no-print">
        <Field label="Roof Footprint (sq ft)" note="Measure the floor plan area under the roof — not the actual roof surface">
          <NumberInput value={inputs.footprintSqft} onChange={v => setInputs(p => ({ ...p, footprintSqft: v }))} placeholder="e.g. 1400" />
        </Field>
        <Field label="Roof Pitch">
          <select value={inputs.pitch} onChange={e => setInputs(p => ({ ...p, pitch: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            {Object.keys(PITCH_FACTORS).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
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
      {fp > 0 ? (
        <div className="mt-8 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <CustomLaborRows items={customLabor} onChange={setCustomLabor} />
          <div className="mt-3" />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <div className="mt-2"><ResultNote /></div>
        </div>
      ) : <EmptyState text="Enter your roof footprint above to see your estimate." />}
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
  if (pex12 > 0) items.push({ label: 'PEX-A ½" Supply Branches', qty: pex12, unit: "LF", price: 0.68 });
  if (pex34 > 0) items.push({ label: 'PEX-A ¾" Supply Trunk / Outdoor Runs', qty: pex34, unit: "LF", price: 0.98 });
  if (pvc4 > 0) items.push({ label: '4" PVC Main Drain / Stack', qty: pvc4, unit: "LF", price: 4.25 });
  if (pvc3 > 0) items.push({ label: '3" PVC Drain Branches (Bathrooms)', qty: pvc3, unit: "LF", price: 2.85 });
  if (pvc2 > 0) items.push({ label: '2" PVC Drain (Kitchen/Laundry)', qty: pvc2, unit: "LF", price: 1.95 });
  if (shutoffs > 0) items.push({ label: "½\" Shut-Off Valves", qty: shutoffs, unit: "ea", price: 8.50 });
  if (ptraps > 0) items.push({ label: "P-Traps", qty: ptraps, unit: "ea", price: 12.50 });
  if (waxRings > 0) items.push({ label: "Toilet Wax Ring & Closet Flange", qty: waxRings, unit: "ea", price: 8.50 });
  if (i.spigots > 0) items.push({ label: "Frost-Free Outdoor Spigot", qty: i.spigots, unit: "ea", price: 22.50 });
  if (i.hasLaundry) items.push({ label: "Laundry Box & Valves", qty: 1, unit: "ea", price: 38.00 });
  return items;
}
function getPlumbingLaborItems(i: PlumbingInputs): LaborItem[] {
  const items: LaborItem[] = [];
  if (i.fullBaths > 0) items.push({ label: "Full Bathroom Rough-In", qty: i.fullBaths, unit: "ea", nationalAvg: 485 });
  if (i.halfBaths > 0) items.push({ label: "Half Bath / Powder Room Rough-In", qty: i.halfBaths, unit: "ea", nationalAvg: 310 });
  if (i.hasKitchen) items.push({ label: "Kitchen Plumbing Rough-In", qty: 1, unit: "ea", nationalAvg: 225 });
  if (i.hasLaundry) items.push({ label: "Laundry Hookup Rough-In", qty: 1, unit: "ea", nationalAvg: 185 });
  if (i.spigots > 0) items.push({ label: "Outdoor Spigot Rough-In", qty: i.spigots, unit: "ea", nationalAvg: 145 });
  return items;
}
function PlumbingTab() {
  const [inputs, setInputs] = useLocalStorage<PlumbingInputs>(SK.plumbing, DEFAULT_PLUMBING);
  const laborItems = getPlumbingLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.plumbingRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.plumbMatPrices, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.plumbCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.plumbCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => setSavedRates({}), [setSavedRates]);
  const matItems = getPlumbingMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatReset = useCallback(() => setSavedMatPrices({}), [setSavedMatPrices]);
  const matTotal = matItems.reduce((s, r) => s + r.qty * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const totalRooms = inputs.fullBaths + inputs.halfBaths + (inputs.hasKitchen ? 1 : 0) + (inputs.hasLaundry ? 1 : 0) + inputs.spigots;
  const sqftVal = parseFloat(inputs.homeSqft) || 0;
  const pf = sqftVal > 0 ? Math.max(1.0, parseFloat(Math.sqrt(sqftVal / 1000).toFixed(2))) : 1;
  return (
    <div>
      <p className="text-sm text-[#666] mb-6 no-print">Pipe quantities scale with house size — a bathroom at the far end of a 3,000 sqft home needs significantly more pipe than one in a 1,000 sqft house.</p>
      <div className="mb-6 no-print">
        <Field label="Home Size (sq ft)" note="Used to estimate pipe run lengths from fixtures to main stack and service entry">
          <input type="number" min={0} placeholder="e.g. 2000" value={inputs.homeSqft}
            onChange={e => setInputs(p => ({ ...p, homeSqft: e.target.value }))}
            className="w-full border border-[#DDD8D0] px-4 py-3 text-base focus:outline-none focus:border-[#E85D26]" />
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
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
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
  const panelPrice = panelSize === "400A" ? 1250 : 485;
  const items: MatItem[] = [{ label: `${panelSize} Main Panel with Main Breaker`, qty: 1, unit: "ea", price: panelPrice }];
  if (romex142 > 0) items.push({ label: "14/2 Romex — Lighting Circuits", qty: romex142, unit: "LF", price: 0.55 });
  if (romex122 > 0) items.push({ label: "12/2 Romex — Outlet & General Circuits", qty: romex122, unit: "LF", price: 0.65 });
  if (romex103 > 0) items.push({ label: "10/3 Romex — Range / Dryer (240V)", qty: romex103, unit: "LF", price: 1.45 });
  if (romex63 > 0) items.push({ label: "6/3 Romex — EV Charger / Hot Tub (240V)", qty: romex63, unit: "LF", price: 2.85 });
  items.push({ label: "Standard Duplex Outlets", qty: Math.max(0, totalOutlets - gfciOutlets), unit: "ea", price: 2.85 });
  items.push({ label: "GFCI Outlets (Kitchen, Bath, Garage, Exterior)", qty: gfciOutlets, unit: "ea", price: 14.50 });
  items.push({ label: "AFCI Breakers (Bedrooms & Living Areas)", qty: afciBreakers, unit: "ea", price: 38.00 });
  if (stdBreakers > 0) items.push({ label: "Standard 15/20A Circuit Breakers", qty: stdBreakers, unit: "ea", price: 8.50 });
  if (twoPolBreakers > 0) items.push({ label: "2-Pole 240V Breakers (Appliances)", qty: twoPolBreakers, unit: "ea", price: 18.50 });
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
    { label: "Panel Installation & Setup", qty: 1, unit: "ea", nationalAvg: 425 },
    { label: "Circuit Rough-In (per circuit)", qty: totalCircuits, unit: "circuit", nationalAvg: 195 },
  ];
  if (appliances.evCharger) items.push({ label: "EV Charger Circuit (240V)", qty: 1, unit: "ea", nationalAvg: 285 });
  if (appliances.hotTub) items.push({ label: "Hot Tub / Spa Circuit (240V, GFCI)", qty: 1, unit: "ea", nationalAvg: 345 });
  return items;
}
function ElectricalTab() {
  const [inputs, setInputs] = useLocalStorage<ElectricalInputs>(SK.electrical, DEFAULT_ELECTRICAL);
  const setApp = useCallback((key: keyof ElectricalInputs["appliances"], val: boolean) =>
    setInputs(p => ({ ...p, appliances: { ...p.appliances, [key]: val } })), [setInputs]);
  const laborItems = getElectricalLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.electricalRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.elecMatPrices, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.elecCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.elecCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => setSavedRates({}), [setSavedRates]);
  const sqft = parseFloat(inputs.sqft) || 0;
  const matItems = getElectricalMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatReset = useCallback(() => setSavedMatPrices({}), [setSavedMatPrices]);
  const matTotal = matItems.reduce((s, r) => s + r.qty * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const panelSize = (inputs.appliances.evCharger && inputs.appliances.hotTub) ? "400A" : "200A";
  return (
    <div>
      <p className="text-sm text-[#666] mb-6 no-print">Tell us about your home — we handle the circuit math.</p>
      <div className="grid sm:grid-cols-3 gap-8 mb-8 no-print">
        <div className="sm:col-span-1"><Field label="Home Size (sq ft)"><NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 2000" /></Field></div>
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
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
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
interface HvacInputs { sqft: string; stories: string; climate: string; system: string; }
const DEFAULT_HVAC: HvacInputs = { sqft: "", stories: "1", climate: "mixed", system: "gas-central" };
const HEATING_BTU: Record<string, number> = { cold: 45, mixed: 35, hot: 25 };
const COOLING_BTU: Record<string, number> = { cold: 20, mixed: 25, hot: 35 };

function sizeFurnace(btu: number): { label: string; price: number } {
  if (btu <= 60000) return { label: "60,000 BTU Gas Furnace", price: 785 };
  if (btu <= 80000) return { label: "80,000 BTU Gas Furnace", price: 985 };
  if (btu <= 100000) return { label: "100,000 BTU Gas Furnace", price: 1245 };
  return { label: "120,000 BTU Gas Furnace", price: 1485 };
}
function sizeAC(btu: number): { label: string; tons: number; price: number } {
  const sizes = [{ btu: 18000, tons: 1.5, price: 1085 }, { btu: 24000, tons: 2, price: 1285 }, { btu: 30000, tons: 2.5, price: 1385 }, { btu: 36000, tons: 3, price: 1485 }, { btu: 42000, tons: 3.5, price: 1685 }, { btu: 48000, tons: 4, price: 1885 }, { btu: 60000, tons: 5, price: 2285 }];
  const match = sizes.find(s => s.btu >= btu) ?? sizes[sizes.length - 1];
  return { label: `${match.tons}-Ton A/C Condenser`, tons: match.tons, price: match.price };
}
function sizeHP(btu: number): { label: string; tons: number; price: number } {
  const sizes = [{ btu: 18000, tons: 1.5, price: 1685 }, { btu: 24000, tons: 2, price: 1885 }, { btu: 30000, tons: 2.5, price: 2185 }, { btu: 36000, tons: 3, price: 2485 }, { btu: 42000, tons: 3.5, price: 2785 }, { btu: 48000, tons: 4, price: 3085 }, { btu: 60000, tons: 5, price: 3685 }];
  const match = sizes.find(s => s.btu >= btu) ?? sizes[sizes.length - 1];
  return { label: `${match.tons}-Ton Heat Pump`, tons: match.tons, price: match.price };
}
function getHvacMatItems(inp: HvacInputs): MatItem[] {
  const sqft = parseFloat(inp.sqft) || 0;
  const { climate, system } = inp;
  const heatBtu = sqft * (HEATING_BTU[climate] ?? 35);
  const coolBtu = sqft * (COOLING_BTU[climate] ?? 25);
  const registers = Math.ceil(sqft / 150);
  const returns = Math.ceil(sqft / 300);
  const ductLF = Math.ceil(sqft * 0.85 * WASTE);
  if (system === "mini-split") {
    const heads = Math.ceil(sqft / 500);
    return [
      { label: `Mini-Split Indoor Heads (${heads}×12,000 BTU)`, qty: heads, unit: "ea", price: 750 },
      { label: "Mini-Split Outdoor Condenser Unit", qty: 1, unit: "ea", price: 1200 + Math.max(0, heads - 2) * 850 },
      { label: "Refrigerant Lineset", qty: heads * 25, unit: "LF", price: 5.50 },
      { label: "Control Wiring", qty: heads * 25, unit: "LF", price: 0.85 },
    ];
  }
  const items: MatItem[] = [];
  if (system === "gas-central") {
    const furnace = sizeFurnace(heatBtu);
    const ac = sizeAC(coolBtu);
    items.push({ label: furnace.label, qty: 1, unit: "ea", price: furnace.price });
    items.push({ label: ac.label, qty: 1, unit: "ea", price: ac.price });
    items.push({ label: "Evaporator Coil / Air Handler", qty: 1, unit: "ea", price: 650 });
    items.push({ label: "Refrigerant Lineset (25 LF)", qty: 25, unit: "LF", price: 5.50 });
  } else {
    const hp = sizeHP(Math.max(heatBtu, coolBtu));
    items.push({ label: hp.label, qty: 1, unit: "ea", price: hp.price });
    items.push({ label: "Air Handler / Indoor Unit", qty: 1, unit: "ea", price: 685 });
    items.push({ label: "Refrigerant Lineset (25 LF)", qty: 25, unit: "LF", price: 5.50 });
  }
  items.push({ label: "Flex Duct", qty: ductLF, unit: "LF", price: 2.50 });
  items.push({ label: "Supply Registers", qty: registers, unit: "ea", price: 13.50 });
  items.push({ label: "Return Air Grilles", qty: returns, unit: "ea", price: 18.50 });
  items.push({ label: "Programmable Thermostat", qty: 1, unit: "ea", price: 125 });
  return items;
}
function getHvacLaborItems(inp: HvacInputs): LaborItem[] {
  const sqft = parseFloat(inp.sqft) || 0;
  if (inp.system === "mini-split") {
    const heads = Math.ceil(sqft / 500);
    return [
      { label: "Mini-Split Installation (per head)", qty: heads, unit: "head", nationalAvg: 485 },
      { label: "Outdoor Unit Set & Startup", qty: 1, unit: "ea", nationalAvg: 385 },
    ];
  }
  return [{ label: "HVAC Rough-In & Equipment Set", qty: sqft, unit: "sqft", nationalAvg: 1.85 }];
}
function HvacTab() {
  const [inputs, setInputs] = useLocalStorage<HvacInputs>(SK.hvac, DEFAULT_HVAC);
  const laborItems = getHvacLaborItems(inputs);
  const [savedRates, setSavedRates] = useLocalStorage<LaborRates>(SK.hvacRates, {});
  const [savedMatPrices, setSavedMatPrices] = useLocalStorage<MatPrices>(SK.hvacMatPrices, {});
  const [customMat, setCustomMat] = useLocalStorage<CustomMatRow[]>(SK.hvacCMat, []);
  const [customLabor, setCustomLabor] = useLocalStorage<CustomLaborRow[]>(SK.hvacCLab, []);
  const rates: LaborRates = { ...defaultRates(laborItems), ...savedRates };
  const handleRateChange = useCallback((label: string, val: string) => setSavedRates(r => ({ ...r, [label]: val })), [setSavedRates]);
  const handleReset = useCallback(() => setSavedRates({}), [setSavedRates]);
  const sqft = parseFloat(inputs.sqft) || 0;
  const heatBtu = sqft * (HEATING_BTU[inputs.climate] ?? 35);
  const coolBtu = sqft * (COOLING_BTU[inputs.climate] ?? 25);
  const matItems = getHvacMatItems(inputs);
  const matPrices: MatPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
  const handleMatPriceChange = useCallback((label: string, val: string) => setSavedMatPrices(p => ({ ...p, [label]: val })), [setSavedMatPrices]);
  const handleMatReset = useCallback(() => setSavedMatPrices({}), [setSavedMatPrices]);
  const matTotal = matItems.reduce((s, r) => s + r.qty * effectiveMatPrice(r, matPrices), 0) + customMatTotal(customMat);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0) + customLaborTotal(customLabor);
  const heads = Math.ceil(sqft / 500);
  return (
    <div>
      <p className="text-sm text-[#666] mb-6 no-print">Tell us about your home — we calculate the equipment size you need.</p>
      <div className="grid md:grid-cols-2 gap-6 mb-6 no-print">
        <Field label="Home Size (sq ft)"><NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 2000" /></Field>
        <Field label="Number of Stories">
          <select value={inputs.stories} onChange={e => setInputs(p => ({ ...p, stories: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            <option value="1">1 story</option><option value="2">2 stories</option><option value="3">3 stories</option>
          </select>
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
          </select>
        </Field>
        {sqft > 0 && (
          <InfoBox>
            {inputs.system === "mini-split"
              ? <>Recommended: <strong>{heads} indoor {heads === 1 ? "head" : "heads"}</strong> to cover {sqft.toLocaleString()} sqft.</>
              : <>Estimated load: <strong>{Math.round(coolBtu / 12000 * 10) / 10} tons cooling</strong> / <strong>{Math.round(heatBtu / 1000)}k BTU heating</strong> for your climate.</>}
          </InfoBox>
        )}
      </div>
      {sqft > 0 ? (
        <div className="mt-4 flex flex-col gap-0">
          <MaterialsTable rows={matItems} prices={matPrices} onPriceChange={handleMatPriceChange} onReset={handleMatReset} />
          <CustomMatRows items={customMat} onChange={setCustomMat} />
          <div className="mt-3" />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
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
function SummaryTab({ onNavigate, onPrint }: { onNavigate: (t: Exclude<Tab, "summary">) => void; onPrint: () => void }) {
  // Read all tab states — same keys as individual tabs; fresh on every mount
  const [wallInputs] = useLocalStorage<WallInputs>(SK.wall, DEFAULT_WALL);
  const [wallSR] = useLocalStorage<LaborRates>(SK.wallRates, {});
  const [wallMP] = useLocalStorage<MatPrices>(SK.wallMatPrices, {});
  const [wallCM] = useLocalStorage<CustomMatRow[]>(SK.wallCMat, []);
  const [wallCL] = useLocalStorage<CustomLaborRow[]>(SK.wallCLab, []);

  const [floorInputs] = useLocalStorage<FloorInputs>(SK.floor, DEFAULT_FLOOR);
  const [floorSR] = useLocalStorage<LaborRates>(SK.floorRates, {});
  const [floorMP] = useLocalStorage<MatPrices>(SK.floorMatPrices, {});
  const [floorCM] = useLocalStorage<CustomMatRow[]>(SK.floorCMat, []);
  const [floorCL] = useLocalStorage<CustomLaborRow[]>(SK.floorCLab, []);

  const [roofInputs] = useLocalStorage<RoofInputs>(SK.roof, DEFAULT_ROOF);
  const [roofSR] = useLocalStorage<LaborRates>(SK.roofRates, {});
  const [roofMP] = useLocalStorage<MatPrices>(SK.roofMatPrices, {});
  const [roofCM] = useLocalStorage<CustomMatRow[]>(SK.roofCMat, []);
  const [roofCL] = useLocalStorage<CustomLaborRow[]>(SK.roofCLab, []);

  const [plumbInputs] = useLocalStorage<PlumbingInputs>(SK.plumbing, DEFAULT_PLUMBING);
  const [plumbSR] = useLocalStorage<LaborRates>(SK.plumbingRates, {});
  const [plumbMP] = useLocalStorage<MatPrices>(SK.plumbMatPrices, {});
  const [plumbCM] = useLocalStorage<CustomMatRow[]>(SK.plumbCMat, []);
  const [plumbCL] = useLocalStorage<CustomLaborRow[]>(SK.plumbCLab, []);

  const [elecInputs] = useLocalStorage<ElectricalInputs>(SK.electrical, DEFAULT_ELECTRICAL);
  const [elecSR] = useLocalStorage<LaborRates>(SK.electricalRates, {});
  const [elecMP] = useLocalStorage<MatPrices>(SK.elecMatPrices, {});
  const [elecCM] = useLocalStorage<CustomMatRow[]>(SK.elecCMat, []);
  const [elecCL] = useLocalStorage<CustomLaborRow[]>(SK.elecCLab, []);

  const [hvacInputs] = useLocalStorage<HvacInputs>(SK.hvac, DEFAULT_HVAC);
  const [hvacSR] = useLocalStorage<LaborRates>(SK.hvacRates, {});
  const [hvacMP] = useLocalStorage<MatPrices>(SK.hvacMatPrices, {});
  const [hvacCM] = useLocalStorage<CustomMatRow[]>(SK.hvacCMat, []);
  const [hvacCL] = useLocalStorage<CustomLaborRow[]>(SK.hvacCLab, []);

  const [markup, setMarkup] = useLocalStorage<string>(SK.markup, "15");

  // Compute per-tab totals
  const computeTab = (
    label: string,
    tabId: Exclude<Tab, "summary">,
    matItems: MatItem[],
    cMat: CustomMatRow[],
    savedMatPrices: MatPrices,
    laborItems: LaborItem[],
    savedRates: LaborRates,
    cLab: CustomLaborRow[],
    hasData: boolean,
  ) => {
    const rates = { ...defaultRates(laborItems), ...savedRates };
    const matPrices = { ...defaultMatPrices(matItems), ...savedMatPrices };
    const mat = matItems.reduce((s, r) => s + r.qty * effectiveMatPrice(r, matPrices), 0) + customMatTotal(cMat);
    const lab = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0) + customLaborTotal(cLab);
    return { label, tabId, mat, lab, total: mat + lab, hasData };
  };

  const rows = [
    computeTab("Walls", "wall", getWallMatItems(wallInputs), wallCM, wallMP, getWallLaborItems(wallInputs), wallSR, wallCL, (parseFloat(wallInputs.linearFeet) || 0) > 0),
    computeTab("Floors", "floor", getFloorMatItems(floorInputs), floorCM, floorMP, getFloorLaborItems(floorInputs), floorSR, floorCL, (parseFloat(floorInputs.sqft) || 0) > 0),
    computeTab("Roofing", "roof", getRoofMatItems(roofInputs), roofCM, roofMP, getRoofLaborItems(roofInputs), roofSR, roofCL, (parseFloat(roofInputs.footprintSqft) || 0) > 0),
    computeTab("Plumbing", "plumbing", getPlumbingMatItems(plumbInputs), plumbCM, plumbMP, getPlumbingLaborItems(plumbInputs), plumbSR, plumbCL, (plumbInputs.fullBaths + plumbInputs.halfBaths + plumbInputs.spigots + (plumbInputs.hasKitchen ? 1 : 0) + (plumbInputs.hasLaundry ? 1 : 0)) > 0),
    computeTab("Electrical", "electrical", getElectricalMatItems(elecInputs), elecCM, elecMP, getElectricalLaborItems(elecInputs), elecSR, elecCL, (parseFloat(elecInputs.sqft) || 0) > 0),
    computeTab("Heating & Cooling", "hvac", getHvacMatItems(hvacInputs), hvacCM, hvacMP, getHvacLaborItems(hvacInputs), hvacSR, hvacCL, (parseFloat(hvacInputs.sqft) || 0) > 0),
  ];

  const filledRows = rows.filter(r => r.hasData);
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
          <p className="text-sm text-[#888] mb-6 max-w-sm mx-auto">Fill in at least one tab — Walls, Floors, Roofing, Plumbing, Electrical, or HVAC — to see your project total here.</p>
          <button onClick={() => onNavigate("wall")} className="bg-[#E85D26] text-white font-bold px-6 py-2.5 hover:bg-[#c94d1f] transition-colors text-sm">
            Start with Walls
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
                {rows.map(r => (
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
  { id: "wall", label: "Walls", group: "structural" },
  { id: "floor", label: "Floors", group: "structural" },
  { id: "roof", label: "Roofing", group: "structural" },
  { id: "plumbing", label: "Plumbing", group: "mep" },
  { id: "electrical", label: "Electrical", group: "mep" },
  { id: "hvac", label: "Heating & Cooling", group: "mep" },
];

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

export default function Estimator() {
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

  const [tab, setTab] = useState<Tab>("wall");
  const [resetKey, setResetKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<GatedFeature | null>(null);

  const shareAccess = useFeatureAccess("share");
  const printAccess = useFeatureAccess("print");

  const handleCopyLink = useCallback(() => {
    if (!shareAccess.allowed) { setUpgradeFeature("share"); return; }
    const state = readAllLocalStorage();
    const encoded = serializeState(state);
    const url = new URL(window.location.href);
    url.searchParams.set("s", encoded);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      window.history.replaceState({}, "", url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [shareAccess.allowed]);

  const handleClear = useCallback(() => {
    clearAllLocalStorage();
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    window.history.replaceState({}, "", url.toString());
    setTab("wall");
    setResetKey(k => k + 1);
  }, []);

  const handlePrint = useCallback(() => {
    if (!printAccess.allowed) { setUpgradeFeature("print"); return; }
    window.print();
  }, [printAccess.allowed]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F7F4F0] text-[#1A1A1A]">
      {upgradeFeature && <UpgradeModal feature={upgradeFeature} onClose={() => setUpgradeFeature(null)} />}

      <header className="no-print sticky top-0 z-50 w-full border-b border-[#E0DAD3] bg-white shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/">
            <img src="/logo.png" alt="EstimatorX.pro" className="h-16 object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-[#888]">
              <Link href="/" className="hover:text-[#E85D26] transition-colors">Home</Link>
              <ChevronRight size={14} />
              <span className="text-[#1A1A1A] font-semibold">Estimator</span>
            </div>
            <EstimatorUserNav />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="no-print bg-[#1A1A1A] text-white py-14">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-[2px] bg-[#E85D26]" />
              <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Quick Estimating Tool</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black font-serif uppercase mb-3">Material + Labor Estimator</h1>
            <p className="text-gray-400 text-lg max-w-2xl">Framing, floors, roofing, plumbing, electrical, and HVAC — all with RSMeans national average labor rates built in.</p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-5xl">
          {/* Tab bar */}
          <div className="no-print mb-8">
            <div className="flex flex-wrap gap-y-0 border-b-2 border-[#DDD8D0]">
              <div className="flex items-center gap-0 mr-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#BBB] pr-3 whitespace-nowrap">Structural</span>
                {TABS.filter(t => t.group === "structural").map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-5 py-3 font-bold uppercase tracking-wider text-sm transition-all border-b-2 -mb-[2px] whitespace-nowrap ${tab === t.id ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#888] hover:text-[#1A1A1A]"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-px bg-[#DDD8D0] mx-2 self-stretch" />
              <div className="flex items-center gap-0 mx-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#BBB] pr-3 whitespace-nowrap">Rough Systems</span>
                {TABS.filter(t => t.group === "mep").map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-5 py-3 font-bold uppercase tracking-wider text-sm transition-all border-b-2 -mb-[2px] whitespace-nowrap ${tab === t.id ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#888] hover:text-[#1A1A1A]"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-px bg-[#DDD8D0] mx-2 self-stretch" />
              {/* Summary tab */}
              <button onClick={() => setTab("summary")}
                className={`px-5 py-3 font-bold uppercase tracking-wider text-sm transition-all border-b-2 -mb-[2px] whitespace-nowrap ${tab === "summary" ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#888] hover:text-[#1A1A1A]"}`}>
                Summary
              </button>
              {/* Toolbar */}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={handleCopyLink} title="Copy shareable link"
                  className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors whitespace-nowrap ${copied ? "text-green-600" : "text-[#888] hover:text-[#E85D26]"}`}>
                  {copied ? <Check size={15} /> : <Link2 size={15} />}
                  <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
                </button>
                <button onClick={handleClear} title="Clear all inputs and start over"
                  className="flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-red-500 transition-colors whitespace-nowrap">
                  <Trash2 size={15} />
                  <span className="hidden sm:inline">Clear</span>
                </button>
                <button onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-[#1A1A1A] transition-colors whitespace-nowrap">
                  <Printer size={16} />
                  <span className="hidden sm:inline">Print</span>
                </button>
              </div>
            </div>
          </div>

          <div key={resetKey} className="bg-white border border-[#DDD8D0] p-8 shadow-sm">
            {tab === "wall" && <WallTab />}
            {tab === "floor" && <FloorTab />}
            {tab === "roof" && <RoofTab />}
            {tab === "plumbing" && <PlumbingTab />}
            {tab === "electrical" && <ElectricalTab />}
            {tab === "hvac" && <HvacTab />}
            {tab === "summary" && <SummaryTab onNavigate={t => setTab(t)} onPrint={handlePrint} />}
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
