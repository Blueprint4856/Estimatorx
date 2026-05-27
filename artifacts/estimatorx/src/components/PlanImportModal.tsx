import { useState, useRef } from "react";
import { X, FileUp, Loader2, CheckCircle, AlertCircle, FileText } from "lucide-react";

interface ExtractedPlanData {
  sqft: number | null;
  footprintSqft: number | null;
  stories: 1 | 2 | null;
  buildingWidth: number | null;
  buildingLength: number | null;
  roofPitch: string | null;
  linearFeet: number | null;
}

interface EditableFields {
  sqft: string;
  footprintSqft: string;
  stories: string;
  buildingWidth: string;
  buildingLength: string;
  roofPitch: string;
  linearFeet: string;
}

const ROOF_PITCHES = ["4:12","5:12","6:12","7:12","8:12","9:12","10:12","12:12"];

const FIELD_META: { key: keyof EditableFields; label: string; unit: string; type: "number" | "select" }[] = [
  { key: "sqft", label: "Gross Living Area", unit: "sq ft", type: "number" },
  { key: "footprintSqft", label: "Building Footprint", unit: "sq ft", type: "number" },
  { key: "stories", label: "Stories", unit: "", type: "select" },
  { key: "buildingWidth", label: "Building Width", unit: "ft", type: "number" },
  { key: "buildingLength", label: "Building Length", unit: "ft", type: "number" },
  { key: "roofPitch", label: "Roof Pitch", unit: "", type: "select" },
  { key: "linearFeet", label: "Exterior Perimeter", unit: "LF", type: "number" },
];

function toEditableFields(data: ExtractedPlanData): EditableFields {
  return {
    sqft: data.sqft != null ? String(data.sqft) : "",
    footprintSqft: data.footprintSqft != null ? String(data.footprintSqft) : "",
    stories: data.stories != null ? String(data.stories) : "",
    buildingWidth: data.buildingWidth != null ? String(data.buildingWidth) : "",
    buildingLength: data.buildingLength != null ? String(data.buildingLength) : "",
    roofPitch: data.roofPitch ?? "",
    linearFeet: data.linearFeet != null ? String(data.linearFeet) : "",
  };
}

const SK_PROJECT = "ex.project";

interface PlanImportModalProps {
  onClose: () => void;
}

type Stage = "pick" | "loading" | "review" | "done" | "error";

const INPUT_CLS = "w-full bg-[#FAF8F5] border border-[#DDD8D0] px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors";
const SELECT_CLS = "w-full bg-[#FAF8F5] border border-[#DDD8D0] px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors";

export function PlanImportModal({ onClose }: PlanImportModalProps) {
  const [stage, setStage] = useState<Stage>("pick");
  const [fields, setFields] = useState<EditableFields>({
    sqft: "", footprintSqft: "", stories: "", buildingWidth: "",
    buildingLength: "", roofPitch: "", linearFeet: "",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const base = import.meta.env.BASE_URL;

  function setField(key: keyof EditableFields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  async function handleFileSelect(file: File) {
    if (!file) return;
    setFileName(file.name);
    setStage("loading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await fetch(`${base}api/plans/extract`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const json = await res.json() as { data?: ExtractedPlanData; error?: string };

      if (!res.ok) {
        setErrorMsg(json.error ?? "Extraction failed. Please try again.");
        setStage("error");
        return;
      }

      if (json.data) {
        setFields(toEditableFields(json.data));
        setStage("review");
      } else {
        setErrorMsg("No data returned from AI.");
        setStage("error");
      }
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
      setStage("error");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") handleFileSelect(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function applyToEstimate() {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem(SK_PROJECT) ?? "{}") as Record<string, string>; }
      catch { return {}; }
    })();

    const updated = { ...existing };
    if (fields.sqft) updated.sqft = fields.sqft;
    if (fields.footprintSqft) updated.footprintSqft = fields.footprintSqft;
    if (fields.stories) updated.stories = fields.stories;
    if (fields.buildingWidth) updated.buildingWidth = fields.buildingWidth;
    if (fields.buildingLength) updated.buildingLength = fields.buildingLength;
    if (fields.roofPitch) updated.roofPitch = fields.roofPitch;
    if (fields.linearFeet) updated.linearFeet = fields.linearFeet;

    try { localStorage.setItem(SK_PROJECT, JSON.stringify(updated)); } catch {}

    setStage("done");
    setTimeout(() => {
      onClose();
      window.location.reload();
    }, 1000);
  }

  const extractedCount = Object.values(fields).filter(v => v !== "").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-white border border-[#DDD8D0] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1A1A1A] px-8 py-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-[#888] hover:text-white transition-colors">
            <X size={18} />
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#E85D26] mb-1">AI Plan Reading</p>
          <h2 className="text-[#F7F4F0] font-black text-xl uppercase tracking-tight">Import from Building Plans</h2>
        </div>

        <div className="px-8 py-6">

          {/* PICK stage */}
          {stage === "pick" && (
            <>
              <p className="text-sm text-[#555] mb-5">
                Upload a PDF of your architectural or construction drawings. The AI will read key dimensions and pre-fill the Project Setup fields.
              </p>

              <div
                className="border-2 border-dashed border-[#DDD8D0] p-10 text-center cursor-pointer hover:border-[#E85D26] hover:bg-[#FFF8F5] transition-colors"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={28} className="mx-auto mb-3 text-[#AAA]" />
                <p className="text-sm font-semibold text-[#444] mb-1">Drop PDF here or click to browse</p>
                <p className="text-xs text-[#AAA]">Max 25 MB · First 6 pages analysed</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              <p className="mt-4 text-[11px] text-[#AAA] leading-relaxed">
                Works best with digital (vector) PDFs exported from CAD or design software. Scanned/photographed plans may have reduced accuracy.
              </p>
            </>
          )}

          {/* LOADING stage */}
          {stage === "loading" && (
            <div className="py-10 text-center">
              <Loader2 size={32} className="mx-auto mb-4 text-[#E85D26] animate-spin" />
              <p className="text-sm font-semibold text-[#1A1A1A] mb-1">Reading your plans…</p>
              <p className="text-xs text-[#888]">{fileName}</p>
              <p className="text-xs text-[#AAA] mt-2">This may take 15–30 seconds</p>
            </div>
          )}

          {/* ERROR stage */}
          {stage === "error" && (
            <div className="py-6">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 mb-5">
                <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{errorMsg}</p>
              </div>
              <button
                onClick={() => { setStage("pick"); setErrorMsg(""); }}
                className="w-full border border-[#1A1A1A] text-[#1A1A1A] py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#1A1A1A] hover:text-white transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* REVIEW stage */}
          {stage === "review" && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <FileText size={14} className="text-[#E85D26]" />
                <p className="text-xs text-[#666]">{fileName}</p>
                <span className="ml-auto text-[11px] font-bold text-[#E85D26]">
                  {extractedCount} of {FIELD_META.length} fields found
                </span>
              </div>

              <p className="text-xs text-[#888] mb-4">Review and edit the extracted values before applying. Blank fields will be left unchanged.</p>

              <div className="space-y-3 mb-6">
                {FIELD_META.map(({ key, label, unit, type }) => {
                  const value = fields[key];
                  const found = value !== "";
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-4 flex-shrink-0">
                        {found
                          ? <div className="w-2 h-2 rounded-full bg-[#E85D26] mx-auto" />
                          : <div className="w-2 h-2 rounded-full bg-[#DDD8D0] mx-auto" />
                        }
                      </div>
                      <label className="text-xs font-semibold text-[#555] w-40 flex-shrink-0">
                        {label}
                        {unit && <span className="font-normal text-[#999] ml-1">({unit})</span>}
                      </label>
                      <div className="flex-1">
                        {type === "number" ? (
                          <input
                            type="number"
                            value={value}
                            onChange={e => setField(key, e.target.value)}
                            placeholder="not found"
                            className={INPUT_CLS}
                          />
                        ) : key === "stories" ? (
                          <select value={value} onChange={e => setField(key, e.target.value)} className={SELECT_CLS}>
                            <option value="">not found</option>
                            <option value="1">1 story</option>
                            <option value="2">2 stories</option>
                          </select>
                        ) : (
                          <select value={value} onChange={e => setField(key, e.target.value)} className={SELECT_CLS}>
                            <option value="">not found</option>
                            {ROOF_PITCHES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStage("pick")}
                  className="flex-1 border border-[#DDD8D0] text-[#666] py-2.5 text-xs font-bold uppercase tracking-widest hover:border-[#999] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={applyToEstimate}
                  disabled={extractedCount === 0}
                  className="flex-1 bg-[#E85D26] text-white py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-40"
                >
                  Apply to Estimate
                </button>
              </div>
            </>
          )}

          {/* DONE stage */}
          {stage === "done" && (
            <div className="py-8 text-center">
              <CheckCircle size={32} className="mx-auto mb-3 text-green-500" />
              <p className="text-sm font-bold text-[#1A1A1A]">Applied! Refreshing estimator…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
