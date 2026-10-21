import test from "node:test";
import assert from "node:assert/strict";
import {
  measureEdge,
  buildRoofReport,
  pitchFactor,
  pitchRiseRunFromDegrees,
  polygonPlanAreaSqFt,
  reviewFinding,
  roofSurfaceAreaSqFt,
  type RoofPlane,
} from "../src/measurement-core.ts";

test("7:12 pitch factor converts plane area, not every lineal", () => {
  const factor = pitchFactor(7 / 12);
  assert.ok(Math.abs(factor - 1.157703) < 0.00001);
  assert.ok(Math.abs(roofSurfaceAreaSqFt(100, 7 / 12) - 115.7703) < 0.01);
});

test("Solar pitch degrees convert to rise/run", () => {
  assert.ok(Math.abs(pitchRiseRunFromDegrees(30) - Math.tan(Math.PI / 6)) < 1e-12);
});

test("polygon plan area uses projected feet", () => {
  assert.equal(polygonPlanAreaSqFt([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 },
  ]), 80);
});

test("eaves and ridges retain horizontal plan length", () => {
  const result = measureEdge({
    kind: "eave", start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, adjacentPlanes: [],
  });
  assert.equal(result.status, "measured");
  assert.equal(result.planLengthFt, 20);
  assert.equal(result.length3dFt, 20);
  assert.equal(result.correctionFactor, 1);
});

test("rake correction follows its own plane direction", () => {
  const plane: RoofPlane = { id: "p1", pitchRiseRun: 7 / 12, downslopeAzimuthDeg: 90 };
  const result = measureEdge({
    kind: "rake", start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, adjacentPlanes: [plane],
  });
  assert.equal(result.status, "measured");
  assert.ok(Math.abs((result.length3dFt ?? 0) - 20 * pitchFactor(7 / 12)) < 1e-8);
});

test("hip/valley length reconciles the two adjacent planes", () => {
  const eastFall: RoofPlane = { id: "east", pitchRiseRun: 7 / 12, downslopeAzimuthDeg: 45 };
  const southFall: RoofPlane = { id: "south", pitchRiseRun: 7 / 12, downslopeAzimuthDeg: 135 };
  const result = measureEdge({
    kind: "valley", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, adjacentPlanes: [eastFall, southFall],
  });
  assert.equal(result.status, "measured");
  assert.ok(result.length3dFt! > result.planLengthFt);
  assert.ok(Math.abs(result.length3dFt! - Math.sqrt(100 + (7 / 12 * 10 / Math.sqrt(2)) ** 2)) < 0.01);
});

test("equal-length hip/valley estimates still fail when planes imply opposite elevation changes", () => {
  const eastFall: RoofPlane = { id: "east", pitchRiseRun: 7 / 12, downslopeAzimuthDeg: 45 };
  const southFall: RoofPlane = { id: "south", pitchRiseRun: 7 / 12, downslopeAzimuthDeg: 225 };
  const result = measureEdge({
    kind: "hip", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, adjacentPlanes: [eastFall, southFall],
  });
  assert.equal(result.status, "needs_review");
  assert.equal(result.length3dFt, null);
});

test("unclassified Bermuda spans stay unmeasured for edge totals", () => {
  const result = measureEdge({
    kind: "unknown", start: { x: 0, y: 0 }, end: { x: 16.1, y: 0 }, adjacentPlanes: [],
  });
  assert.equal(result.status, "needs_review");
  assert.equal(result.length3dFt, null);
});

test("reused listing images do not count as independent confirmation", () => {
  const result = reviewFinding({
    findingClass: "confirmed", coverage: 1, agreesWithinTolerance: true,
    evidence: [
      { id: "zillow", independenceGroupId: "mls-photo-set-1", sourceFamily: "listing", quality: 0.8 },
      { id: "realtor", independenceGroupId: "mls-photo-set-1", sourceFamily: "listing", quality: 0.8 },
    ],
  });
  assert.equal(result.independentSourceGroups.length, 1);
  assert.equal(result.disposition, "needs_review");
  assert.equal(result.releaseAllowed, false);
});

test("candidate or conflicting findings cannot pass as auto-verified", () => {
  const result = reviewFinding({
    findingClass: "candidate", coverage: 1, agreesWithinTolerance: false,
    evidence: [
      { id: "county", independenceGroupId: "county-2025", sourceFamily: "county-ortho", quality: 0.75 },
      { id: "google", independenceGroupId: "google-satellite", sourceFamily: "aerial", quality: 0.72 },
    ],
  });
  assert.equal(result.confidence, 49);
  assert.equal(result.disposition, "needs_review");
  assert.equal(result.releaseAllowed, false);
});

test("report exposes EagleView-style categories without promoting unverified lengths", () => {
  const verified: Parameters<typeof buildRoofReport>[0]["facets"][number]["review"] = {
    findingClass: "confirmed", coverage: 1, agreesWithinTolerance: true,
    evidence: [
      { id: "county", independenceGroupId: "county-ortho", sourceFamily: "county", quality: 0.9 },
      { id: "lidar", independenceGroupId: "lidar", sourceFamily: "lidar", quality: 0.9 },
    ],
  };
  const candidate = { ...verified, findingClass: "candidate" as const };
  const report = buildRoofReport({
    facets: [
      { id: "main", planAreaSqFt: 1000, pitchRiseRun: 7 / 12, review: verified },
      { id: "porch-candidate", planAreaSqFt: 100, pitchRiseRun: 4 / 12, review: candidate },
    ],
    edges: [
      { kind: "eave", start: { x: 0, y: 0 }, end: { x: 40, y: 0 }, adjacentPlanes: [], review: verified },
      { kind: "rake", start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, adjacentPlanes: [
        { id: "main", pitchRiseRun: 7 / 12, downslopeAzimuthDeg: 90 },
      ], review: verified },
      { kind: "valley", start: { x: 0, y: 0 }, end: { x: 16.1, y: 0 }, adjacentPlanes: [], review: candidate },
    ],
    accessories: [
      { id: "skylight-1", kind: "skylight", review: verified },
      { id: "vent-candidate", kind: "plumbing_vent", review: candidate },
    ],
  });

  assert.equal(report.facetCount, 2);
  assert.ok(Math.abs(report.confirmedSurfaceAreaSqFt - 1157.703) < 0.01);
  assert.ok(Math.abs(report.candidateSurfaceAreaSqFt - 105.409) < 0.01);
  assert.equal(report.edgeTotalsFt.eave, 40);
  assert.ok(report.edgeTotalsFt.rake > 20);
  assert.equal(report.edgeTotalsFt.valley, 0);
  assert.ok(Math.abs(report.dripEdgeTotalFt - report.edgeTotalsFt.eave - report.edgeTotalsFt.rake) < 1e-8);
  assert.equal(report.accessoryCounts.skylight, 1);
  assert.equal(report.accessoryCounts.plumbing_vent, 0);
  assert.equal(report.releaseAllowed, false);
});
