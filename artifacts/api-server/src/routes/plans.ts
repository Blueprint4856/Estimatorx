import { Router, type Request, type Response } from "express";
import multer from "multer";
import { Worker } from "node:worker_threads";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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
  confidence: "high" | "medium" | "low";
}

type WorkerResult =
  | { ok: true; data: ExtractedPlanData }
  | { ok: false; error: string };

function runExtractWorker(pdfBuffer: Buffer): Promise<ExtractedPlanData> {
  return new Promise((resolve, reject) => {
    const openaiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!openaiBaseUrl || !openaiApiKey) {
      reject(new Error("OpenAI AI integration not configured"));
      return;
    }

    // planExtractWorker.mjs is emitted alongside index.mjs in the dist/ directory
    const workerUrl = new URL("./planExtractWorker.mjs", import.meta.url);
    const worker = new Worker(workerUrl, {
      workerData: { pdfBuffer, openaiBaseUrl, openaiApiKey },
    });

    worker.on("message", (msg: WorkerResult) => {
      if (msg.ok) {
        resolve(msg.data);
      } else {
        reject(new Error(msg.error));
      }
    });

    worker.on("error", reject);

    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

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

  try {
    req.log.info({ size: req.file.size }, "Starting PDF plan extraction");
    const extracted = await runExtractWorker(req.file.buffer);
    req.log.info({ extracted }, "Plan extraction complete");
    res.json({ data: extracted });
  } catch (err) {
    req.log.error({ err }, "Plan extraction failed");
    res.status(500).json({ error: "Extraction failed — please try again" }); return;
  }
});

export default router;
