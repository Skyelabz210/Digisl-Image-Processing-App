// Node supplies the browser worker's message surface for protocol tests.
// The actual production worker module and algorithms execute unchanged.
import { parentPort } from 'node:worker_threads';
globalThis.self = {
  postMessage: (message, transfers) => parentPort.postMessage(message, transfers),
  onmessage: null,
};
await import('../artifacts/digisl-image-processing/src/lib/processing.worker.ts');
parentPort.on('message', data => globalThis.self.onmessage({ data }));
parentPort.postMessage({ ready: true });
