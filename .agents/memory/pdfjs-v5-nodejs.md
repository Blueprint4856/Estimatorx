---
name: pdfjs-dist v5 Node.js usage
description: How to correctly use pdfjs-dist v5 on a Node.js server — do NOT configure a worker.
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

Setting `globalThis.Worker = NodeWorker` to pass the `instanceof Worker` check in the
`workerPort` setter does not help — it only gets you past the setter; the `addEventListener`
crash still happens inside `MessageHandler`.

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
