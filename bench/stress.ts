import { performance } from "node:perf_hooks";
import {
  measureEdge,
  polygonPlanAreaSqFt,
  reviewFinding,
  roofSurfaceAreaSqFt,
  type RoofPlane,
} from "../src/measurement-core.ts";

const iterations = 25_000;
const plane: RoofPlane = { id: "synthetic-7-12", pitchRiseRun: 7 / 12, downslopeAzimuthDeg: 90 };
const evidence = [
  { id: "county", independenceGroupId: "county-2025", sourceFamily: "county-ortho", quality: 0.75 },
  { id: "solar", independenceGroupId: "solar-2021", sourceFamily: "solar-model", quality: 0.8 },
];

const started = performance.now();
let checksum = 0;
for (let i = 0; i < iterations; i += 1) {
  const x = i % 100;
  const points = [
    { x, y: 0 }, { x: x + 20, y: 0 }, { x: x + 20, y: 14 }, { x, y: 14 },
  ];
  const planArea = polygonPlanAreaSqFt(points);
  checksum += roofSurfaceAreaSqFt(planArea, plane.pitchRiseRun);
  const edge = measureEdge({
    kind: "rake", start: { x, y: 0 }, end: { x: x + 14, y: 0 }, adjacentPlanes: [plane],
  });
  if (edge.status !== "measured") throw new Error("Synthetic edge unexpectedly failed.");
  checksum += edge.length3dFt ?? 0;
  checksum += reviewFinding({
    findingClass: "confirmed", coverage: 1, agreesWithinTolerance: true, evidence,
  }).confidence;
}
const elapsedMs = performance.now() - started;
const operations = iterations * 3;
console.log(JSON.stringify({
  iterations,
  geometryAndEvidenceOperations: operations,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  operationsPerSecond: Math.round(operations / (elapsedMs / 1000)),
  checksum: Number(checksum.toFixed(2)),
  note: "Synthetic core-only benchmark; excludes imagery review, source retrieval, georeferencing, and human approval.",
}, null, 2));
