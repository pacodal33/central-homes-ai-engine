# Growth bots: export-first release

Four working analysis routines share a browser dashboard and Node command runner. This release does not connect to JobNimbus, send messages, write records, schedule runs or change advertising. JobNimbus remains the canonical customer record. Import a fresh export and reconcile the findings before acting.

## Run

Use Node 20 or later. No dependencies or paid services are required.

```sh
npm test
npm run bots -- private/input.json reports/findings.json
```

For the browser, open `growth-bots.html` from the repository folder (keep `lib/growth-bots.cjs` beside it in its subfolder), or serve the repository on localhost. Nothing is uploaded or stored automatically. Downloads contain customer information; keep them private. The input template and demo use fictional data.

## Inputs

Start with `examples/growth-input.json`. The dashboard also accepts separate jobs, marketing and savings CSVs; download exact headers there. All dates are YYYY-MM-DD; currency values are plain numbers; rates are decimals (0.06 = 6%). Missing cost fields mean unknown, not zero. Invalid rows appear under data issues; results based on partial input are not complete totals.

### Jobs

`id` is a stable JobNimbus/export job identifier; `customerName`, `email`, `phone`, `owner`, `source` and `lostReason` retain export values. Map the original CRM status explicitly to one of:

- `estimate_sent`, `follow_up`, `on_hold`: eligible for recovery after 7 days and before 731 days, absent contact in the last 7 days.
- All other values: ineligible. Use `won`, `signed`, `closed_lost` or another original status for excluded records. A signed production job must never be mapped to an open estimate.

`estimateDate` and optional `lastContactDate` control aging. `doNotContact` accepts true/yes/1 as opt-out. Recovery excludes opt-outs and rows with no contact detail. It does not establish permission to contact; verify preferences in the current CRM.

`estimateAmount`, `directCosts`, `commissions`, `marketingCost` power margin checks. Direct costs must exclude commission and marketing to avoid double subtraction. Use the same estimate/actual basis across each job. Deduplicate exports by stable job ID before importing. Do not use these flags to alter signed contracts.

### Marketing

One row per `period` (YYYY-MM) and `source`. Never include both a channel total and its component rows. Use `jobType` reroof/repair only when the whole row has a defensible spend allocation; otherwise use blended. Fields: `spend` (advertising and agency fees, excluding commission), `leads`, `soldJobs`, `revenue`, optional `directCosts`, `commissions`, and descriptive `basis`.

Use lead-month cohorts with spending for those leads and sales-to-date from those same leads. Note the reporting date. Calendar-month sales divided into calendar-month spend are a different measure and must be labeled. This release does not infer attribution or campaign spend from CRM records. Zero sold jobs produce unknown CAC. Missing costs produce unknown profitability. Positive contribution is before fixed overhead; it is not net profit. No recommended dollar budget changes are inferred from this alone.

### Financial settings and savings

Settings: `currentRevenue`, `currentNetRate`, `variableCostRate`, `projectedRevenue`, `targetNetRate`, `targetContributionRate`. Baseline overhead is inferred from current revenue minus variable costs minus current net profit. Variable costs must include all costs that will decline with revenue (including commission if applicable). Reconcile this assumption with the P&L. Job contribution target is after commissions and marketing, so it can differ from the gross margin percentage.

Savings: unique `id`, `description`, `annualAmount`, `effectiveDate`, and `status` planned/implemented. Projection subtracts each valid planned or implemented saving once, at full annual run rate. A later effective date does not reduce that run-rate projection. Implemented-year savings are prorated over the effective calendar year, not verified against expenses. This is not a cash-flow forecast. The gap to target includes the planned cuts already, so do not add them again.

## Connecting later

The export contract is the adapter boundary. Before enabling live reads: establish a secure server-side read-only JobNimbus credential, verify the account's actual fields/statuses and pagination, map them explicitly to this schema, preserve job IDs/source dates and opt-outs, authenticate all private analysis endpoints, and store runs in private durable storage. Verify authorization and late-sale updates with real account data. Do not expose a JSON export through public static hosting. No live-connector code or scheduled cloud worker is claimed by this release.
