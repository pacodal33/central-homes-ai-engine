# Claude Code Build Prompt: Central Homes Roof Measurement System

You are the senior engineering team implementing Central Homes Roofing & Solar's roof measurement system. Build on the existing repository and the current roof-measurement-core prototype. Do not replace working project code with a greenfield demo. Begin by auditing the repository, its branches, tests, deployment configuration, database schema, JobNimbus integration, provider credentials, and existing measurement endpoints. Write a short implementation plan tied to real files, then implement the first complete vertical slice and test it.

## Product objective

From a new JobNimbus lead with a complete address, automatically resolve the property and parcel, research permitted sources, construct one auditable roof model, and stage a Roofr/EagleView-style measurement dossier for estimator review. Target an initial result within five minutes when accessible source data allows it. Report actual elapsed time and missing-source reasons; never meet the target by inventing geometry or skipping review gates.

Phase one is single-family reroofs in Seminole, Orange, and Volusia counties in Florida. The measurement flow must resolve the property, parcel, jurisdiction, and structure identity before producing quantities. Estimate Pre-Check and Permit Pre-Check remain separate jobs and statuses, with a Run Both option. Their evidence can share the verified property record, but their results remain distinct in the JobNimbus dossier.

## Binding business and safety rules

1. JobNimbus remains the canonical source of truth for leads, property identity, evidence, measurement results, estimate drafts, statuses, and human review tasks. Use existing integrations and employee workflows; do not create a shadow CRM.
2. Research starts automatically when the secretary creates a complete-address lead. Source discovery and measurement may run asynchronously and concurrently with permit research. AI may prepare drafts, attach evidence, and create review tasks. It must not release a customer quote, place a material order, file a permit, schedule production, or otherwise take a consequential action without the existing human approval gate.
3. Use free and public sources first. Use paid Nearmap/EagleView or other paid sources only through configured, authorized providers and when benchmark evidence justifies the cost. Do not assume API access, credentials, or licenses exist; inspect configuration and fail clearly when a provider is unavailable.
4. Do not scrape realtor/listing websites. Do not bypass login, rate limits, paywalls, robots rules, terms, or source licensing. Listing photos may enter through a permitted manual upload or authorized feed with URL/date/provenance. Zillow, Realtor, MLS, or syndication copies from one photo set count as one evidence group, not multiple confirmations.
5. Google Maps, Google Earth, and Street View imagery may be shown for human visual review only. Do not run machine vision, pixel measurement, download/caching, or automated feature extraction over imagery whose terms do not permit it. Google Solar structured API outputs may be processed within their license, with source date, coverage, and segment-level limitations recorded. Keep providers behind replaceable adapters so a permitted imagery source can be substituted without rewriting the core.
6. Discover approximately 15–20 candidate public/authorized aerial, parcel, orthophoto, LiDAR, and imagery source endpoints per property when practical. Record queried, accessible, unavailable, stale, blocked, and duplicate sources. This is a source-discovery inventory, not a requirement to invent 20 measurements or to count derivative copies as independent evidence. Use multiple views to improve outline coverage and resolve conflicts; do not use a blind majority vote. Maintain one reconciled roof model.
7. Every material number and feature must have per-item provenance: provider/source URL or ID, source family, capture/acquisition date if known, retrieval time, license/access basis, independence group, quality, coverage, geometry method/version, reviewer, and unresolved conflicts. Preserve an audit trail of revisions.
8. Confidence is an explainable evidence-strength score, not a statistical probability. Give each facet, edge, and accessory an independent confidence and status: confirmed, candidate, unknown, needs review, or needs field capture. Display the requested horizontal red-yellow-green confidence bar under each component. A high score cannot bypass geometry checks or human approval.
9. Never fabricate a length, pitch, count, or image source. If endpoints, coverage, roof-plane class, pitch, parcel match, or source independence are unresolved, report a candidate/range or “not measured,” explain why, and create a precise review question/task.

## Measurement definitions and calculations

Use a local projected coordinate reference system in feet for geometry, with explicit CRS metadata and transforms. Validate topology, units, polygon self-intersections, edge endpoints, elevation references, and geometry tolerances. Store source geometries and normalized model geometries separately.

### Roof planes and area

- Model every roof facet separately. Include attached garages, porches, covered areas, dormers, and 16–24 inch overhangs when supported by evidence; record observed overhang dimensions instead of assuming them. Living-area square footage is not the roof footprint.
- Store projected plan polygon, pitch/rise-run, downslope azimuth, surface area, source, and confidence per facet. Keep flat/low-slope sections distinct.
- Convert pitch angle to rise/run as `tan(degrees × π / 180)`. Pitch factor is `sqrt(1 + (rise/run)^2)`. Sloped surface area = projected plan area × pitch factor. Roofing squares = surface square feet / 100.
- Do not combine different pitches before area adjustment. Do not add waste to measured roof area. Calculate waste/material ordering as a separate estimator layer with its own assumptions.
- Ingest Google Solar segment statistics where available, including pitch/angle, azimuth, area, ground area, imagery/model date, and coverage limits. Treat Solar as an evidence source, not a complete edge-classification report; it does not establish hip/valley lengths by itself.

### Edges

Represent the roof as a graph: facets are faces; eaves, rakes, ridges, hips, valleys, roof-wall boundaries, step flashing, and other edges are typed lines with endpoints and adjacent facets.

- Eave: lower, level roof edge. Keep eave length in horizontal plan length; do not apply a roof-pitch factor.
- Ridge: upper, level intersection of roof planes. Keep ridge length in horizontal plan length; do not apply a roof-pitch factor.
- Rake: sloped gable-end boundary. Compute true line length from the adjacent plane's pitch and edge direction; do not blindly multiply every edge by the same pitch factor.
- Valley: inward/concave intersection where roof planes meet. Hip: outward/convex intersection. Use topology/plane adjacency and image evidence; never classify solely by a line's appearance in one occluded aerial.
- Hips and valleys require two adjacent verified plane definitions and consistent 3D intersection elevation. Reconcile both adjacent-plane solutions. If they disagree beyond configured tolerance or endpoints are uncertain, leave the true length unconfirmed and request review.
- Roof-wall/step flashing and other sloped lines require their own geometric method and explicit definition. Do not silently include them in eave/rake totals.
- Report eaves, rakes, ridges, hips, and valleys separately, with edge-by-edge labels on the roof diagram. Provide a material “drip edge” subtotal as eaves + rakes only when that product convention is selected; preserve the component subtotals and state whether rake lengths are slope lengths. User default: trace the outside perimeter across every attached roof section, including porch and garage roofs.
- Never apply a pitch factor to eaves or ridges. Apply slope only where true 3D geometry calls for it, including rakes, hips, and valleys.

### Accessories and special conditions

Inspect and inventory each separately: skylights, chimneys, plumbing boots/vents, exhaust vents, goosenecks, ridge vents, satellites, crickets/saddles, dead valleys, roof-wall transitions, flashing, flat/low-slope areas, drains, and other penetrations or obstacles. Store count, geometry/dimensions when supported, associated roof facet, photo/evidence references, confidence, and visibility/occlusion. Do not infer a hidden cricket, dead valley, or accessory count from an insufficient aerial.

## Source and processing architecture

Fit these responsibilities into existing repo conventions; do not introduce duplicate services unnecessarily:

1. **Lead/event intake:** validate address; create/reuse a verified property record; preserve JobNimbus IDs; enqueue an idempotent measurement run.
2. **Property and parcel resolver:** geocode, parcel/jurisdiction lookup, address normalization, structure match, and ambiguity resolution. Return candidates when multiple buildings or parcels match.
3. **Source registry/adapters:** capability, query rules, license/access policy, attribution, rate limits, date, expected coverage, and independent-evidence grouping. Use sources available in this project: county appraiser/GIS and orthophotos, local GIS, public LiDAR/USGS 3DEP, NAIP/other authorized orthophotos, public parcel data, authorized owner/inspection/drone/phone/JobNimbus photos, Google Solar structured data, and permitted open imagery/services. Discover other valid municipal/state/federal sources dynamically through documented indexes/APIs. A source being discoverable does not mean its imagery can be automatically measured.
4. **Evidence normalization:** normalize metadata/CRS; detect exact or near duplicate acquisitions and syndicated photo sets using permitted metadata/content hashes; map copies to the same independence group; preserve originals and transformations; flag stale or mismatched property imagery.
5. **Image and 3D worker:** separate container/worker for permitted photogrammetry/LiDAR and compute-heavy geometry. Keep Google visual-only imagery out of automated processing. Prefer geometric/elevation inputs with documented rights. Expose versioned, reproducible results and bounded resource use.
6. **Roof model and geometry engine:** one source-independent core with facets, adjacency, edges, accessories, dimensions, confidence, and evidence links. Use PostGIS for geospatial storage where already configured. Use deterministic geometry functions; isolate ML/CV inference behind replaceable interfaces, with confidence calibration, model version, and human correction feedback.
7. **Reconciliation and review:** detect model/source conflicts; compare total facet area and pitch distribution to independent structured sources such as Solar or an authorized report; report percent difference and likely causes. Do not scale one source to force agreement without a documented calibration method. Create targeted questions for uncertain edge type, endpoints, scope, hidden accessories, or overhangs.
8. **Report and JobNimbus dossier:** produce a Roofr/EagleView-style PDF/web report: top-down annotated roof diagram; facet labels; pitch and area by plane; area/squares; eave/rake/ridge/hip/valley lengths; flashing and accessory inventory; source table; date; per-component confidence bars; confirmed vs candidate totals; disagreements; omissions; and estimator sign-off. Write draft results/evidence/tasks through the existing JobNimbus adapter. Make write operations idempotent and auditable.
9. **UI:** show source coverage/status and contribution, an overlay of one reconciled roof outline with editable vertices/edge classes, per-facet pitch/area, per-item confidence bar, review queue, and keyboard/mouse drawing tools. A human may correct a candidate; preserve before/after geometry, author, and reason. Keep source licensing/access restrictions visible to administrators, not noisy in homeowner-facing flow.

Use the established stack: existing GitHub/Vercel application, Supabase/PostgreSQL/PostGIS, JobNimbus, Google Drive/Maps Platform, and separate container/GPU worker where appropriate. Store secrets only in the current secret manager/environment configuration, never in source, logs, fixtures, prompt files, or reports. Use provider interfaces and typed schemas. Reuse auth, deployment, and database conventions already in the repository.

## Bermuda acceptance fixture

Use 4060 Bermuda Grove Place, Longwood, FL 32779 as the first dry-run property. Preserve the known state as a test fixture rather than promoting it to verified values:

- Solar-based area estimate was about 74.1 squares after a prior scaling comparison; manual boundary estimate about 76.1 squares was conditional and may have included pool/deck. Neither is a confirmed takeoff.
- Solar segments were mostly approximately 6.8:12–8.4:12 with one around 4.8:12; a working front-gable pitch near 7:12 is provisional.
- Two screen-ruler plan-view candidates at a complex junction are 16.1 ft and 7.71 ft. Their hip/valley classes, overlap, and true 3D lengths are unresolved; exclude them from confirmed totals.
- Tree cover and shadows obscure portions of public county aerials. Do not promote incomplete perimeter tracing to a confirmed eave/drip-edge total.
- A 2024 roofing permit record exists; it is contextual provenance, not proof of current roof geometry or edge lengths.

Build a Bermuda report that exposes these facts as candidate/conditional values with appropriate confidence and a concise “what is needed to confirm” list. Do not repeat earlier invalid perimeter traces as measurements.

## Delivery workflow

1. Inspect repository status, current branch, remotes, privacy/visibility, existing project instructions (`AGENTS.md`, README, architecture docs), CI, migrations, environment schema, and open work. Do not expose secrets or print credential values.
2. The user has authorized commits to the existing public `pacodal33/central-homes-ai-engine` repository for this measurement work. Use a named feature branch and keep the change reviewable. Do not change repository visibility or push to `main` unless the user separately directs it.
3. Follow the repo's build, lint, test, typecheck, migration, and preview workflows. Do not deploy to production. Avoid destructive migrations. If a provider credential or external account is missing, build a mock/contract test and clearly list what remains blocked.
4. Implement a vertical slice: property identity → source registry/provenance → geometry/report → evidence-gated review task → idempotent draft to JobNimbus. The first slice may use fixtures/mocks for providers but must keep the real adapter contracts and failure cases.
5. Add meaningful tests for geometry and workflow invariants, not implementation snapshots. Cover: coordinate transforms/units; simple/complex roof polygons; each edge class; inward valley vs outward hip classification; adjacent-plane consistency; eave/ridge no pitch factor; rake direction-specific correction; pitch area; overlaps/duplicate sources; stale imagery; 1 vs 2 independent groups; occlusion; source disagreement; unavailable providers; retries/idempotency; user corrections/audit log; no fabricated confirmed totals; and no consequential release.
6. Add a Bermuda regression fixture. Record benchmark results for 25 existing Central Homes jobs, then expand toward 100. Report accuracy by component against authorized EagleView/field benchmarks: area, pitch, each edge class, and accessories; report sample size, median/90th-percentile absolute and relative error, coverage, and missingness. Do not claim accuracy from synthetic speed tests.
7. Finish with changed files, architecture decisions, migration/provider requirements, test output, known limitations, confidence results, local commit hash, and the exact human actions needed to enable any blocked integration. Do not say the system is production-ready until real authorized benchmarks pass.

## Acceptance criteria

- One reconciled, editable roof model; no source-voting duplicates.
- Every displayed quantity has geometry, provenance, date, independent-group lineage, confidence, and status.
- Eaves/ridges have no pitch factor; rakes, hips, and valleys use direction/adjacent-plane 3D geometry.
- Candidate/unknown lengths never enter confirmed subtotals.
- EagleView-style public categories and per-edge diagram are rendered, with eaves/rakes separate and drip-edge subtotal explicit.
- Accessories and hidden/uncertain conditions are inventory items with independent review state.
- Unavailable/licensed/blocked sources are reported truthfully; no scraping or prohibited image analysis.
- JobNimbus retains the canonical lead/dossier; estimate and permit statuses remain separate; writebacks are drafts only; human approvals gate every consequential step.
- Tests, typecheck, lint, and the agreed benchmark gate pass; no production deployment occurs as part of this task.
