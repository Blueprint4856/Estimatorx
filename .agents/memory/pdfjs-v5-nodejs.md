---
name: pdfjs-dist v5 Node.js usage + production canvas pitfall
description: How to correctly use pdfjs-dist v5 on a Node.js server — do NOT configure a worker. Also: node-canvas will fail in production.
---

## Rule

**Never set `GlobalWorkerOptions.workerPort` or `GlobalWorkerOptions.workerSrc` in Node.js.**
Just import pdfjs-dist and call `getDocument()` directly. No worker setup needed.

## Why

pdfjs-dist v5 has a static class initialiser in `PDFWorker`:

```js
static {
  if (isNodeJS) {
    this.#isWorkerDisabled = true;         // <-- key
    GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs";
  }
}
```

When `#isWorkerDisabled = true`, `PDFWorker.#initialize()` calls `#setupFakeWorker()`,
which runs the entire PDF engine in-process with no browser APIs needed.

Setting `workerPort` bypasses `#initialize()` entirely — it routes through
`#initializeFromPort(port)` which hands the port directly to `MessageHandler`, which
calls `comObj.addEventListener('message', ...)`. Node.js `Worker` objects use `.on()`
not `.addEventListener()`, so this always throws `comObj.addEventListener is not a function`.

## How to apply

```typescript
// CORRECT — no worker config, pdfjs handles Node.js automatically
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const pdfDoc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;

// WRONG — do not do any of these
pdfjs.GlobalWorkerOptions.workerPort = worker;     // bypasses fake-worker path
pdfjs.GlobalWorkerOptions.workerSrc = "...";       // same problem
globalThis.Worker = NodeWorker;                    // doesn't fix addEventListener crash
```

Tested with pdfjs-dist@5.7.284, Node.js v24.

## Production: node-canvas does NOT work

The Replit production deployment container is missing `libuuid.so.1` (and likely other
native libs that `node-canvas` needs). `OffscreenCanvas` is also not available in this
Node.js 24 build (it's `undefined` globally).

**Do not use node-canvas or OffscreenCanvas for PDF rendering in this project.**

## Working approach: send PDF directly to OpenAI

OpenAI SDK v6.39.0 supports a `file` content part with `file_data`. GPT-4o can read
the PDF natively — no rendering, no canvas, no native deps:

```typescript
const { default: OpenAI } = await import("openai");
const openai = new OpenAI({ apiKey, baseURL });
const pdfBase64 = pdfBuffer.toString("base64");

await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{
    role: "user",
    content: [
      { type: "file", file: { filename: "plan.pdf", file_data: `data:application/pdf;base64,${pdfBase64}` } } as any,
      { type: "text", text: "Extract dimensions..." },
    ],
  }],
});
```

This works for both digital (text-layer) and scanned (image-only) PDFs.
