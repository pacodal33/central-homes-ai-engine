# Central Homes Roof Measurement Core - first vertical slice

This is a local, provider-neutral measurement core. It calculates plane surface area and 3D edge length from supplied geometry, builds an EagleView-style public-category report, keeps evidence provenance, and applies conservative review gates. It does not detect roof edges in imagery or write measurements to JobNimbus.

## Measurement rules

- Measure the plan polygon of each roof plane independently, then calculate sloped surface area with that plane's pitch.
- Eaves and ridges retain their horizontal plan length. Rakes use the adjacent plane's pitch and edge direction. Hips and valleys require two adjacent plane definitions that yield a consistent 3D intersection length.
- A line without a verified class, adjacent planes, or endpoints remains a candidate with no 3D length.
- Evidence from Zillow and Realtor that comes from the same MLS photo set shares one independence group.
- Google Maps imagery supports human review only. The app must not scrape listing sites or run machine image analysis on Google Maps/Earth/Street View imagery. Automated geometry inputs must come from permitted structured outputs or licensed/owner-provided sources.
- Report structure follows EagleView's public categories: roof facets/area/pitch, eaves, rakes, ridges, hips, valleys, and accessories. Eaves and rakes remain separate; optional drip-edge material total is their sum. Only items with valid geometry and a passing independent-evidence review contribute to confirmed totals. Candidate quantities remain visible separately.
- Confidence is an evidence-strength score, not a probability. Every facet, edge, and accessory keeps its own review and evidence; no image agreement can override invalid geometry.
- JobNimbus remains the source of truth. This core never releases measurements, submits permits, sends quotes, or orders materials. It returns a review disposition for the JobNimbus dossier.

## Bermuda stress-test fixture

The 2021 Google Solar result predates the February 23, 2024 residential roofing permit listed by Realtor.com. The 2025 county aerial is the newer geometry view. County screen-ruler passes produced two plan-view candidates (16.1 ft and 7.71 ft) at a complex intersection. Their hip/valley classes and 3D lengths are unresolved; they are explicitly excluded from confirmed totals.

## Run tests

```sh
npm test
npm run stress
```

The current `buildRoofReport` implementation is report assembly and geometry only. Provider discovery, imagery licensing checks, roof-edge detection, mapping, and JobNimbus integration remain to be built in the production repository.

Confidence values are evidence-strength indicators, not statistical probabilities. Auto-verification still does not authorize release; a separate human approval is required.

## Latest stress-test result

The local geometry/evidence core processed 25,000 synthetic roofs (75,000 area, edge, and evidence operations) in 32.45 ms in this run, or about 2.31 million operations per second. This measures only arithmetic and evidence gating. It excludes source retrieval, image interpretation, georeferencing, geometry authoring, and human review, which dominate a real property takeoff.

The Bermuda recheck still has two county-aerial screen-ruler candidates (16.1 ft and 7.71 ft plan view) at one complex junction. Their classifications and true 3D lengths remain unresolved, so neither is counted as a confirmed hip or valley. The older listing photo confirms the front gable form but provides no current scale or independently verified pitch. No new rake, ridge, eave, hip, valley, accessory, or opening length was promoted to confirmed in this pass.
