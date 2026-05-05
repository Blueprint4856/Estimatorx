import { useState, useCallback } from "react";
import { Link } from "wouter";
import { ChevronRight, Printer, RotateCcw } from "lucide-react";

type Tab = "wall" | "floor" | "roof";
const WASTE = 1.10;

/* ─────────────────────────────────────────────
   SHARED TYPES
───────────────────────────────────────────── */
interface MatItem { label: string; qty: number; unit: string; price: number; }
interface LaborItem { label: string; qty: number; unit: string; nationalAvg: number; }
type LaborRates = Record<string, string>; // label → user-editable rate string

function effectiveRate(item: LaborItem, rates: LaborRates): number {
  const v = parseFloat(rates[item.label]);
  return isNaN(v) ? item.nationalAvg : v;
}

function defaultRates(items: LaborItem[]): LaborRates {
  return Object.fromEntries(items.map(i => [i.label, String(i.nationalAvg)]));
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
    <input
      type="number" min="0" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
    />
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

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ─────────────────────────────────────────────
   MATERIALS RESULTS TABLE
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

/* ─────────────────────────────────────────────
   LABOR RESULTS TABLE (editable rates)
───────────────────────────────────────────── */
interface LaborTableProps {
  items: LaborItem[];
  rates: LaborRates;
  onChange: (label: string, val: string) => void;
  onReset: () => void;
}

function LaborTable({ items, rates, onChange, onReset }: LaborTableProps) {
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
                  {changed && (
                    <div className="text-[10px] text-[#999]">
                      Nat&apos;l avg: ${item.nationalAvg.toFixed(2)}/{item.unit}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-[#555]">{item.qty.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-[#999]">{item.unit}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[#999] text-xs">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={rates[item.label] ?? String(item.nationalAvg)}
                      onChange={e => onChange(item.label, e.target.value)}
                      className={`w-20 text-right bg-[#FAF8F5] border px-2 py-1 text-sm focus:outline-none focus:border-[#E85D26] transition-colors ${changed ? "border-[#E85D26]/50 text-[#E85D26] font-semibold" : "border-[#DDD8D0] text-[#555]"}`}
                    />
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

/* ─────────────────────────────────────────────
   GRAND TOTAL CARD
───────────────────────────────────────────── */
function GrandTotal({ matTotal, laborTotal }: { matTotal: number; laborTotal: number }) {
  const grand = matTotal + laborTotal;
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
        <div className="font-black text-3xl">${fmt(grand)}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   WALL TAB
───────────────────────────────────────────── */
interface WallInputs { linearFeet: string; ceilingHeight: string; exteriorSheathing: boolean; insulation: boolean; drywall: boolean; }

const WALL_MAT_PRICES = { stud: 5.48, plate: 5.48, osb: 22.98, insulation: 0.55, drywall: 15.98 };

function getWallMatItems(inputs: WallInputs): MatItem[] {
  const lf = parseFloat(inputs.linearFeet) || 0;
  const h = parseFloat(inputs.ceilingHeight) || 9;
  const area = lf * h;
  return [
    { label: "2×4×8 Studs (16\" OC)", qty: Math.ceil((lf / 1.333 + 1) * WASTE), unit: "ea", price: WALL_MAT_PRICES.stud },
    { label: "2×4×8 Plates (3 per run)", qty: Math.ceil(lf * 3 * WASTE / 8), unit: "ea", price: WALL_MAT_PRICES.plate },
    ...(inputs.exteriorSheathing ? [{ label: "7/16\" OSB Sheathing (4×8)", qty: Math.ceil(area * WASTE / 32), unit: "sheet", price: WALL_MAT_PRICES.osb }] : []),
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
    ...(inputs.exteriorSheathing ? [{ label: "Sheathing Install", qty: area, unit: "sqft", nationalAvg: 0.45 }] : []),
    ...(inputs.insulation ? [{ label: "Insulation (Batt) Install", qty: area, unit: "sqft", nationalAvg: 0.38 }] : []),
    ...(inputs.drywall ? [{ label: "Drywall Hang & Finish", qty: area, unit: "sqft", nationalAvg: 1.65 }] : []),
  ];
}

const WALL_DEFAULTS: WallInputs = { linearFeet: "", ceilingHeight: "9", exteriorSheathing: true, insulation: true, drywall: true };

function WallTab() {
  const [inputs, setInputs] = useState<WallInputs>(WALL_DEFAULTS);
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
          <Toggle checked={inputs.exteriorSheathing} onChange={v => setInputs(p => ({ ...p, exteriorSheathing: v }))} label="Exterior Sheathing (OSB)" />
          <Toggle checked={inputs.insulation} onChange={v => setInputs(p => ({ ...p, insulation: v }))} label="Insulation (R-13 Batts)" />
          <Toggle checked={inputs.drywall} onChange={v => setInputs(p => ({ ...p, drywall: v }))} label={'Interior Drywall (½")'} />
        </div>
      </div>

      {hasResults ? (
        <div className="mt-8 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <p className="text-[10px] text-[#AAA]">Includes 10% material waste factor. Labor rates are RSMeans national averages — edit above. Delivery, permits, and tax not included.</p>
        </div>
      ) : (
        <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#BBB]">
          Enter wall dimensions above to see your material and labor estimate.
        </div>
      )}
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
    ...(inputs.includeSubfloor ? [{ label: "¾\" T&G OSB Subfloor (4×8)", qty: Math.ceil(sqft * WASTE / 32), unit: "sheet", price: 42.98 }] : []),
    ...(inputs.finish !== "none" ? [{ label: FLOOR_LABELS[inputs.finish], qty: Math.ceil(sqft * WASTE), unit: "sqft", price: FLOOR_MAT_PRICES[inputs.finish] ?? 0 }] : []),
  ];
}

function getFloorLaborItems(inputs: FloorInputs): LaborItem[] {
  const sqft = Math.round(parseFloat(inputs.sqft) || 0);
  return [
    ...(inputs.includeSubfloor ? [{ label: "Subfloor Installation", qty: sqft, unit: "sqft", nationalAvg: 0.82 }] : []),
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
          <Toggle checked={inputs.includeSubfloor} onChange={v => setInputs(p => ({ ...p, includeSubfloor: v }))} label={'Include ¾" T&G OSB Subfloor'} />
        </div>
      </div>

      {hasResults ? (
        <div className="mt-8 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <p className="text-[10px] text-[#AAA]">Includes 10% material waste factor. Labor rates are RSMeans national averages — edit above. Delivery, permits, and tax not included.</p>
        </div>
      ) : (
        <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#BBB]">
          Enter floor area above to see your material and labor estimate.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ROOF TAB
───────────────────────────────────────────── */
interface RoofInputs { footprintSqft: string; pitch: string; iceWater: boolean; includeDecking: boolean; }

const PITCH_FACTORS: Record<string, number> = {
  "4:12": 1.054, "5:12": 1.083, "6:12": 1.118, "7:12": 1.158,
  "8:12": 1.202, "9:12": 1.250, "10:12": 1.302, "12:12": 1.414,
};

function getRoofMatItems(inputs: RoofInputs): MatItem[] {
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actual = fp * factor;
  const squares = actual / 100;
  const iceShield = inputs.iceWater ? Math.ceil(fp * 0.25 * WASTE) : 0;
  return [
    { label: "Architectural Shingles (bundle)", qty: Math.ceil(squares * 3.33 * WASTE), unit: "bundle", price: 38.98 },
    { label: "Synthetic Underlayment", qty: Math.ceil(actual * WASTE), unit: "sqft", price: 0.12 },
    ...(inputs.includeDecking ? [{ label: "7/16\" OSB Roof Decking (4×8)", qty: Math.ceil(actual * WASTE / 32), unit: "sheet", price: 22.98 }] : []),
    ...(inputs.iceWater ? [{ label: "Ice & Water Shield", qty: iceShield, unit: "sqft", price: 0.45 }] : []),
  ];
}

function getRoofLaborItems(inputs: RoofInputs): LaborItem[] {
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actual = Math.round(fp * factor);
  const iceArea = Math.round(fp * 0.25);
  return [
    { label: "Shingle Installation", qty: actual, unit: "sqft", nationalAvg: 0.75 },
    { label: "Underlayment Install", qty: actual, unit: "sqft", nationalAvg: 0.12 },
    ...(inputs.includeDecking ? [{ label: "Roof Decking Install", qty: actual, unit: "sqft", nationalAvg: 0.62 }] : []),
    ...(inputs.iceWater ? [{ label: "Ice & Water Shield Install", qty: iceArea, unit: "sqft", nationalAvg: 0.28 }] : []),
  ];
}

function RoofTab() {
  const [inputs, setInputs] = useState<RoofInputs>({ footprintSqft: "", pitch: "6:12", iceWater: true, includeDecking: false });
  const laborItems = getRoofLaborItems(inputs);
  const [rates, setRates] = useState<LaborRates>(() => defaultRates(laborItems));

  const handleRateChange = useCallback((label: string, val: string) => setRates(r => ({ ...r, [label]: val })), []);
  const handleReset = useCallback(() => setRates(defaultRates(getRoofLaborItems(inputs))), [inputs]);

  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actualArea = fp * factor;
  const matItems = getRoofMatItems(inputs);
  const matTotal = matItems.reduce((s, r) => s + r.qty * r.price, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.qty * effectiveRate(i, rates), 0);
  const hasResults = fp > 0;

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Roof Footprint Area (sq ft)" note="Exterior building footprint — not actual roof surface">
          <NumberInput value={inputs.footprintSqft} onChange={v => setInputs(p => ({ ...p, footprintSqft: v }))} placeholder="e.g. 1800" />
        </Field>
        <Field label="Roof Pitch">
          <select value={inputs.pitch} onChange={e => setInputs(p => ({ ...p, pitch: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors">
            {Object.keys(PITCH_FACTORS).map(p => (
              <option key={p} value={p}>{p} pitch (×{PITCH_FACTORS[p].toFixed(3)})</option>
            ))}
          </select>
        </Field>
        {hasResults && (
          <div className="md:col-span-2 bg-[#FAF8F5] border border-[#DDD8D0] px-5 py-3 flex gap-8 text-sm">
            <span className="text-[#888]">Actual Roof Area: <strong className="text-[#1A1A1A]">{Math.ceil(actualArea).toLocaleString()} sqft</strong></span>
            <span className="text-[#888]">Squares: <strong className="text-[#1A1A1A]">{(actualArea / 100).toFixed(1)}</strong></span>
          </div>
        )}
        <div className="flex flex-col gap-4">
          <Toggle checked={inputs.includeDecking} onChange={v => setInputs(p => ({ ...p, includeDecking: v }))} label="Include OSB Roof Decking" />
          <Toggle checked={inputs.iceWater} onChange={v => setInputs(p => ({ ...p, iceWater: v }))} label="Include Ice & Water Shield" />
        </div>
      </div>

      {hasResults ? (
        <div className="mt-8 flex flex-col gap-3">
          <MaterialsTable rows={matItems} />
          <LaborTable items={laborItems} rates={rates} onChange={handleRateChange} onReset={handleReset} />
          <GrandTotal matTotal={matTotal} laborTotal={laborTotal} />
          <p className="text-[10px] text-[#AAA]">Includes 10% material waste factor. Labor rates are RSMeans national averages — edit above. Delivery, permits, and tax not included.</p>
        </div>
      ) : (
        <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#BBB]">
          Enter roof footprint area above to see your material and labor estimate.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
const TABS: { id: Tab; label: string }[] = [
  { id: "wall", label: "Wall Systems" },
  { id: "floor", label: "Floor Systems" },
  { id: "roof", label: "Roofing Systems" },
];

export default function Estimator() {
  const [tab, setTab] = useState<Tab>("wall");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F7F4F0] text-[#1A1A1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#E0DAD3] bg-white shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/">
            <img src="/logo.png" alt="EstimatorX.pro" className="h-16 object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-2 text-sm text-[#888]">
            <Link href="/" className="hover:text-[#E85D26] transition-colors">Home</Link>
            <ChevronRight size={14} />
            <span className="text-[#1A1A1A] font-semibold">Material Estimator</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Page Header */}
        <div className="bg-[#1A1A1A] text-white py-14">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-[2px] bg-[#E85D26]" />
              <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Quick Estimating Tool</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black font-serif uppercase mb-3">Material + Labor Estimator</h1>
            <p className="text-gray-400 text-lg max-w-2xl">Residential take-offs for wall, floor, and roofing systems. RSMeans national average labor rates included — adjust any rate for your market.</p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12 max-w-5xl">
          {/* Tab Navigation */}
          <div className="flex border-b-2 border-[#DDD8D0] mb-10 gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-6 py-3 font-bold uppercase tracking-wider text-sm transition-all border-b-2 -mb-[2px] ${tab === t.id ? "border-[#E85D26] text-[#E85D26]" : "border-transparent text-[#888] hover:text-[#1A1A1A]"}`}>
                {t.label}
              </button>
            ))}
            <button onClick={() => window.print()} className="ml-auto flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-[#1A1A1A] transition-colors">
              <Printer size={16} /> Print
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white border border-[#DDD8D0] p-8 shadow-sm">
            {tab === "wall" && <WallTab />}
            {tab === "floor" && <FloorTab />}
            {tab === "roof" && <RoofTab />}
          </div>

          {/* Disclaimer */}
          <div className="mt-6 p-4 border border-[#DDD8D0] bg-white text-xs text-[#999] leading-relaxed">
            <strong className="text-[#555]">Disclaimer:</strong> This tool provides rough material quantity and cost estimates for budgeting purposes only. Material prices reflect typical retail rates. Labor rates are sourced from RSMeans national averages and are provided for reference — actual costs vary by region, trade, and market conditions. Always verify quantities and pricing with your local supplier and subcontractors before purchasing or bidding. This estimate does not include permits, equipment, delivery, overhead, profit margin, or sales tax.
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
