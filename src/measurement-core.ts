/**
 * Roof measurement geometry and evidence gates.
 * Coordinates must be in a local projected coordinate system measured in feet.
 * This module deliberately does not detect roof edges from imagery.
 */

export type Point2 = { x: number; y: number };
export type RoofEdgeKind =
  | "eave"
  | "rake"
  | "ridge"
  | "hip"
  | "valley"
  | "wall_flashing"
  | "step_flashing"
  | "unknown";

export type RoofPlane = {
  id: string;
  /** Rise per 12 inches of horizontal run. */
  pitchRiseRun: number;
  /** Direction water drains, clockwise from north. */
  downslopeAzimuthDeg: number;
};

export type EdgeMeasurement = {
  kind: RoofEdgeKind;
  start: Point2;
  end: Point2;
  adjacentPlanes: RoofPlane[];
};

export type EdgeResult = {
  status: "measured" | "needs_review";
  kind: RoofEdgeKind;
  planLengthFt: number;
  length3dFt: number | null;
  correctionFactor: number | null;
  reason: string;
};

export type Evidence = {
  id: string;
  /** Same underlying photo/model/report must use the same group, even if syndicated. */
  independenceGroupId: string;
  sourceFamily: string;
  quality: number;
  observedAt?: string;
};

export type FindingReview = {
  findingClass: "confirmed" | "candidate" | "unknown";
  coverage: number;
  agreesWithinTolerance: boolean;
  evidence: Evidence[];
};

export type ReviewResult = {
  confidence: number;
  band: "low" | "medium" | "high";
  disposition: "auto_verified" | "needs_review" | "needs_field_capture";
  independentSourceGroups: string[];
  releaseAllowed: false;
  reasons: string[];
};

/** Public report vocabulary modeled on EagleView's documented roof report fields. */
export type ReportAccessoryKind =
  | "skylight"
  | "chimney"
  | "plumbing_vent"
  | "exhaust_vent"
  | "ridge_vent"
  | "cricket"
  | "saddle"
  | "dead_valley"
  | "roof_wall_flashing"
  | "flat_section"
  | "other";

export type RoofFacetInput = {
  id: string;
  planAreaSqFt: number;
  pitchRiseRun: number;
  review: FindingReview;
};

export type ReportEdgeInput = EdgeMeasurement & { review: FindingReview };

export type AccessoryFinding = {
  id: string;
  kind: ReportAccessoryKind;
  review: FindingReview;
};

export type RoofReportInput = {
  facets: RoofFacetInput[];
  edges: ReportEdgeInput[];
  accessories?: AccessoryFinding[];
};

export type RoofReport = {
  reportConvention: "eagleview_style_public_measurement_categories";
  facetCount: number;
  facets: Array<{
    id: string;
    pitchRiseRun: number;
    planAreaSqFt: number;
    surfaceAreaSqFt: number;
    squares: number;
    review: ReviewResult;
  }>;
  confirmedSurfaceAreaSqFt: number;
  candidateSurfaceAreaSqFt: number;
  confirmedSquares: number;
  pitchDistribution: Array<{ pitchRiseRun: number; facetCount: number; surfaceAreaSqFt: number }>;
  edges: Array<{ geometry: EdgeResult; review: ReviewResult }>;
  edgeTotalsFt: Record<"eave" | "rake" | "ridge" | "hip" | "valley", number>;
  dripEdgeTotalFt: number;
  ridgeHipTotalFt: number;
  accessories: Array<{ id: string; kind: ReportAccessoryKind; review: ReviewResult }>;
  accessoryCounts: Record<ReportAccessoryKind, number>;
  releaseAllowed: false;
};

const FEET_PER_SQUARE_METER = 10.7639104167;
const EPSILON = 1e-9;

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
}

export function pitchRiseRunFromDegrees(pitchDegrees: number): number {
  if (!Number.isFinite(pitchDegrees) || pitchDegrees < 0 || pitchDegrees >= 90) {
    throw new RangeError("pitchDegrees must be in [0, 90)");
  }
  return Math.tan((pitchDegrees * Math.PI) / 180);
}

export function pitchFactor(pitchRiseRun: number): number {
  assertFinitePositive(pitchRiseRun, "pitchRiseRun");
  return Math.sqrt(1 + pitchRiseRun ** 2);
}

export function roofSurfaceAreaSqFt(planAreaSqFt: number, pitchRiseRun: number): number {
  assertFinitePositive(planAreaSqFt, "planAreaSqFt");
  return planAreaSqFt * pitchFactor(pitchRiseRun);
}

export function roofSurfaceAreaFromMeters(planAreaM2: number, pitchRiseRun: number): number {
  assertFinitePositive(planAreaM2, "planAreaM2");
  return roofSurfaceAreaSqFt(planAreaM2 * FEET_PER_SQUARE_METER, pitchRiseRun);
}

/** Shoelace area for a simple polygon in local projected feet. */
export function polygonPlanAreaSqFt(points: Point2[]): number {
  if (points.length < 3) throw new RangeError("A roof-plane polygon needs at least 3 points");
  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) / 2;
}

function planeElevationDelta(start: Point2, end: Point2, plane: RoofPlane): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const az = (plane.downslopeAzimuthDeg * Math.PI) / 180;
  // x points east and y north. Azimuth is clockwise from north.
  const horizontalRunAlongFall = dx * Math.sin(az) + dy * Math.cos(az);
  return -plane.pitchRiseRun * horizontalRunAlongFall;
}

function planeLength3d(start: Point2, end: Point2, plane: RoofPlane): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = planeElevationDelta(start, end, plane);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Measures edge lengths from projected plan coordinates. Eaves and ridges retain
 * plan length. Rakes use their roof plane. Hips/valleys require two adjacent
 * planes whose independently inferred 3D line lengths agree.
 */
export function measureEdge(edge: EdgeMeasurement, agreementToleranceFt = 0.25): EdgeResult {
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const planLengthFt = Math.hypot(dx, dy);
  const review = (reason: string): EdgeResult => ({
    status: "needs_review",
    kind: edge.kind,
    planLengthFt,
    length3dFt: null,
    correctionFactor: null,
    reason,
  });

  if (planLengthFt <= EPSILON) return review("Edge endpoints are coincident.");
  if (edge.kind === "unknown") return review("Edge type is unclassified.");
  if (edge.kind === "eave" || edge.kind === "ridge") {
    return {
      status: "measured",
      kind: edge.kind,
      planLengthFt,
      length3dFt: planLengthFt,
      correctionFactor: 1,
      reason: "Horizontal edge; no pitch factor applied.",
    };
  }

  if (edge.kind === "rake" || edge.kind === "wall_flashing" || edge.kind === "step_flashing") {
    if (edge.adjacentPlanes.length !== 1) {
      return review("This edge requires exactly one verified adjacent roof plane.");
    }
    const length3dFt = planeLength3d(edge.start, edge.end, edge.adjacentPlanes[0]);
    return {
      status: "measured",
      kind: edge.kind,
      planLengthFt,
      length3dFt,
      correctionFactor: length3dFt / planLengthFt,
      reason: "Slope correction derived from the adjacent plane pitch and edge direction.",
    };
  }

  if (edge.kind === "hip" || edge.kind === "valley") {
    if (edge.adjacentPlanes.length !== 2) {
      return review("Hip/valley requires two verified adjacent roof planes.");
    }
    const planes = edge.adjacentPlanes;
    const dz = planes.map((plane) => planeElevationDelta(edge.start, edge.end, plane));
    if (Math.abs(dz[0] - dz[1]) > agreementToleranceFt) {
      return review("Adjacent planes imply inconsistent elevation change along the edge; check pitch, azimuth, and endpoints.");
    }
    const lengths = planes.map((plane) => planeLength3d(edge.start, edge.end, plane));
    const length3dFt = (lengths[0] + lengths[1]) / 2;
    return {
      status: "measured",
      kind: edge.kind,
      planLengthFt,
      length3dFt,
      correctionFactor: length3dFt / planLengthFt,
      reason: "3D edge length reconciled from both adjacent roof planes.",
    };
  }

  return review("Unsupported edge classification.");
}

function uniqueBestEvidence(evidence: Evidence[]): Evidence[] {
  const byGroup = new Map<string, Evidence>();
  for (const item of evidence) {
    if (!Number.isFinite(item.quality) || item.quality < 0 || item.quality > 1) {
      throw new RangeError(`Evidence quality must be in [0, 1]: ${item.id}`);
    }
    const previous = byGroup.get(item.independenceGroupId);
    if (!previous || item.quality > previous.quality) byGroup.set(item.independenceGroupId, item);
  }
  return [...byGroup.values()];
}

/**
 * Evidence-strength score for one component. It is not a probability.
 * Same-image syndication is deduplicated by independenceGroupId. A high score
 * alone never releases a measurement; human approval is a separate gate.
 */
export function reviewFinding(input: FindingReview): ReviewResult {
  if (!Number.isFinite(input.coverage) || input.coverage < 0 || input.coverage > 1) {
    throw new RangeError("coverage must be in [0, 1]");
  }
  const evidence = uniqueBestEvidence(input.evidence);
  const groups = evidence.map((item) => item.independenceGroupId);
  const reasons: string[] = [];
  const missProduct = evidence.reduce((product, item) => product * (1 - item.quality), 1);
  let confidence = Math.round((1 - missProduct) * input.coverage * 100);

  if (groups.length < 2) {
    confidence = Math.min(confidence, 69);
    reasons.push("Fewer than two independent evidence groups.");
  }
  if (input.findingClass !== "confirmed") {
    confidence = Math.min(confidence, 49);
    reasons.push("Feature remains candidate or unknown.");
  }
  if (input.coverage < 1) {
    confidence = Math.min(confidence, 64);
    reasons.push("Roof/elevation coverage is incomplete.");
  }
  if (!input.agreesWithinTolerance) {
    confidence = Math.min(confidence, 49);
    reasons.push("Sources disagree or have not been reconciled within tolerance.");
  }

  const band: ReviewResult["band"] = confidence >= 85 ? "high" : confidence >= 60 ? "medium" : "low";
  let disposition: ReviewResult["disposition"];
  if (band === "high" && reasons.length === 0) disposition = "auto_verified";
  else if (evidence.length > 0 && input.coverage > 0) disposition = "needs_review";
  else disposition = "needs_field_capture";
  if (reasons.length === 0) reasons.push("Evidence and geometry gates passed; human release approval is still required.");

  return {
    confidence,
    band,
    disposition,
    independentSourceGroups: groups,
    releaseAllowed: false,
    reasons,
  };
}

/**
 * Assemble a report using EagleView's public report categories while retaining
 * this engine's stricter evidence gates. Only geometrically valid items that
 * also pass evidence review contribute to confirmed totals. No roof imagery is
 * interpreted here: providers or human reviewers must supply the geometry.
 */
export function buildRoofReport(input: RoofReportInput): RoofReport {
  const facets = input.facets.map((facet) => {
    assertFinitePositive(facet.planAreaSqFt, `facet ${facet.id} planAreaSqFt`);
    const surfaceAreaSqFt = roofSurfaceAreaSqFt(facet.planAreaSqFt, facet.pitchRiseRun);
    return {
      id: facet.id,
      pitchRiseRun: facet.pitchRiseRun,
      planAreaSqFt: facet.planAreaSqFt,
      surfaceAreaSqFt,
      squares: surfaceAreaSqFt / 100,
      review: reviewFinding(facet.review),
    };
  });

  const confirmedFacets = facets.filter((facet) => facet.review.disposition === "auto_verified");
  const candidateFacets = facets.filter((facet) => facet.review.disposition !== "auto_verified");
  const pitchMap = new Map<number, { pitchRiseRun: number; facetCount: number; surfaceAreaSqFt: number }>();
  for (const facet of facets) {
    const bucket = pitchMap.get(facet.pitchRiseRun) ?? {
      pitchRiseRun: facet.pitchRiseRun,
      facetCount: 0,
      surfaceAreaSqFt: 0,
    };
    bucket.facetCount += 1;
    bucket.surfaceAreaSqFt += facet.surfaceAreaSqFt;
    pitchMap.set(facet.pitchRiseRun, bucket);
  }

  const edges = input.edges.map((edge) => ({
    geometry: measureEdge(edge),
    review: reviewFinding(edge.review),
  }));
  const edgeKinds = ["eave", "rake", "ridge", "hip", "valley"] as const;
  const edgeTotalsFt: RoofReport["edgeTotalsFt"] = {
    eave: 0, rake: 0, ridge: 0, hip: 0, valley: 0,
  };
  for (const { geometry, review } of edges) {
    if (edgeKinds.includes(geometry.kind as (typeof edgeKinds)[number]) &&
        geometry.status === "measured" && review.disposition === "auto_verified") {
      edgeTotalsFt[geometry.kind as (typeof edgeKinds)[number]] += geometry.length3dFt ?? 0;
    }
  }

  const accessoryKinds: ReportAccessoryKind[] = [
    "skylight", "chimney", "plumbing_vent", "exhaust_vent", "ridge_vent",
    "cricket", "saddle", "dead_valley", "roof_wall_flashing", "flat_section", "other",
  ];
  const accessories = (input.accessories ?? []).map((item) => ({
    id: item.id,
    kind: item.kind,
    review: reviewFinding(item.review),
  }));
  const accessoryCounts = Object.fromEntries(accessoryKinds.map((kind) => [
    kind,
    accessories.filter((item) => item.kind === kind && item.review.disposition === "auto_verified").length,
  ])) as RoofReport["accessoryCounts"];

  return {
    reportConvention: "eagleview_style_public_measurement_categories",
    facetCount: facets.length,
    facets,
    confirmedSurfaceAreaSqFt: confirmedFacets.reduce((sum, facet) => sum + facet.surfaceAreaSqFt, 0),
    candidateSurfaceAreaSqFt: candidateFacets.reduce((sum, facet) => sum + facet.surfaceAreaSqFt, 0),
    confirmedSquares: confirmedFacets.reduce((sum, facet) => sum + facet.squares, 0),
    pitchDistribution: [...pitchMap.values()].sort((a, b) => a.pitchRiseRun - b.pitchRiseRun),
    edges,
    edgeTotalsFt,
    dripEdgeTotalFt: edgeTotalsFt.eave + edgeTotalsFt.rake,
    ridgeHipTotalFt: edgeTotalsFt.ridge + edgeTotalsFt.hip,
    accessories,
    accessoryCounts,
    releaseAllowed: false,
  };
}
