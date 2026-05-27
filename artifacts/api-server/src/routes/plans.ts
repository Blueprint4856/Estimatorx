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

/** Run multer as a promise so errors are catchable before the route handler. */
function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("pdf")(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getOpenAI(): OpenAI {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("OpenAI AI integration not configured");
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

interface TextItem { str: string }

/** Extract embedded text from up to maxPages PDF pages using pdfjs-dist legacy build. */
async function extractTextFromPdf(buffer: Buffer, maxPages = 6): Promise<string> {
  // Must use the legacy build — the main build requires browser globals (DOMMatrix) that crash Node.js.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  const data = new Uint8Array(buffer);
  const pdfDoc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pageCount = Math.min(pdfDoc.numPages, maxPages);

  const pageTexts: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as TextItem[])
      .filter((item) => item.str)
      .map((item) => item.str)
      .join(" ");
    if (pageText.trim()) pageTexts.push(`[Page ${i}]\n${pageText}`);
  }

  return pageTexts.join("\n\n");
}

/** Render PDF pages to JPEG buffers using pdfjs-dist + node-canvas (for scanned/image PDFs). */
async function renderPdfToImages(buffer: Buffer, maxPages = 6): Promise<Buffer[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { createCanvas } = await import("canvas") as any;

  pdfjs.GlobalWorkerOptions.workerSrc = "";

  const data = new Uint8Array(buffer);
  const pdfDoc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pageCount = Math.min(pdfDoc.numPages, maxPages);

  const images: Buffer[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    images.push((canvas as any).toBuffer("image/jpeg", { quality: 0.85 }));
  }

  return images;
}

export interface ExtractedPlanData {
  sqft: number | null;
  footprintSqft: number | null;
  stories: 1 | 2 | null;
  buildingWidth: number | null;
  buildingLength: number | null;
  roofPitch: string | null;
  linearFeet: number | null;
  confidence: "high" | "medium" | "low";
}

const EXTRACTION_SCHEMA = `{
  "sqft": <total gross living area in sq ft as a number, or null>,
  "footprintSqft": <building footprint sq ft as a number, or null — only if clearly different from sqft>,
  "stories": <number of stories as 1 or 2, or null>,
  "buildingWidth": <narrow overall dimension in feet as a number, or null>,
  "buildingLength": <long overall dimension in feet as a number, or null>,
  "roofPitch": <roof pitch such as "4:12" "6:12" "8:12", or null>,
  "linearFeet": <total exterior wall perimeter in linear feet as a number, or null>,
  "confidence": <"high" if 4+ fields clearly found, "medium" if 2–3 fields found, "low" if 0–1 found>
}`;

const EXTRACTION_HINTS = `Extraction hints:
- sqft: look for "gross living area", "GLA", "heated sq ft", "conditioned area", "total living", total floor area labels
- footprintSqft: only include if clearly different from sqft (e.g. a 2-story house with a noted first-floor area)
- stories: count above-grade habitable floors; "2 story", "two story", "2-story" → 2
- buildingWidth: look for overall building width dimension (shorter span)
- buildingLength: look for overall building length dimension (longer span)
- roofPitch: look for "4:12", "6/12", "8 in 12", slope notations in notes or schedules
- linearFeet: look for perimeter notation, sum of exterior wall lengths, or "LF" measurements

Return ONLY valid JSON — no explanation, no markdown fences.`;

const TEXT_SYSTEM_PROMPT = `You are a construction plan reading assistant. Analyze text extracted from a residential building plan PDF and extract key dimensions.

Return ONLY a single JSON object with these exact keys (use null if a value cannot be found):

${EXTRACTION_SCHEMA}

${EXTRACTION_HINTS}`;

const VISION_SYSTEM_PROMPT = `You are a construction plan reading assistant. Analyze the rendered images of residential building plan PDF pages and extract key dimensions.

Return ONLY a single JSON object with these exact keys (use null if a value cannot be found):

${EXTRACTION_SCHEMA}

${EXTRACTION_HINTS}`;

function normalizeConfidence(parsed: ExtractedPlanData): void {
  if (!["high", "medium", "low"].includes(parsed.confidence)) {
    const found = [parsed.sqft, parsed.stories, parsed.buildingWidth,
      parsed.buildingLength, parsed.roofPitch, parsed.linearFeet]
      .filter(v => v != null).length;
    parsed.confidence = found >= 4 ? "high" : found >= 2 ? "medium" : "low";
  }
}

/** Extract dimensions from text (fast path — digital/vector PDFs). */
async function extractDimensionsFromText(pdfText: string): Promise<ExtractedPlanData> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: TEXT_SYSTEM_PROMPT },
      { role: "user", content: `Text extracted from building plans PDF:\n\n${pdfText.slice(0, 12000)}` },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI returned no valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as ExtractedPlanData;
  normalizeConfidence(parsed);
  return parsed;
}

/** Extract dimensions from rendered page images (vision path — scanned/image PDFs). */
async function extractDimensionsFromImages(images: Buffer[]): Promise<ExtractedPlanData> {
  const openai = getOpenAI();

  const imageMessages = images.map(buf => ({
    type: "image_url" as const,
    image_url: {
      url: `data:image/jpeg;base64,${buf.toString("base64")}`,
      detail: "high" as const,
    },
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 512,
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "These are pages from a residential building plans PDF. Extract the key dimensions:" },
          ...imageMessages,
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI returned no valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as ExtractedPlanData;
  normalizeConfidence(parsed);
  return parsed;
}

/* ── POST /api/plans/extract ─────────────────────────────────────────────── */
router.post("/plans/extract", async (req, res) => {
  // Run multer first so upload errors are caught here and returned as JSON
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

  try {
    req.log.info({ size: req.file.size }, "Starting PDF plan extraction");

    // Try text extraction first — fast and accurate for digital/CAD PDFs
    const pdfText = await extractTextFromPdf(req.file.buffer);
    const hasText = pdfText.trim().length >= 200;

    let extracted: ExtractedPlanData;

    if (hasText) {
      req.log.info({ chars: pdfText.length }, "Sufficient text found — using text extraction path");
      extracted = await extractDimensionsFromText(pdfText);
    } else {
      // Sparse or no text — PDF is likely scanned/image-only; render pages and use GPT-4o vision
      req.log.info({ chars: pdfText.trim().length }, "Sparse text — rendering pages for vision extraction");
      const images = await renderPdfToImages(req.file.buffer);
      if (images.length === 0) {
        res.status(422).json({ error: "Could not read any pages from this PDF. Please ensure the file is not corrupted." });
        return;
      }
      extracted = await extractDimensionsFromImages(images);
    }

    req.log.info({ extracted }, "Plan extraction complete");
    res.json({ data: extracted });
  } catch (err) {
    req.log.error({ err }, "Plan extraction failed");
    res.status(500).json({ error: "Extraction failed — please try again" }); return;
  }
});

export default router;
