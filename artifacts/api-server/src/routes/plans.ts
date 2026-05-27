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

async function extractTextFromPdf(buffer: Buffer, maxPages = 6): Promise<string> {
  // Dynamically import the legacy (Node.js-compatible) build of pdfjs-dist.
  // The main build requires browser globals like DOMMatrix — the legacy build does not.
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

const SYSTEM_PROMPT = `You are a construction plan reading assistant. Analyze the provided text extracted from residential building plan PDF pages and extract key dimensions.

Return ONLY a single JSON object with these exact keys:

{
  "sqft": <total gross living area in square feet as a number, or null>,
  "footprintSqft": <building footprint sq ft as a number, or null — only if different from sqft (multi-story)>,
  "stories": <number of stories as 1 or 2, or null>,
  "buildingWidth": <narrow dimension in feet as a number, or null>,
  "buildingLength": <long dimension in feet as a number, or null>,
  "roofPitch": <roof pitch such as "4:12" "6:12" "8:12", or null>,
  "linearFeet": <total exterior wall perimeter in linear feet as a number, or null>,
  "confidence": <"high" if 4+ fields found with clear values, "medium" if 2–3 fields found, "low" if 0–1 found>
}

Extraction hints:
- sqft: look for "gross living area", "GLA", "heated sq ft", "conditioned area", "total living", total floor area labels
- footprintSqft: only include if clearly different from sqft (e.g. a 2-story house with a noted first-floor area)
- stories: count above-grade habitable floors; "2 story", "two story", "2-story" → 2
- buildingWidth: look for overall building width dimension (shorter span)
- buildingLength: look for overall building length dimension (longer span)
- roofPitch: look for "4:12", "6/12", "8 in 12", slope notations in notes or schedules
- linearFeet: look for perimeter notation, sum of exterior wall lengths, or "LF" measurements

Return ONLY valid JSON. No explanation, no markdown fences, just the JSON object.`;

async function extractDimensions(pdfText: string): Promise<ExtractedPlanData> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the text extracted from the building plans PDF:\n\n${pdfText.slice(0, 12000)}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI returned no valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as ExtractedPlanData;

  // Ensure confidence is always a valid value
  if (!["high", "medium", "low"].includes(parsed.confidence)) {
    const found = [parsed.sqft, parsed.stories, parsed.buildingWidth, parsed.buildingLength,
      parsed.roofPitch, parsed.linearFeet].filter(v => v != null).length;
    parsed.confidence = found >= 4 ? "high" : found >= 2 ? "medium" : "low";
  }

  return parsed;
}

/* ── POST /api/plans/extract ─────────────────────────────────────────────── */
router.post("/plans/extract", async (req, res) => {
  // Run multer first so any upload errors are caught and returned as JSON
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
    req.log.info({ size: req.file.size }, "Starting PDF plan text extraction");

    const pdfText = await extractTextFromPdf(req.file.buffer);
    if (!pdfText.trim()) {
      res.status(422).json({
        error: "No readable text found in this PDF. Scanned or image-only PDFs are not yet supported — please use a digital PDF exported from CAD or design software.",
      }); return;
    }

    req.log.info({ chars: pdfText.length }, "PDF text extracted, querying AI");

    const extracted = await extractDimensions(pdfText);

    req.log.info({ extracted }, "Plan extraction complete");
    res.json({ data: extracted });
  } catch (err) {
    req.log.error({ err }, "Plan extraction failed");
    res.status(500).json({ error: "Extraction failed — please try again" }); return;
  }
});

export default router;
