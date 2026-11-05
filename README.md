# Central Homes AI Engine

JobNimbus remains the system of record. This repository contains background integration foundations and an export-based business analysis toolkit, not a replacement CRM. The repository is currently public: never commit customer exports, financial records or credentials.

## Growth bots

Open `growth-bots.html` to analyze imported JSON/CSV exports locally, or run `npm run bots -- private/input.json reports/findings.json`. Four bots prioritize follow-up drafts, compare marketing economics, flag low-contribution jobs and project overhead savings. Run `npm test` to verify calculations. No dependencies are required.

See [growth bot input and operating guide](docs/GROWTH_BOTS.md). JobNimbus is not connected; there is no unattended execution or outbound messaging in this release.

## Phase 1: read-only integration
- Find a JobNimbus job by address.
- Retrieve attached roof reports where the account's API permissions allow.
- Compare roof measurements with independently verified source data.
- Prepare permit drafts for human review; never submit automatically.

## Security
Never commit credentials. Configure `JOBNIMBUS_API_KEY` in Vercel server environment variables only. Rotate any key exposed in chat. API access is read-only until a separately reviewed write integration is approved.

## First test property
4060 Bermuda Grove Place, Longwood, FL 32779.

See `docs/ACCEPTANCE_TEST.md` for evidence and pass/fail criteria.
