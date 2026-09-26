import test from "node:test";
import assert from "node:assert/strict";
import {
  addEntry,
  verifyLedger,
  hashText,
  rasterDigest,
  readSetting,
} from "../artifacts/digisl-image-processing/src/lib/provenance.ts";

test("SHA-256 matches a published known-answer vector", async () => {
  assert.equal(
    await hashText("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("receipt chain links operations and survives serialization", async () => {
  let entries = await addEntry([], "Import evidence", {
    sourceSha256: "abc",
    bytes: 32,
  });
  entries = await addEntry(entries, "Evidence probe", {
    probe: "keld",
    count: 3,
  });
  assert.equal(entries[1].previous, entries[0].chain);
  assert.deepEqual(
    await verifyLedger(JSON.parse(JSON.stringify(entries))),
    entries,
  );
});

test("verification rejects changed parameters, broken links, reordering and invalid shapes", async () => {
  let entries = await addEntry([], "Import", { source: "first" });
  entries = await addEntry(entries, "Probe", { count: 20 });
  const tampered = structuredClone(entries);
  tampered[0].parameters.source = "different";
  await assert.rejects(() => verifyLedger(tampered));
  await assert.rejects(() => verifyLedger([...entries].reverse()));
  await assert.rejects(() => verifyLedger(entries.slice(1)));
  for (const value of [{}, [null], [1], [{ chain: "0x12345678" }]])
    await assert.rejects(() => verifyLedger(value));
});

test("canonical parameters verify independently of object key order", async () => {
  const entries = await addEntry([], "Run", { z: 3, a: 1 });
  entries[0].parameters = { a: 1, z: 3 };
  await assert.doesNotReject(() => verifyLedger(entries));
});

test("pixel digest binds both dimensions and samples", async () => {
  const data = new Uint8ClampedArray([10, 20, 30, 255, 50, 60, 70, 255]);
  const first = await rasterDigest({ width: 2, height: 1, data });
  assert.notEqual(first, await rasterDigest({ width: 1, height: 2, data }));
  const altered = data.slice();
  altered[0]++;
  assert.notEqual(
    first,
    await rasterDigest({ width: 2, height: 1, data: altered }),
  );
});

test("stored settings recover from unavailable storage and malformed values", () => {
  for (const value of [null, "", "  ", "NaN", "Infinity", "-1", "99", "{}"]) {
    assert.equal(
      readSetting({ getItem: () => value }, "threshold", 5, 0, 6.3),
      5,
    );
  }
  assert.equal(
    readSetting(
      {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      "threshold",
      5,
      0,
      6.3,
    ),
    5,
  );
  assert.equal(
    readSetting({ getItem: () => "2.4" }, "threshold", 5, 0, 6.3),
    2.4,
  );
});
