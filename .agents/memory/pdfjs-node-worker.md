---
name: pdfjs-dist Node.js worker setup
description: How to correctly configure pdfjs-dist workers in a Node.js server (production-safe)
---

## The rule

Never set `GlobalWorkerOptions.workerSrc = ""`. Empty string is falsy — pdfjs-dist throws
"No GlobalWorkerOptions.workerSrc specified" in production.

Use `worker_threads` + `workerPort` instead:

```typescript
import { Worker as NodeWorker } from "node:worker_threads";

async function withPdfjsWorker<T>(fn: (pdfjs: any) => Promise<T>): Promise<T> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as any;
  const workerUrl = (import.meta as any).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs") as string;
  const worker = new NodeWorker(new URL(workerUrl));
  pdfjs.GlobalWorkerOptions.workerPort = worker;
  try {
    return await fn(pdfjs);
  } finally {
    await worker.terminate();
  }
}
```

**Why:** The fake-worker mechanism pdfjs uses for empty workerSrc relies on Blob + URL.createObjectURL,
which doesn't exist in Node.js. This worked in dev by accident (module cache timing), failed in prod.

**How to apply:** Wrap every pdfjs `getDocument()` call in `withPdfjsWorker`. Also: always import
from `pdfjs-dist/legacy/build/pdf.mjs` (main build crashes with DOMMatrix error in Node.js).
