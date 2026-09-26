import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';

async function withWorker(run: (worker: Worker) => Promise<void>) {
  const worker = new Worker(new URL('./worker-adapter.mjs', import.meta.url));
  try {
    const [ready] = await once(worker, 'message');
    assert.equal(ready.ready, true);
    await run(worker);
  } finally { await worker.terminate(); }
}

test('production worker transfers full-size enhancement and diagnostic buffers', async () => {
  await withWorker(async worker => {
    const data = new Uint8ClampedArray(1201 * 2 * 4).fill(100);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const original = data.slice();
    const response = once(worker, 'message');
    worker.postMessage({ kind: 'enhance', source: { width: 1201, height: 2, data }, threshold: 0, strength: 1 }, [data.buffer]);
    assert.equal(data.byteLength, 0, 'input ownership transferred');
    const [message] = await response;
    assert.equal(message.kind, 'enhance');
    assert.equal(message.result.enhanced.width, 1201);
    assert.deepEqual(message.result.enhanced.data, original);
    assert.equal(message.result.entropy.data.length, original.length);
    assert.equal(message.result.mask.data.length, original.length);
  });
});

test('production worker returns a channel-specific probe', async () => {
  await withWorker(async worker => {
    const data = new Uint8ClampedArray([0, 36, 0, 255, 0, 37, 0, 255]);
    const response = once(worker, 'message');
    worker.postMessage({ kind: 'probe', source: { width: 2, height: 1, data }, probe: 'lane', channel: 1 }, [data.buffer]);
    const [message] = await response;
    assert.equal(message.kind, 'probe');
    assert.equal(message.result.count, 1);
    assert.equal(message.result.map.data.length, 8);
  });
});

test('production worker reports invalid input instead of leaving the caller waiting', async () => {
  await withWorker(async worker => {
    const response = once(worker, 'message');
    worker.postMessage({ kind: 'enhance', source: { width: 0, height: 1, data: new Uint8ClampedArray() }, threshold: 5, strength: 1.5 });
    const [message] = await response;
    assert.match(message.error, /invalid dimensions/);
  });
});
