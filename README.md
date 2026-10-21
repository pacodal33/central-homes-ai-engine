# Central Homes AI Engine

JobNimbus remains the system of record. This private repository is for background roof measurement and permit-preparation automation, not a replacement CRM.

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
