import { workerData, parentPort } from "node:worker_threads";

const EXTRACTION_SCHEMA = `{
  "sqft": <total gross living area in sq ft as a number, or null>,
  "footprintSqft": <building footprint sq ft as a number, or null — only if clearly different from sqft>,
  "stories": <number of stories as 1 or 2, or null>,
  "buildingWidth": <narrow overall dimension in feet as a number, or null>,
  "buildingLength": <long overall dimension in feet as a number, or null>,
  "roofPitch": <roof pitch such as "4:12" "6:12" "8:12", or null>,
  "linearFeet": <total exterior wall perimeter in linear feet as a number, or null>,
  "confidence": <"high" if 4+ fields clearly found, "medium" if 2-3 fields found, "low" if 0-1 found>
}`;

const EXTRACTION_HINTS = `Extraction hints:
- sqft: look for "gross living area", "GLA", "heated sq ft", "conditioned area", "total living", total floor area labels
- footprintSqft: only include if clearly different from sqft (e.g. a 2-story house with a noted first-floor area)
- stories: count above-grade habitable floors; "2 story", "two story", "2-story" -> 2
- buildingWidth: look for overall building width dimension (shorter span)
- buildingLength: look for overall building length dimension (longer span)
- roofPitch: look for "4:12", "6/12", "8 in 12", slope notations in notes or schedules
- linearFeet: look for perimeter notation, sum of exterior wall lengths, or "LF" measurements

Return ONLY valid JSON — no explanation, no markdown fences.`;

const VISION_PROMPT = `You are a construction plan reading assistant. Analyze these rendered images of a residential building plan PDF and extract key dimensions.

Return ONLY a single JSON object with these exact keys (use null for any value you cannot find):

${EXTRACTION_SCHEMA}

${EXTRACTION_HINTS}`;

interface WorkerInput {
  pdfBuffer: Buffer;
  openaiBaseUrl: string;
  openaiApiKey: string;
}

async function run(): Promise<void> {
  const { pdfBuffer, openaiBaseUrl, openaiApiKey } = workerData as WorkerInput;

  // pdfjs-dist v5 detects isNodeJS=true and uses fake-worker (in-process) mode automatically.
  // No workerPort or workerSrc needed — setting them bypasses the fake-worker path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { createCanvas } = await import("canvas") as any;

  const data = new Uint8Array(pdfBuffer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDoc = await (pdfjs.getDocument({ data, verbosity: 0 }).promise) as any;
  const pageCount = Math.min(pdfDoc.numPages as number, 6);

  const base64Images: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(
      Math.ceil(viewport.width as number),
      Math.ceil(viewport.height as number),
    );
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jpegBuf = (canvas as any).toBuffer("image/jpeg", { quality: 0.85 }) as Buffer;
    base64Images.push(jpegBuf.toString("base64"));
  }

  if (base64Images.length === 0) {
    throw new Error("No pages could be rendered from this PDF");
  }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: openaiApiKey, baseURL: openaiBaseUrl });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          ...base64Images.map(b64 => ({
            type: "image_url" as const,
            image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "high" as const },
          })),
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI returned no valid JSON");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = JSON.parse(jsonMatch[0]) as Record<string, any>;

  if (!["high", "medium", "low"].includes(result.confidence as string)) {
    const found = [result.sqft, result.stories, result.buildingWidth,
      result.buildingLength, result.roofPitch, result.linearFeet]
      .filter(v => v != null).length;
    result.confidence = found >= 4 ? "high" : found >= 2 ? "medium" : "low";
  }

  parentPort!.postMessage({ ok: true, data: result });
}

run().catch(err => {
  parentPort!.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
});
