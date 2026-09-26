import test from "node:test";
import assert from "node:assert/strict";
import {
  enhance,
  probe,
  keldBand,
  laneUnitStep,
  estimateBackgroundStep,
  validateFile,
  validateDimensions,
  type Raster,
} from "../artifacts/digisl-image-processing/src/lib/processing.ts";

function raster(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number[],
): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
}

test("K-Elimination agrees with the quotient over the entire STAR8 range", () => {
  for (let n = 0; n < 1332; n++) assert.equal(keldBand(n), Math.floor(n / 36));
  for (const invalid of [-1, 1332, 1.5, NaN])
    assert.throws(() => keldBand(invalid));
});

test("lane comb identifies only ±1 for all 65,536 possible 8-bit sample pairs", () => {
  for (let a = 0; a < 256; a++)
    for (let b = 0; b < 256; b++)
      assert.equal(laneUnitStep(a, b), Math.abs(b - a) === 1, `${a} → ${b}`);
});

test("probes preserve a 1,201-pixel row and do not invent row-boundary transitions", () => {
  const source = raster(1201, 2, (_x, y) => [y * 50, y * 50, y * 50, 255]);
  const result = probe(source, "lane", 1);
  assert.equal(result.count, 0);
  assert.equal(result.map.width, 1201);
  const rowBoundary = raster(2, 2, (x, y) => [
    0,
    [
      [20, 5],
      [6, 30],
    ][y][x],
    0,
    255,
  ]);
  assert.equal(probe(rowBoundary, "lane", 1).count, 0);
});

test("lane comb counts both axes and honors the selected channel", () => {
  const source = raster(2, 2, (x, y) => [0, x + y, 0, 255]);
  assert.equal(probe(source, "lane", 1).count, 4);
  assert.equal(probe(source, "lane", 0).count, 0);
});

test("integer probes exclude non-opaque pixels", () => {
  const source = raster(2, 1, (x) => [x, x, x, x ? 254 : 255]);
  assert.equal(probe(source, "lane", 1).count, 0);
  assert.equal(probe(source, "keld", 1).map.data[7], 0);
});

test("KELD occupies the eight correct bands for an 8-bit ramp", () => {
  const result = probe(
    raster(256, 1, (x) => [x, x, x, 255]),
    "keld",
    0,
  );
  assert.equal(result.count, 8);
  assert.equal(
    result.metrics.find((m) => m.label === "band indices")?.value,
    "0, 1, 2, 3, 4, 5, 6, 7",
  );
});

test("block GCD detects an incompatible region and includes partial edge blocks", () => {
  const source = raster(49, 16, (x, y) => {
    const value = x < 32 ? ((x % 16) + y) * 4 : ((x % 16) + y) * 3;
    return [value, value, value, 255];
  });
  const result = probe(source, "quantization", 1);
  assert.equal(
    result.metrics.find((m) => m.label === "blocks inspected")?.value,
    "4",
  );
  assert.equal(
    result.metrics.find((m) => m.label === "background step")?.value,
    "4",
  );
  assert.equal(result.count, 2);
});

test("flat blocks supply no step evidence", () => {
  assert.equal(estimateBackgroundStep([0, 0]), 1);
  assert.equal(estimateBackgroundStep([0, 4, 8, 3]), 4);
  const result = probe(
    raster(17, 17, () => [80, 80, 80, 255]),
    "quantization",
    0,
  );
  assert.equal(result.count, 0);
});

test("strength 1 is byte-identical, preserves dimensions and source buffer", () => {
  const source = raster(1201, 2, (x, y) => [x % 256, y * 20, 200, x % 256]);
  const before = new Uint8ClampedArray(source.data);
  const result = enhance(source, 0, 1);
  assert.deepEqual(result.enhanced.data, before);
  assert.deepEqual(source.data, before);
  assert.equal(result.enhanced.width, 1201);
  assert.equal(result.clippedPixels, 0);
});

test("a constant colored field remains unchanged at maximum strength", () => {
  const source = raster(12, 10, () => [240, 20, 50, 255]);
  const result = enhance(source, 0, 3);
  assert.deepEqual(result.enhanced.data, source.data);
  assert.ok(Math.abs(result.meanEntropy) < 1e-10);
});

test("Shannon entropy matches an independent 9×9 histogram reference at every pixel", () => {
  const source = raster(7, 4, (x, y) => {
    const v = (x * 31 + y * 17) % 256;
    return [v, v, v, 255];
  });
  const reflect = (n: number, size: number): number =>
    n < 0
      ? reflect(-n - 1, size)
      : n >= size
        ? reflect(2 * size - n - 1, size)
        : n;
  let total = 0;
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const hist = new Map<number, number>();
      for (let yy = y - 4; yy <= y + 4; yy++)
        for (let xx = x - 4; xx <= x + 4; xx++) {
          const v =
            source.data[
              (reflect(yy, source.height) * source.width +
                reflect(xx, source.width)) *
                4
            ];
          hist.set(v, (hist.get(v) ?? 0) + 1);
        }
      let bits = 0;
      for (const n of hist.values()) {
        const p = n / 81;
        bits -= p * Math.log2(p);
      }
      total += bits;
      const result = enhance(source, bits - 0.000001, 1);
      assert.equal(result.mask.data[(y * source.width + x) * 4], 60);
    }
  assert.ok(Math.abs(enhance(source, 2, 1).meanEntropy - total / 28) < 1e-10);
});

test("known binary neighborhood gives Shannon entropy near one bit", () => {
  const source = raster(9, 9, (x, y) => {
    const v = (x + y) % 2 ? 255 : 0;
    return [v, v, v, 255];
  });
  const result = enhance(source, 1.1, 2);
  assert.equal(result.activePercent, 0);
  assert.ok(result.meanEntropy > 0.99 && result.meanEntropy < 1);
});

test("fully transparent and one-pixel images have finite metrics", () => {
  const transparent = enhance(
    raster(1, 1, () => [255, 10, 22, 0]),
    0,
    3,
  );
  assert.equal(transparent.meanEntropy, 0);
  assert.equal(transparent.activePercent, 0);
  const one = enhance(
    raster(1, 1, () => [77, 77, 77, 255]),
    1,
    3,
  );
  assert.equal(one.meanEntropy, 0);
});

test("enhancement preserves alpha and ignores invisible neighbor color", () => {
  const a = raster(2, 1, (x) => (x ? [255, 0, 0, 0] : [30, 60, 90, 128]));
  const b = raster(2, 1, (x) => (x ? [0, 255, 255, 0] : [30, 60, 90, 128]));
  assert.deepEqual(
    enhance(a, 0, 3).enhanced.data.slice(0, 4),
    enhance(b, 0, 3).enhanced.data.slice(0, 4),
  );
  assert.equal(enhance(a, 0, 3).enhanced.data[3], 128);
});

test("clipping is counted in saturated sharpening outputs", () => {
  const result = enhance(
    raster(3, 1, (x) => (x === 1 ? [255, 255, 255, 255] : [0, 0, 0, 255])),
    0,
    3,
  );
  assert.equal(result.clippedPixels, 3);
});

test("invalid inputs fail explicitly before processing", () => {
  const source = raster(1, 1, () => [0, 0, 0, 255]);
  for (const t of [NaN, Infinity, -1, 8])
    assert.throws(() => enhance(source, t, 1));
  assert.throws(() => enhance(source, 1, 4));
  assert.throws(() =>
    enhance({ ...source, data: new Uint8ClampedArray(3) }, 1, 1),
  );
  for (const dims of [
    [0, 1],
    [8193, 1],
    [5000, 5000],
    [1.5, 10],
  ])
    assert.throws(() => validateDimensions(dims[0], dims[1]));
  assert.throws(() =>
    validateFile({
      size: 50 * 1024 * 1024 + 1,
      type: "image/png",
      name: "big.png",
    }),
  );
  assert.throws(() =>
    validateFile({ size: 10, type: "image/svg+xml", name: "x.svg" }),
  );
  assert.doesNotThrow(() =>
    validateFile({ size: 10, type: "", name: "photo.PNG" }),
  );
});
