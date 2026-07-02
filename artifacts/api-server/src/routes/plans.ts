import { Router, type Request, type Response } from "express";
import multer from "multer";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted. Please upload a .pdf file."));
    }
  },
});

function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("pdf")(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export interface ExtractedPlanData {
  sqft: number | null;
  footprintSqft: number | null;
  stories: 1 | 2 | null;
  buildingWidth: number | null;
  buildingLength: number | null;
  roofPitch: string | null;
  linearFeet: number | null;
  foundationType: "slab" | "crawlspace" | "basement" | null;
  wallHeight: number | null;
  confidence: "high" | "medium" | "low";
}

const EXTRACTION_PROMPT = `You are a construction plan reading assistant. Analyze this building plan PDF and extract key dimensions. This may be a house, shop, garage, barn, pole building, addition, or any other structure — residential or non-residential.

Return ONLY a single JSON object with these exact keys (use null for any value you cannot find):

{
  "sqft": <total floor area in sq ft as a number, or null>,
  "footprintSqft": <building footprint sq ft as a number, or null — only if clearly different from sqft>,
  "stories": <number of stories as 1 or 2, or null>,
  "buildingWidth": <narrow overall dimension in feet as a number, or null>,
  "buildingLength": <long overall dimension in feet as a number, or null>,
  "roofPitch": <roof pitch such as "4:12" "6:12" "8:12", or null>,
  "linearFeet": <total exterior wall perimeter in linear feet as a number, or null>,
  "foundationType": <"slab" for slab-on-grade/monolithic slab, "crawlspace" for crawl space/pier-and-beam/stem wall with vents, "basement" for full below-grade basement, or null>,
  "wallHeight": <exterior wall height or plate height in feet as a whole number, e.g. 8 9 10 12 14, or null>,
  "confidence": <"high" if 4+ fields clearly found, "medium" if 2-3 fields found, "low" if 0-1 found>
}

Extraction hints:
- sqft: look for "gross living area", "GLA", "heated sq ft", "conditioned area", "total living", "floor area", "building area", "shop area", "total area", "footprint". If area not labeled, calculate buildingWidth × buildingLength if both are found.
- footprintSqft: only include if clearly different from sqft (e.g. a 2-story building where first-floor footprint is called out)
- stories: count above-grade habitable or usable floors. Default to 1 for shops, garages, and single-level additions unless plan explicitly shows a second floor.
- buildingWidth: overall building width on floor plan or foundation plan — the shorter span. For additions, use the addition's own width.
- buildingLength: overall building length — the longer span. For additions, use the addition's own length.
- roofPitch: look for slope notation "4:12", "6/12", "8 in 12", roof plan slope arrows, or general notes / structural sheets.
- linearFeet: look for perimeter notation or sum of exterior wall lengths. If not labeled, calculate as 2 × (buildingWidth + buildingLength) when both are found.
- foundationType: look at foundation plan details. Thickened-edge monolithic pour, slab key, anchor bolts in slab → "slab". Vented crawl space, floor joists, stem walls, pier-and-beam → "crawlspace". Poured concrete walls extending 6+ feet below grade, window wells → "basement".
- wallHeight: look for "plate height", "wall height", "EWH" (exterior wall height), or stud length callouts (e.g. "10' plate ht", "12' walls"). Precut stud codes: 92-5/8" → 8 ft, 104-5/8" → 9 ft, 116-5/8" → 10 ft.

Return ONLY valid JSON — no explanation, no markdown fences.`;

/* ── POST /api/plans/extract ─────────────────────────────────────────────── */
router.post("/plans/extract", async (req, res) => {
  try {
    await runUpload(req, res);
  } catch (err) {
    const isMulterError = err != null && typeof err === "object" && "code" in err;
    if (isMulterError && (err as { code: string }).code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large — maximum 25 MB allowed." }); return;
    }
    const msg = err instanceof Error ? err.message : "Upload failed";
    res.status(400).json({ error: msg }); return;
  }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  const plan = user?.plan ?? "free";
  if (plan !== "x_plan" && plan !== "pro_plan") {
    res.status(403).json({ error: "X Plan required" }); return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No PDF file uploaded" }); return;
  }

  const openaiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!openaiBaseUrl || !openaiApiKey) {
    res.status(500).json({ error: "AI integration not configured" }); return;
  }

  req.log.info({ size: req.file.size }, "Starting PDF plan extraction");

  try {
    // Buffer is guaranteed here — no worker thread serialization issues
    const pdfBase64 = req.file.buffer.toString("base64");
    const fileDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    const openai = new OpenAI({ apiKey: openaiApiKey, baseURL: openaiBaseUrl });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (openai as any).responses.create({
      model: "gpt-4o",
      max_output_tokens: 512,
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", filename: "building-plan.pdf", file_data: fileDataUrl },
            { type: "input_text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const raw: string = response.output_text ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned no valid JSON");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = JSON.parse(jsonMatch[0]) as Record<string, any>;

    if (!["high", "medium", "low"].includes(result.confidence as string)) {
      const found = [result.sqft, result.stories, result.buildingWidth,
        result.buildingLength, result.roofPitch, result.linearFeet,
        result.foundationType, result.wallHeight]
        .filter(v => v != null).length;
      result.confidence = found >= 4 ? "high" : found >= 2 ? "medium" : "low";
    }

    req.log.info({ result }, "Plan extraction complete");
    res.json({ data: result as ExtractedPlanData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Plan extraction failed");
    res.status(500).json({ error: "Extraction failed — please try again", detail: msg }); return;
  }
});

export default router;
