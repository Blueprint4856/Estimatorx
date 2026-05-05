import { useState, useCallback } from "react";
import { Link } from "wouter";
import { ChevronRight, Printer, RotateCcw } from "lucide-react";

type Tab = "wall" | "floor" | "roof" | "plumbing" | "electrical" | "hvac";
const WASTE = 1.10;

/* ─────────────────────────────────────────────
   SHARED TYPES
───────────────────────────────────────────── */
interface MatItem { label: string; qty: number; unit: string; price: number; }
interface LaborItem { label: string; qty: number; unit: string; nationalAvg: number; }
type LaborRates = Record<string, string>;

function effectiveRate(item: LaborItem, rates: LaborRates): number {
  const v = parseFloat(rates[item.label]);
  return isNaN(v) ? item.nationalAvg : v;
}
function defaultRates(items: LaborItem[]): LaborRates {
  return Object.fromEntries(items.map(i => [i.label, String(i.nationalAvg)]));
}
function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

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
          className="w-10 h-10 flex items-center justify-center bg-[#F0EDE8] border border-[#DDD8D0] text-[#555] hover:bg-[#E85D26] hover:text-white hover:border-[#E85D26] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xl font-bold leading-none">
          −
        </button>
        <span className="text-2xl font-black text-[#1A1A1A] w-8 text-center tabular-nums">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          className="w-10 h-10 flex items-center justify-center bg-[#F0EDE8] border border-[#DDD8D0] text-[#555] hover:bg-[#E85D26] hover:text-white hover:border-[#E85D26] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xl font-bold leading-none">
          +
        </button>
      </div>
      {note && <p className="text-xs text-[#AAA] mt-1">{note}</p>}
    </div>
  );
}

function CheckCard({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label
      className={`flex items-start gap-3 p-4 border-2 cursor-pointer transition-all select-none ${checked ? "border-[#E85D26] bg-[#FFF8F5]" : "border-[#DDD8D0] bg-white hover:border-[#E85D26]/40"}`}
      onClick={() => onChange(!checked)}
    >
      <input type="checkbox" checked={checked} onChange={() => {}} className="sr-only" />
      <div className={`mt-0.5 w-5 h-5 flex-shrink-0 flex items-center justify-center border-2 transition-colors ${checked ? "bg-[#E85D26] border-[#E85D26]" : "border-[#CCC]"}`}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div>
        <div className="font-semibold text-[#1A1A1A] text-sm">{label}</div>
        {description && <div className="text-xs text-[#999] mt-0.5">{description}</div>}
      </div>
    </label>
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
function MaterialsTable({ rows }: { rows: MatItem[] }) {
  const total = rows.reduce((s, r) => s + r.qty * r.price, 0);
  return (
    <div className="border border-[#DDD8D0] overflow-hidden">
      <div className="bg-[#2C2825] text-white px-6 py-3 flex justify-between items-center">
        <span className="font-bold uppercase tracking-widest text-xs">Materials</span>
        <span className="text-[#E85D26] font-black text-base">${fmt(total)}</span>
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
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-[#FAF8F5]">
              <td className="px-5 py-2.5 text-[#1A1A1A] font-medium">{r.label}</td>
              <td className="px-3 py-2.5 text-right text-[#555]">{r.qty.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right text-[#999]">{r.unit}</td>
              <td className="px-3 py-2.5 text-right text-[#555]">${r.price.toFixed(2)}</td>
              <td className="px-5 py-2.5 text-right font-semibold text-[#1A1A1A]">${fmt(r.qty * r.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
          <button onClick={onReset} className="flex items-center gap-1.5 text-xs text-[#999] hover:text-[#E85D26] transition-colors">
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
            const changed = rates[item.label] !== undefined && parseFloat(rates[item.label]) !== item.nationalAvg;
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
                      className={`w-24 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${changed ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`} />
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
  return (
    <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#BBB]">{text}</div>
  );
}

function ResultNote() {
  return <p className="text-[10px] text-[#AAA]">Includes 10% material waste factor. Labor rates are RSMeans national averages — edit above. Delivery, permits, equipment rental, and tax not included.</p>;
}

/* ─────────────────────────────────────────────
   WALL TAB
───────────────────────────────────────────── */
interface WallInputs { linearFeet: string; ceilingHeight: string; exteriorSheathing: boolean; insulation: boolean; drywall: boolean; }
const WALL_MAT_PRICES = { stud: 5.48, plate: 5.48, osb: 34.98, insulation: 0.55, drywall: 15.98 };

function getWallMatItems(inputs: WallInputs): MatItem[] {
  const lf = parseFloat(inputs.linearFeet) || 0;
  const h = parseFloat(inputs.ceilingHeight) || 9;
  const area = lf * h;
  return [
    { label: "2×4×8 Studs (16\" OC)", qty: Math.ceil((lf / 1.333 + 1) * WASTE), unit: "ea", price: WALL_MAT_PRICES.stud },
    { label: "2×4×8 Plates (3 per run)", qty: Math.ceil(lf * 3 * WASTE / 8), unit: "ea", price: WALL_MAT_PRICES.plate },
    ...(inputs.exteriorSheathing ? [
      { label: "Advantech Wall Sheathing 7/16\" (4×8)", qty: Math.ceil(area * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.osb },
      { label: "Advantech Seam Tape (75 LF roll)", qty: Math.max(1, Math.ceil(area * WASTE / 300)), unit: "roll", price: 24.98 },
    ] : []),
    ...(inputs.insulation ? [{ label: "R-13 Batt Insulation", qty: Math.ceil(area * WASTE), unit: "sqft", price: WALL_MAT_PRICES.insulation }] : []),
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
  const [inputs, setInputs] = useState<WallInputs>({ linearFeet: "", ceilingHeight: "9", exteriorSheathing: true, insulation: true, drywall: true });
  const laborItems = getWallLaborItems(inputs);
  const [rates, setRates] = useState<LaborRates>(() => defaultRates(laborItems));
  const handleRateChange = useCallback((label: string, val: string) => setRates(r => ({ ...r, [label]: val })), []);
  const handleReset = useCallback(() => setRates(defaultRates(getWallLaborItems(inputs))), [inputs]);

  const matItems = getWallMatItems(inputs);
  const matTotal = matItems.reduce((s, r) => s + r.qty * r.price, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);
  const hasResults = (parseFloat(inputs.linearFeet) || 0) > 0;

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Total Linear Feet of Wall" note="Include all walls — exterior and interior">
          <NumberInput value={inputs.linearFeet} onChange={v => setInputs(p => ({ ...p, linearFeet: v }))} placeholder="e.g. 240" />
        </Field>
        <Field label="Ceiling Height (ft)">
          <select value={inputs.ceilingHeight} onChange={e => setInputs(p => ({ ...p, ceilingHeight: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            {["8", "9", "10", "11", "12"].map(h => <option key={h} value={h}>{h} ft</option>)}
          </select>
        </Field>
        <div className="flex flex-col gap-4">
          <Toggle checked={inputs.exteriorSheathing} onChange={v => setInputs(p => ({ ...p, exteriorSheathing: v }))} label="Advantech Exterior Sheathing" />
          <Toggle checked={inputs.insulation} onChange={v => setInputs(p => ({ ...p, insulation: v }))} label="Insulation (R-13 Batts)" />
          <Toggle checked={inputs.drywall} onChange={v => setInputs(p => ({ ...p, drywall: v }))} label={'Interior Drywall (½")'} />
        </div>
      </div>
      {hasResults ? (
        <div className="mt-8 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <ResultNote />
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
  const [inputs, setInputs] = useState<FloorInputs>({ sqft: "", finish: "lvp", includeSubfloor: true });
  const laborItems = getFloorLaborItems(inputs);
  const [rates, setRates] = useState<LaborRates>(() => defaultRates(laborItems));
  const handleRateChange = useCallback((label: string, val: string) => setRates(r => ({ ...r, [label]: val })), []);
  const handleReset = useCallback(() => setRates(defaultRates(getFloorLaborItems(inputs))), [inputs]);

  const matItems = getFloorMatItems(inputs);
  const matTotal = matItems.reduce((s, r) => s + r.qty * r.price, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);
  const hasResults = (parseFloat(inputs.sqft) || 0) > 0;

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">
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
        <div className="mt-8 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <ResultNote />
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
  const [inputs, setInputs] = useState<RoofInputs>({ footprintSqft: "", pitch: "6:12", archShingles: true, iceWater: true, includeDecking: false });
  const laborItems = getRoofLaborItems(inputs);
  const [rates, setRates] = useState<LaborRates>(() => defaultRates(laborItems));
  const handleRateChange = useCallback((label: string, val: string) => setRates(r => ({ ...r, [label]: val })), []);
  const handleReset = useCallback(() => setRates(defaultRates(getRoofLaborItems(inputs))), [inputs]);

  const fp = parseFloat(inputs.footprintSqft) || 0;
  const actualArea = fp * (PITCH_FACTORS[inputs.pitch] ?? 1.118);
  const matItems = getRoofMatItems(inputs);
  const matTotal = matItems.reduce((s, r) => s + r.qty * r.price, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Roof Footprint Area (sq ft)" note="Exterior building footprint — not actual roof surface">
          <NumberInput value={inputs.footprintSqft} onChange={v => setInputs(p => ({ ...p, footprintSqft: v }))} placeholder="e.g. 1800" />
        </Field>
        <Field label="Roof Pitch">
          <select value={inputs.pitch} onChange={e => setInputs(p => ({ ...p, pitch: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            {Object.keys(PITCH_FACTORS).map(p => <option key={p} value={p}>{p} pitch (×{PITCH_FACTORS[p].toFixed(3)})</option>)}
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
        <div className="mt-8 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <ResultNote />
        </div>
      ) : <EmptyState text="Enter roof footprint area above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PLUMBING TAB
───────────────────────────────────────────── */
interface PlumbingInputs {
  fullBaths: number;
  halfBaths: number;
  hasKitchen: boolean;
  hasLaundry: boolean;
  spigots: number;
}

function getPlumbingMatItems(i: PlumbingInputs): MatItem[] {
  const pex12 = (i.fullBaths * 45) + (i.halfBaths * 25) + (i.hasKitchen ? 20 : 0) + (i.hasLaundry ? 15 : 0);
  const pex34 = i.spigots * 25;
  const pvc3 = (i.fullBaths * 30) + (i.halfBaths * 20);
  const pvc2 = (i.hasKitchen ? 15 : 0) + (i.hasLaundry ? 10 : 0);
  const shutoffs = (i.fullBaths * 4) + (i.halfBaths * 3) + (i.hasKitchen ? 2 : 0) + (i.hasLaundry ? 2 : 0);
  const ptraps = (i.fullBaths * 2) + (i.halfBaths * 1) + (i.hasKitchen ? 1 : 0) + (i.hasLaundry ? 1 : 0);
  const waxRings = i.fullBaths + i.halfBaths;
  const items: MatItem[] = [];
  if (pex12 > 0) items.push({ label: 'PEX-A ½" Supply Pipe', qty: Math.ceil(pex12 * WASTE), unit: "LF", price: 0.68 });
  if (pex34 > 0) items.push({ label: 'PEX-A ¾" Supply Pipe (Outdoor)', qty: Math.ceil(pex34 * WASTE), unit: "LF", price: 0.98 });
  if (pvc3 > 0) items.push({ label: "3\" PVC Drain Pipe (Bathrooms)", qty: Math.ceil(pvc3 * WASTE), unit: "LF", price: 2.85 });
  if (pvc2 > 0) items.push({ label: "2\" PVC Drain Pipe (Kitchen/Laundry)", qty: Math.ceil(pvc2 * WASTE), unit: "LF", price: 1.95 });
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
  const [inputs, setInputs] = useState<PlumbingInputs>({ fullBaths: 1, halfBaths: 0, hasKitchen: true, hasLaundry: true, spigots: 2 });
  const laborItems = getPlumbingLaborItems(inputs);
  const [rates, setRates] = useState<LaborRates>(() => defaultRates(laborItems));
  const handleRateChange = useCallback((label: string, val: string) => setRates(r => ({ ...r, [label]: val })), []);
  const handleReset = useCallback(() => setRates(defaultRates(getPlumbingLaborItems(inputs))), [inputs]);

  const matItems = getPlumbingMatItems(inputs);
  const matTotal = matItems.reduce((s, r) => s + r.qty * r.price, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);
  const totalRooms = inputs.fullBaths + inputs.halfBaths + (inputs.hasKitchen ? 1 : 0) + (inputs.hasLaundry ? 1 : 0) + inputs.spigots;

  return (
    <div>
      <p className="text-sm text-[#666] mb-6">Tell us about your home's water needs — no plumbing knowledge required.</p>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8 mb-8">
        <Stepper label="Full Bathrooms" value={inputs.fullBaths} onChange={v => setInputs(p => ({ ...p, fullBaths: v }))} max={8} note="Toilet + sink + tub or shower" />
        <Stepper label="Half Baths / Powder Rooms" value={inputs.halfBaths} onChange={v => setInputs(p => ({ ...p, halfBaths: v }))} max={4} note="Toilet + sink only" />
        <Stepper label="Outdoor Spigots" value={inputs.spigots} onChange={v => setInputs(p => ({ ...p, spigots: v }))} max={6} note="Garden hose connections" />
      </div>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#777]">Also include</div>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <CheckCard checked={inputs.hasKitchen} onChange={v => setInputs(p => ({ ...p, hasKitchen: v }))} label="Kitchen Sink" description="Hot & cold supply, drain hookup" />
        <CheckCard checked={inputs.hasLaundry} onChange={v => setInputs(p => ({ ...p, hasLaundry: v }))} label="Laundry Room" description="Washer hookup — hot, cold & drain" />
      </div>
      {totalRooms > 0 ? (
        <div className="mt-8 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <ResultNote />
        </div>
      ) : <EmptyState text="Select at least one room or fixture above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ELECTRICAL TAB
───────────────────────────────────────────── */
interface ElectricalInputs {
  sqft: string;
  bedrooms: number;
  bathrooms: number;
  appliances: {
    electricRange: boolean;
    electricDryer: boolean;
    dishwasher: boolean;
    evCharger: boolean;
    garage: boolean;
    hotTub: boolean;
  };
}

function getElectricalMatItems(inp: ElectricalInputs): MatItem[] {
  const sqft = parseFloat(inp.sqft) || 0;
  const { bedrooms, bathrooms, appliances } = inp;

  const lightingCircuits = Math.max(1, Math.ceil(sqft / 600));
  const outletCircuits = Math.max(1, Math.ceil(sqft / 400));
  const kitchenCircuits = 3; // 2 small appliance + 1 fridge
  const bathroomCircuits = Math.max(1, bathrooms);

  const romex142 = Math.ceil(lightingCircuits * 150 * WASTE);
  const romex122 = Math.ceil((outletCircuits + kitchenCircuits + bathroomCircuits + bedrooms + (appliances.dishwasher ? 1 : 0) + (appliances.garage ? 1 : 0)) * 100 * WASTE);
  const romex103 = Math.ceil(((appliances.electricRange ? 1 : 0) + (appliances.electricDryer ? 1 : 0)) * 60 * WASTE);
  const romex63 = Math.ceil(((appliances.evCharger ? 1 : 0) + (appliances.hotTub ? 1 : 0)) * 60 * WASTE);

  const totalOutlets = Math.ceil(sqft / 25);
  const gfciOutlets = (bathrooms * 2) + 4 + (appliances.garage ? 2 : 0);
  const afciBreakers = bedrooms + Math.ceil(sqft / 600);
  const stdBreakers = Math.ceil(sqft / 400) + kitchenCircuits + bathroomCircuits
    + (appliances.dishwasher ? 1 : 0) + (appliances.garage ? 1 : 0);
  const twoPolBreakers = (appliances.electricRange ? 1 : 0) + (appliances.electricDryer ? 1 : 0)
    + (appliances.evCharger ? 1 : 0) + (appliances.hotTub ? 1 : 0);
  const panelSize = (appliances.evCharger && appliances.hotTub) ? "400A" : "200A";
  const panelPrice = panelSize === "400A" ? 1250 : 485;

  const items: MatItem[] = [
    { label: `${panelSize} Main Panel with Main Breaker`, qty: 1, unit: "ea", price: panelPrice },
  ];
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
  const [inputs, setInputs] = useState<ElectricalInputs>({
    sqft: "", bedrooms: 3, bathrooms: 2,
    appliances: { electricRange: false, electricDryer: false, dishwasher: true, evCharger: false, garage: false, hotTub: false },
  });

  const setApp = (key: keyof ElectricalInputs["appliances"], val: boolean) =>
    setInputs(p => ({ ...p, appliances: { ...p.appliances, [key]: val } }));

  const laborItems = getElectricalLaborItems(inputs);
  const [rates, setRates] = useState<LaborRates>(() => defaultRates(laborItems));
  const handleRateChange = useCallback((label: string, val: string) => setRates(r => ({ ...r, [label]: val })), []);
  const handleReset = useCallback(() => setRates(defaultRates(getElectricalLaborItems(inputs))), [inputs]);

  const sqft = parseFloat(inputs.sqft) || 0;
  const matItems = getElectricalMatItems(inputs);
  const matTotal = matItems.reduce((s, r) => s + r.qty * r.price, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);
  const panelSize = (inputs.appliances.evCharger && inputs.appliances.hotTub) ? "400A" : "200A";

  return (
    <div>
      <p className="text-sm text-[#666] mb-6">Tell us about your home — we handle the circuit math.</p>
      <div className="grid sm:grid-cols-3 gap-8 mb-8">
        <div className="sm:col-span-1">
          <Field label="Home Size (sq ft)">
            <NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 2000" />
          </Field>
        </div>
        <Stepper label="Bedrooms" value={inputs.bedrooms} onChange={v => setInputs(p => ({ ...p, bedrooms: v }))} min={1} max={8} />
        <Stepper label="Bathrooms" value={inputs.bathrooms} onChange={v => setInputs(p => ({ ...p, bathrooms: v }))} min={1} max={8} />
      </div>
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#777]">Which of these does your home have?</div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <CheckCard checked={inputs.appliances.dishwasher} onChange={v => setApp("dishwasher", v)} label="Dishwasher" description="Dedicated 20A circuit" />
        <CheckCard checked={inputs.appliances.electricRange} onChange={v => setApp("electricRange", v)} label="Electric Stove / Range" description="240V 50A dedicated circuit" />
        <CheckCard checked={inputs.appliances.electricDryer} onChange={v => setApp("electricDryer", v)} label="Electric Clothes Dryer" description="240V 30A dedicated circuit" />
        <CheckCard checked={inputs.appliances.garage} onChange={v => setApp("garage", v)} label="Attached Garage" description="Dedicated GFCI circuit" />
        <CheckCard checked={inputs.appliances.evCharger} onChange={v => setApp("evCharger", v)} label="EV Car Charger" description="240V 50A dedicated circuit" />
        <CheckCard checked={inputs.appliances.hotTub} onChange={v => setApp("hotTub", v)} label="Hot Tub / Spa" description="240V 50A GFCI circuit" />
      </div>
      {sqft > 0 && (
        <div className="mb-6">
          <InfoBox>
            Based on your inputs, we recommend a <strong>{panelSize} service panel</strong>.
            {inputs.appliances.evCharger && inputs.appliances.hotTub && " EV charger + hot tub together typically require a 400A upgrade."}
          </InfoBox>
        </div>
      )}
      {sqft > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <ResultNote />
        </div>
      ) : <EmptyState text="Enter your home size above to see your estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   HVAC TAB
───────────────────────────────────────────── */
interface HvacInputs { sqft: string; stories: string; climate: string; system: string; }

const HEATING_BTU: Record<string, number> = { cold: 45, mixed: 35, hot: 25 };
const COOLING_BTU: Record<string, number> = { cold: 20, mixed: 25, hot: 35 };

function sizeFurnace(btu: number): { label: string; price: number } {
  if (btu <= 60000) return { label: "60,000 BTU Gas Furnace", price: 785 };
  if (btu <= 80000) return { label: "80,000 BTU Gas Furnace", price: 985 };
  if (btu <= 100000) return { label: "100,000 BTU Gas Furnace", price: 1245 };
  return { label: "120,000 BTU Gas Furnace", price: 1485 };
}

function sizeAC(btu: number): { label: string; tons: number; price: number } {
  const sizes = [
    { btu: 18000, tons: 1.5, price: 1085 }, { btu: 24000, tons: 2, price: 1285 },
    { btu: 30000, tons: 2.5, price: 1385 }, { btu: 36000, tons: 3, price: 1485 },
    { btu: 42000, tons: 3.5, price: 1685 }, { btu: 48000, tons: 4, price: 1885 },
    { btu: 60000, tons: 5, price: 2285 },
  ];
  const match = sizes.find(s => s.btu >= btu) ?? sizes[sizes.length - 1];
  return { label: `${match.tons}-Ton A/C Condenser`, tons: match.tons, price: match.price };
}

function sizeHP(btu: number): { label: string; tons: number; price: number } {
  const sizes = [
    { btu: 18000, tons: 1.5, price: 1685 }, { btu: 24000, tons: 2, price: 1885 },
    { btu: 30000, tons: 2.5, price: 2185 }, { btu: 36000, tons: 3, price: 2485 },
    { btu: 42000, tons: 3.5, price: 2785 }, { btu: 48000, tons: 4, price: 3085 },
    { btu: 60000, tons: 5, price: 3685 },
  ];
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
    const maxBtu = Math.max(heatBtu, coolBtu);
    const hp = sizeHP(maxBtu);
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
  return [
    { label: "HVAC Rough-In & Equipment Set", qty: sqft, unit: "sqft", nationalAvg: 1.85 },
  ];
}

function HvacTab() {
  const [inputs, setInputs] = useState<HvacInputs>({ sqft: "", stories: "1", climate: "mixed", system: "gas-central" });
  const laborItems = getHvacLaborItems(inputs);
  const [rates, setRates] = useState<LaborRates>(() => defaultRates(laborItems));
  const handleRateChange = useCallback((label: string, val: string) => setRates(r => ({ ...r, [label]: val })), []);
  const handleReset = useCallback(() => setRates(defaultRates(getHvacLaborItems(inputs))), [inputs]);

  const sqft = parseFloat(inputs.sqft) || 0;
  const heatBtu = sqft * (HEATING_BTU[inputs.climate] ?? 35);
  const coolBtu = sqft * (COOLING_BTU[inputs.climate] ?? 25);
  const matItems = getHvacMatItems(inputs);
  const matTotal = matItems.reduce((s, r) => s + r.qty * r.price, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);
  const heads = Math.ceil(sqft / 500);

  return (
    <div>
      <p className="text-sm text-[#666] mb-6">Tell us about your home — we calculate the equipment size you need.</p>
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Field label="Home Size (sq ft)">
          <NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 2000" />
        </Field>
        <Field label="Number of Stories">
          <select value={inputs.stories} onChange={e => setInputs(p => ({ ...p, stories: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            <option value="1">1 story</option>
            <option value="2">2 stories</option>
            <option value="3">3 stories</option>
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
            {inputs.system === "mini-split" ? (
              <>Recommended: <strong>{heads} indoor {heads === 1 ? "head" : "heads"}</strong> to cover {sqft.toLocaleString()} sqft.</>
            ) : (
              <>Estimated load: <strong>{Math.round(coolBtu / 12000 * 10) / 10} tons cooling</strong> / <strong>{Math.round(heatBtu / 1000)}k BTU heating</strong> for your climate.</>
            )}
          </InfoBox>
        )}
      </div>
      {sqft > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <ResultNote />
        </div>
      ) : <EmptyState text="Enter your home size above to see your HVAC estimate." />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
const TABS: { id: Tab; label: string; group: "structural" | "mep" }[] = [
  { id: "wall", label: "Walls", group: "structural" },
  { id: "floor", label: "Floors", group: "structural" },
  { id: "roof", label: "Roofing", group: "structural" },
  { id: "plumbing", label: "Plumbing", group: "mep" },
  { id: "electrical", label: "Electrical", group: "mep" },
  { id: "hvac", label: "Heating & Cooling", group: "mep" },
];

export default function Estimator() {
  const [tab, setTab] = useState<Tab>("wall");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F7F4F0] text-[#1A1A1A]">
      <header className="sticky top-0 z-50 w-full border-b border-[#E0DAD3] bg-white shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/">
            <img src="/logo.png" alt="EstimatorX.pro" className="h-16 object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-2 text-sm text-[#888]">
            <Link href="/" className="hover:text-[#E85D26] transition-colors">Home</Link>
            <ChevronRight size={14} />
            <span className="text-[#1A1A1A] font-semibold">Estimator</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="bg-[#1A1A1A] text-white py-14">
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
          {/* Tab Groups */}
          <div className="mb-8">
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
              <button onClick={() => window.print()} className="ml-auto flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-[#1A1A1A] transition-colors whitespace-nowrap">
                <Printer size={16} /> Print
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#DDD8D0] p-8 shadow-sm">
            {tab === "wall" && <WallTab />}
            {tab === "floor" && <FloorTab />}
            {tab === "roof" && <RoofTab />}
            {tab === "plumbing" && <PlumbingTab />}
            {tab === "electrical" && <ElectricalTab />}
            {tab === "hvac" && <HvacTab />}
          </div>

          <div className="mt-6 p-4 border border-[#DDD8D0] bg-white text-xs text-[#999] leading-relaxed">
            <strong className="text-[#555]">Disclaimer:</strong> This tool provides rough estimates for budgeting purposes only. Material prices reflect typical retail rates. Labor rates are sourced from RSMeans national averages — actual costs vary by region, trade, and market conditions. Always verify quantities and pricing with your suppliers and subcontractors. This estimate does not include permits, equipment rental, delivery, overhead, profit margin, or sales tax.
          </div>
        </div>
      </main>

      <footer className="bg-[#2C2825] py-8 border-t border-black/20 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/logo.png" alt="EstimatorX.pro" className="h-10 object-contain brightness-0 invert opacity-60" />
          <span className="text-[#A09890] text-sm">&copy; {new Date().getFullYear()} EstimatorX.pro. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
