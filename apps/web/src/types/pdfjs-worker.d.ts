/**
 * pdf.js ships no types for its worker module. The free receipt reader loads
 * it on the server only to hand it to pdf.js as `globalThis.pdfjsWorker`
 * (lib/receipt-text-reader), so its shape does not matter here.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
