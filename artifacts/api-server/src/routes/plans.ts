import { Router } from "express";
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
      cb(new Error("Only PDF files are accepted"));
    }
  },
});

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
  // The legacy build does not require browser globals like DOMMatrix.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;

  // Disable web worker — we run synchronously in the request handler
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  const data = new Uint8Array(buffer);
  const pdfDoc = await pdfjs.getDocument({ data, verbosity: 0, disableWorker: true }).promise;
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

interface ExtractedPlanData {
  sqft: number | null;
  footprintSqft: number | null;
  stories: 1 | 2 | null;
  buildingWidth: number | null;
  buildingLength: number | null;
  roofPitch: string | null;
  linearFeet: number | null;
}

const SYSTEM_PROMPT = `You are a construction plan reading assistant. Analyze the provided text extracted from residential building plan PDF pages and extract key dimensions.

Return ONLY a single JSON object with these exact keys (use null if a value cannot be found):

{
  "sqft": <total gross living area in square feet as a number, or null>,
  "footprintSqft": <building footprint sq ft as a number, or null — only if different from sqft (multi-story)>,
  "stories": <number of stories as 1 or 2, or null>,
  "buildingWidth": <narrow dimension in feet as a number, or null>,
  "buildingLength": <long dimension in feet as a number, or null>,
  "roofPitch": <roof pitch such as "4:12" "6:12" "8:12", or null>,
  "linearFeet": <total exterior wall perimeter in linear feet as a number, or null>
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

  return JSON.parse(jsonMatch[0]) as ExtractedPlanData;
}

/* ── POST /api/plans/extract ─────────────────────────────────────────────── */
router.post(
  "/plans/extract",
  upload.single("pdf"),
  async (req, res) => {
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
          error: "No readable text found in this PDF. Scanned/image-only PDFs are not supported.",
        }); return;
      }

      req.log.info({ chars: pdfText.length }, "PDF text extracted, querying AI");

      const extracted = await extractDimensions(pdfText);

      req.log.info({ extracted }, "Plan extraction complete");
      res.json({ data: extracted });
    } catch (err) {
      req.log.error({ err }, "Plan extraction failed");
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("Only PDF")) {
        res.status(400).json({ error: message }); return;
      }
      res.status(500).json({ error: "Extraction failed — please try again" }); return;
    }
  },
);

export default router;
