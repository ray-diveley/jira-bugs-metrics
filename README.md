# Jira Bug Metrics Tracker

Collects Jira issue metrics:
- Open duration (created -> now or resolution)
- Time to resolution (created -> resolution date)
- Time from first assignment to first assignee comment

Generates per-run JSON and a CSV summary (`data/latest-summary.csv`). Supports dry-run with sample data, auto-building JQL, and GitHub Action scheduling.

## Setup

1. Clone repo and install dependencies:
```powershell
npm install
```
2. Copy `.env.example` to `.env` and fill values.
3. Obtain Jira API token (Atlassian account > Security > Create API token).

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `JIRA_BASE_URL` | Base cloud URL (e.g. https://your-domain.atlassian.net) |
| `JIRA_EMAIL` | Email tied to API token |
| `JIRA_API_TOKEN` | API token (keep secret, never commit) |
| `JIRA_JQL` | (Optional) Explicit JQL. If set, overrides auto-builder. |
| `JIRA_PROJECT_KEY` | Project key for auto-builder |
| `JIRA_ISSUE_TYPES` | (Optional) Comma list of issue types to include. Leave empty for all types. |
| `JIRA_STATUS_NAMES` | (Optional) Comma list of statuses to include. Leave empty for all statuses. |
| `JIRA_START_DATE` / `JIRA_END_DATE` | Optional created date bounds (YYYY-MM-DD) |
| `JIRA_MAX_ISSUES` | Limit number of issues (blank = all) |
| `JIRA_DRY_RUN` | `true` to use sample data (no API) |
| `LOG_LEVEL` | `info` or `debug` for verbose logging |
| `TZ` | Timezone for timestamps |

Auto-builder composes JQL: `project = <PROJECT_KEY> AND issuetype in (...) AND status in (...) AND created >= ... AND created <= ... ORDER BY created DESC`.

## Running Locally

Dry run (sample data):
```powershell
npm start
```
Live run (after setting credentials, set `JIRA_DRY_RUN=false`):
```powershell
npm start
```
Outputs appear under `data/`.

## Security Notes
- `.env` is gitignored; do not remove it from `.gitignore`.
- Use GitHub Actions secrets for all sensitive values; never commit real tokens.

## GitHub Actions
Workflow file: `.github/workflows/jira-metrics.yml` runs daily at 02:00 UTC. It:
1. Injects secrets into `.env`.
2. Executes the metrics script.
3. Uploads JSON, CSV, and the runtime `.env` as artifact (optional; remove `.env` from artifact section if you prefer not to include it).

### Required Secrets
Configure in repository settings > Secrets and variables > Actions:
- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_JQL` (optional if using auto-builder)
- `JIRA_PROJECT_KEY`
- `JIRA_ISSUE_TYPES`
- `JIRA_STATUS_NAMES`
- `JIRA_START_DATE`
- `JIRA_END_DATE`

You may omit some (leave blank) if not needed.

## Troubleshooting
- 410 errors: Some Service Management projects restrict the standard search endpoint. Fallback logic attempts a simplified Service Desk request search; if still failing, consider narrowing JQL or using Jira Service Management APIs with appropriate scope.
- Add `LOG_LEVEL=debug` for more detail.

## Future Enhancements
- Improved Jira Service Desk API integration for richer data.
- Additional metrics (e.g., time in each status, number of comments before resolution).
- Optional push of summary metrics to external dashboards.

## License
Internal use (add appropriate license text if needed).
