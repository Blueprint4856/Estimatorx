import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight, RotateCcw, Printer } from "lucide-react";

type Tab = "wall" | "floor" | "roof";

const WASTE = 1.10;

/* ─── WALL SYSTEM ─── */
interface WallInputs {
  linearFeet: string;
  ceilingHeight: string;
  exteriorSheathing: boolean;
  insulation: boolean;
  drywall: boolean;
}

const WALL_PRICES = {
  stud: 5.48,
  plate: 5.48,
  osb: 22.98,
  insulation: 0.55,
  drywall: 15.98,
};

function calcWall(inputs: WallInputs) {
  const lf = parseFloat(inputs.linearFeet) || 0;
  const h = parseFloat(inputs.ceilingHeight) || 9;
  const area = lf * h;

  const studs = Math.ceil((lf / 1.333 + 1) * WASTE);
  const plates = Math.ceil(lf * 3 * WASTE / 8); // 8 LF per 2x4x8
  const sheathingSheets = inputs.exteriorSheathing ? Math.ceil(area * WASTE / 32) : 0;
  const insulSqFt = inputs.insulation ? Math.ceil(area * WASTE) : 0;
  const drywallSheets = inputs.drywall ? Math.ceil(area * WASTE / 32) : 0;

  const rows = [
    { label: "2×4×8 Studs (16\" OC)", qty: studs, unit: "ea", price: WALL_PRICES.stud },
    { label: "2×4×8 Plates (3 per run)", qty: plates, unit: "ea", price: WALL_PRICES.plate },
    ...(inputs.exteriorSheathing ? [{ label: "7/16\" OSB Sheathing (4×8)", qty: sheathingSheets, unit: "sheet", price: WALL_PRICES.osb }] : []),
    ...(inputs.insulation ? [{ label: "R-13 Batt Insulation", qty: insulSqFt, unit: "sqft", price: WALL_PRICES.insulation }] : []),
    ...(inputs.drywall ? [{ label: "½\" Drywall (4×8)", qty: drywallSheets, unit: "sheet", price: WALL_PRICES.drywall }] : []),
  ];

  return rows;
}

/* ─── FLOOR SYSTEM ─── */
interface FloorInputs {
  sqft: string;
  finish: string;
  includeSubfloor: boolean;
}

const FLOOR_PRICES: Record<string, number> = {
  lvp: 2.89,
  carpet: 2.49,
  hardwood: 5.98,
  tile: 3.49,
  none: 0,
};

const FLOOR_LABELS: Record<string, string> = {
  lvp: "LVP (Luxury Vinyl Plank)",
  carpet: "Carpet",
  hardwood: "Hardwood",
  tile: "Ceramic/Porcelain Tile",
  none: "None (subfloor only)",
};

function calcFloor(inputs: FloorInputs) {
  const sqft = parseFloat(inputs.sqft) || 0;
  const subfloSheets = inputs.includeSubfloor ? Math.ceil(sqft * WASTE / 32) : 0;
  const finishSqFt = inputs.finish !== "none" ? Math.ceil(sqft * WASTE) : 0;

  const rows = [
    ...(inputs.includeSubfloor ? [{ label: "¾\" T&G OSB Subfloor (4×8)", qty: subfloSheets, unit: "sheet", price: 42.98 }] : []),
    ...(finishSqFt > 0 ? [{ label: FLOOR_LABELS[inputs.finish] ?? "Finish Flooring", qty: finishSqFt, unit: "sqft", price: FLOOR_PRICES[inputs.finish] ?? 0 }] : []),
  ];

  return rows;
}

/* ─── ROOF SYSTEM ─── */
interface RoofInputs {
  footprintSqft: string;
  pitch: string;
  iceWater: boolean;
  includeDecking: boolean;
}

const PITCH_FACTORS: Record<string, number> = {
  "4:12": 1.054,
  "5:12": 1.083,
  "6:12": 1.118,
  "7:12": 1.158,
  "8:12": 1.202,
  "9:12": 1.250,
  "10:12": 1.302,
  "12:12": 1.414,
};

function calcRoof(inputs: RoofInputs) {
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const factor = PITCH_FACTORS[inputs.pitch] ?? 1.118;
  const actual = fp * factor;
  const squares = actual / 100;

  const bundles = Math.ceil(squares * 3.33 * WASTE);
  const underlaySqFt = Math.ceil(actual * WASTE);
  const deckSheets = inputs.includeDecking ? Math.ceil(actual * WASTE / 32) : 0;
  const iceShield = inputs.iceWater ? Math.ceil(fp * 0.25 * WASTE) : 0;

  const rows = [
    { label: "Architectural Shingles (bundle)", qty: bundles, unit: "bundle", price: 38.98 },
    { label: "Synthetic Underlayment", qty: underlaySqFt, unit: "sqft", price: 0.12 },
    ...(inputs.includeDecking ? [{ label: "7/16\" OSB Roof Decking (4×8)", qty: deckSheets, unit: "sheet", price: 22.98 }] : []),
    ...(inputs.iceWater ? [{ label: "Ice & Water Shield", qty: iceShield, unit: "sqft", price: 0.45 }] : []),
  ];

  return rows;
}

/* ─── SHARED COMPONENTS ─── */
interface LineItem { label: string; qty: number; unit: string; price: number; }

function ResultsTable({ rows, title }: { rows: LineItem[]; title: string }) {
  const total = rows.reduce((s, r) => s + r.qty * r.price, 0);
  if (rows.length === 0) return null;

  return (
    <div className="mt-8 border border-[#DDD8D0] bg-white overflow-hidden">
      <div className="bg-[#1A1A1A] text-white px-6 py-3 flex justify-between items-center">
        <span className="font-bold uppercase tracking-widest text-sm">{title} — Material Estimate</span>
        <span className="text-[#E85D26] font-black text-lg">${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#F7F4F0] border-b border-[#DDD8D0]">
          <tr>
            <th className="text-left px-6 py-3 font-bold uppercase tracking-wider text-[#555] text-xs">Material</th>
            <th className="text-right px-4 py-3 font-bold uppercase tracking-wider text-[#555] text-xs">Qty</th>
            <th className="text-right px-4 py-3 font-bold uppercase tracking-wider text-[#555] text-xs">Unit</th>
            <th className="text-right px-4 py-3 font-bold uppercase tracking-wider text-[#555] text-xs">Unit Price</th>
            <th className="text-right px-6 py-3 font-bold uppercase tracking-wider text-[#555] text-xs">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F0EDE8]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-[#FAF8F5] transition-colors">
              <td className="px-6 py-3 text-[#1A1A1A] font-medium">{r.label}</td>
              <td className="px-4 py-3 text-right text-[#444]">{r.qty.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-[#888]">{r.unit}</td>
              <td className="px-4 py-3 text-right text-[#444]">${r.price.toFixed(2)}</td>
              <td className="px-6 py-3 text-right font-semibold text-[#1A1A1A]">${(r.qty * r.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-[#1A1A1A]">
          <tr className="bg-[#FAF8F5]">
            <td colSpan={4} className="px-6 py-4 font-black uppercase tracking-wider text-[#1A1A1A]">Materials Subtotal</td>
            <td className="px-6 py-4 text-right font-black text-[#E85D26] text-lg">${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
      <div className="px-6 py-3 bg-[#FFF8F5] border-t border-[#DDD8D0] text-xs text-[#888]">
        Prices reflect typical retail material costs. Includes 10% waste factor. Labor, delivery, and tax not included.
      </div>
    </div>
  );
}

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <label className="block text-sm font-bold uppercase tracking-wider text-[#555] mb-1">{label}</label>
      {children}
      {note && <p className="text-xs text-[#999] mt-1">{note}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      min="0"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full relative transition-colors ${checked ? "bg-[#E85D26]" : "bg-[#DDD8D0]"}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? "left-5" : "left-1"}`} />
      </div>
      <span className="text-sm font-medium text-[#444]">{label}</span>
    </label>
  );
}

/* ─── WALL TAB ─── */
function WallTab() {
  const [inputs, setInputs] = useState<WallInputs>({
    linearFeet: "",
    ceilingHeight: "9",
    exteriorSheathing: true,
    insulation: true,
    drywall: true,
  });

  const rows = calcWall(inputs);
  const hasResults = (parseFloat(inputs.linearFeet) || 0) > 0;

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Total Linear Feet of Wall" note="Include all walls — exterior and interior">
          <NumberInput value={inputs.linearFeet} onChange={v => setInputs(p => ({ ...p, linearFeet: v }))} placeholder="e.g. 240" />
        </Field>
        <Field label="Ceiling Height (ft)">
          <select
            value={inputs.ceilingHeight}
            onChange={e => setInputs(p => ({ ...p, ceilingHeight: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
          >
            {["8", "9", "10", "11", "12"].map(h => <option key={h} value={h}>{h} ft</option>)}
          </select>
        </Field>
        <div className="flex flex-col gap-4">
          <Toggle checked={inputs.exteriorSheathing} onChange={v => setInputs(p => ({ ...p, exteriorSheathing: v }))} label="Exterior Sheathing (OSB)" />
          <Toggle checked={inputs.insulation} onChange={v => setInputs(p => ({ ...p, insulation: v }))} label="Insulation (R-13 Batts)" />
          <Toggle checked={inputs.drywall} onChange={v => setInputs(p => ({ ...p, drywall: v }))} label={'Interior Drywall (½")'} />
        </div>
      </div>
      {hasResults && <ResultsTable rows={rows} title="Wall System" />}
      {!hasResults && (
        <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#AAA]">
          Enter wall dimensions above to see your material estimate.
        </div>
      )}
    </div>
  );
}

/* ─── FLOOR TAB ─── */
function FloorTab() {
  const [inputs, setInputs] = useState<FloorInputs>({
    sqft: "",
    finish: "lvp",
    includeSubfloor: true,
  });

  const rows = calcFloor(inputs);
  const hasResults = (parseFloat(inputs.sqft) || 0) > 0;

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Floor Area (sq ft)">
          <NumberInput value={inputs.sqft} onChange={v => setInputs(p => ({ ...p, sqft: v }))} placeholder="e.g. 1200" />
        </Field>
        <Field label="Finish Flooring Type">
          <select
            value={inputs.finish}
            onChange={e => setInputs(p => ({ ...p, finish: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
          >
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
      {hasResults && <ResultsTable rows={rows} title="Floor System" />}
      {!hasResults && (
        <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#AAA]">
          Enter floor area above to see your material estimate.
        </div>
      )}
    </div>
  );
}

/* ─── ROOF TAB ─── */
function RoofTab() {
  const [inputs, setInputs] = useState<RoofInputs>({
    footprintSqft: "",
    pitch: "6:12",
    iceWater: true,
    includeDecking: false,
  });

  const rows = calcRoof(inputs);
  const fp = parseFloat(inputs.footprintSqft) || 0;
  const actualArea = fp * (PITCH_FACTORS[inputs.pitch] ?? 1.118);
  const hasResults = fp > 0;

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">
        <Field label="Roof Footprint Area (sq ft)" note="Measure the exterior footprint of the building, not actual roof surface">
          <NumberInput value={inputs.footprintSqft} onChange={v => setInputs(p => ({ ...p, footprintSqft: v }))} placeholder="e.g. 1800" />
        </Field>
        <Field label="Roof Pitch">
          <select
            value={inputs.pitch}
            onChange={e => setInputs(p => ({ ...p, pitch: e.target.value }))}
            className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-2.5 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
          >
            {Object.keys(PITCH_FACTORS).map(p => (
              <option key={p} value={p}>{p} pitch (×{PITCH_FACTORS[p].toFixed(3)} factor)</option>
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
      {hasResults && <ResultsTable rows={rows} title="Roofing System" />}
      {!hasResults && (
        <div className="mt-8 p-8 border-2 border-dashed border-[#DDD8D0] text-center text-[#AAA]">
          Enter roof footprint area above to see your material estimate.
        </div>
      )}
    </div>
  );
}

/* ─── MAIN PAGE ─── */
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
            <h1 className="text-4xl md:text-5xl font-black font-serif uppercase mb-3">Material Estimator</h1>
            <p className="text-gray-400 text-lg max-w-2xl">Residential material take-offs for wall, floor, and roofing systems. Includes 10% waste factor. Labor, delivery, and tax not included.</p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12 max-w-5xl">
          {/* Tab Navigation */}
          <div className="flex border-b-2 border-[#DDD8D0] mb-10 gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-6 py-3 font-bold uppercase tracking-wider text-sm transition-all border-b-2 -mb-[2px] ${
                  tab === t.id
                    ? "border-[#E85D26] text-[#E85D26]"
                    : "border-transparent text-[#888] hover:text-[#1A1A1A]"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => window.print()}
              className="ml-auto flex items-center gap-2 px-4 py-3 text-sm text-[#888] hover:text-[#1A1A1A] transition-colors"
            >
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
            <strong className="text-[#555]">Disclaimer:</strong> This tool provides rough material quantity and cost estimates for budgeting purposes only. Prices are based on typical retail rates and are updated periodically — actual costs will vary by region, supplier, and market conditions. Always verify quantities and pricing with your local supplier before purchasing. This estimate does not include labor, permits, equipment, delivery, or sales tax.
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
