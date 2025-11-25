# Jira Bug Metrics - AI Agent Instructions

## Project Overview

This is a **Jira SLA metrics tracker** with dashboard visualizations for engineering managers. It fetches Jira bugs via REST API, calculates SLA compliance metrics (4-hour response time goal), and displays results through an interactive HTML dashboard served by a Node.js HTTP server.

**Key components:**
- Metrics collection (`src/index.js`) → Jira API → JSON snapshots
- KPI calculation (`src/kpi.js`) → SLA compliance rates & manager performance
- Dashboard server (`server.js`) → Static files + REST API endpoints
- Reporting CLI (`generate-report.js`) → Executive summaries & trend analysis

## Architecture & Data Flow

```
.env config → jiraClient.js (fetch issues) → metrics.js (compute times) → kpi.js (SLA compliance) 
                                           ↓
                    data/metrics-{timestamp}.json (snapshot)
                    data/kpi-history.json (historical tracking)
                    data/latest-summary.csv (export)
                                           ↓
                    server.js (port 3000) → dashboard/*.html (charts & tables)
```

**Critical detail**: The system tracks TWO response pathways:
1. **On-call manager** response (via `whoWasOnCall` from Opsgenie + `timeToFirstOnCallActionMinutes`)
2. **Assignee** response (via `timeToFirstAssigneeCommentMinutes` after assignment)

Both are independently measured for SLA compliance. See `src/kpi.js:73-141` for the dual-tracking logic.

## Key Conventions & Patterns

### Environment Configuration

All credentials/config in `.env` (NEVER commit `.env` - it's gitignored). Configuration loaded via `src/loadEnv.js` which wraps `dotenv`. Required variables:

```
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=user@domain.com
JIRA_API_TOKEN=<secret>
JIRA_PROJECT_KEY=PROJECTKEY
JIRA_ISSUE_TYPES=Bug
JIRA_STATUS_NAMES=To Do, In Progress, Done
JIRA_START_DATE=2025-10-31
JIRA_END_DATE=2025-11-24
```

Optional Opsgenie integration:
```
OPSGENIE_API_KEY=<secret>
OPSGENIE_SCHEDULE_NAME=Engineering Triage
```

### Jira API Handling

**Fallback strategy** for 410 errors (Service Management projects):
1. Try standard `/rest/api/3/search` with changelog expansion
2. Retry POST without changelog if 410 persists
3. Fall back to `/rest/servicedeskapi/request` endpoint
4. Fall back to `/rest/api/3/issue/picker` + individual issue fetches

See `src/jiraClient.js:54-89` for retry logic. Always use `LOG_LEVEL=debug` to troubleshoot API issues.

### Metric Calculation Rules

**Date filtering** (`src/index.js:25-46`): Tickets included if *either*:
- Created in date range, OR
- First assigned in date range

**On-call manager list** (hardcoded in `src/metrics.js:4-12` and `src/kpi.js:6-14`):
```javascript
const ON_CALL_MANAGERS = [
  'Brad Goldberg', 'Jeff Maciorowski', 'Akshay Vijay Takkar',
  'Grigoriy Semenenko', 'Randy Dahl', 'Evgeniy Suhov', 'Max Kuklin'
];
```
**IMPORTANT**: Update both files if manager list changes.

**SLA extraction** (`src/metrics.js:107-142`): Searches all custom fields for SLA data structures. Jira SLA fields are dynamic (`customfield_*`), so code iterates all fields looking for `completedCycles` or `ongoingCycle` properties.

### Historical Tracking

KPI snapshots saved to `data/kpi-history.json` with deduplication by period:
- Max 50 snapshots retained (rolling window)
- Prevents duplicate entries for same date range
- See `src/kpiHistory.js:33-65`

## Developer Workflows

### Running Locally

```powershell
# Install dependencies (first time)
npm install

# Dry run with sample data (no API calls)
npm start  # Uses JIRA_DRY_RUN=true by default

# Live collection (requires .env with credentials)
# Set JIRA_DRY_RUN=false in .env first
npm start

# Start dashboard server (port 3000)
npm run dashboard
# Then open http://localhost:3000
```

### Generating Reports

```powershell
# Executive summary (console output)
npm run report

# Save summary to reports/ directory
npm run report:save

# CSV export for spreadsheets
npm run report:csv

# Quarterly trends (requires 2+ collections)
npm run report:quarterly
```

### Dashboard Development

Dashboard is **pure client-side HTML/JS** (no build step). Files in `dashboard/`:
- `index.html` - Main metrics view with issue details
- `kpi.html` - SLA compliance cards & manager rankings
- `trends.html` - Quarterly comparisons & historical charts
- `timeline.html` - Historical compliance timeline

**API endpoints** provided by `server.js`:
- `GET /api/latest-metrics` - Most recent collection
- `GET /api/kpi-history` - All snapshots for trends
- `GET /api/metrics-files` - List all timestamped files
- `POST /api/run-metrics` - Trigger new collection from UI

**Pattern**: Dashboard uses `fetch()` to load JSON, then vanilla JS DOM manipulation for rendering. No frameworks.

## Testing & Debugging

### Debug Mode
```powershell
# Add to .env
LOG_LEVEL=debug
```
Prints: JQL queries, API responses, fallback attempts, on-call lookups.

### Sample Data
`data/sample_issues.json` used when `JIRA_DRY_RUN=true`. Structure mirrors Jira API v3 response with `changelog` expansion.

### Common Issues

**410 errors**: Service Management projects restrict `/search`. Fallback logic in `jiraClient.js:67-89` handles this but may return limited fields.

**Missing SLA data**: Check custom field names with `LOG_LEVEL=debug`. SLA fields vary by Jira configuration.

**On-call lookup failures**: Opsgenie schedule must exist. Returns `[Before Oct 31]`, `[Weekend]`, `[After Hours]`, or `[No Coverage]` for gaps. See `src/opsgenieClient.js:52-74`.

## GitHub Actions

Workflow: `.github/workflows/jira-metrics.yml`
- Runs daily at 02:00 UTC
- Secrets → `.env` file creation
- Uploads `data/*.json` and `latest-summary.csv` as artifacts
- Continues artifact upload even if script exits with error

**Required secrets** in repo settings:
`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_ISSUE_TYPES`, `JIRA_STATUS_NAMES`, `JIRA_START_DATE`, `JIRA_END_DATE`

## File Organization

```
src/
  index.js          - Main entry point, orchestrates collection
  jiraClient.js     - Jira REST API wrapper with fallback logic
  metrics.js        - Compute response times from changelog
  kpi.js            - SLA compliance calculation (dual on-call/assignee)
  kpiHistory.js     - Historical snapshot storage
  opsgenieClient.js - On-call schedule lookup (optional)
  reporting.js      - Report generation (text/CSV/quarterly)
  loadEnv.js        - Environment variable loader

dashboard/
  *.html            - Client-side dashboards (no build)

data/
  metrics-*.json    - Timestamped snapshots
  kpi-history.json  - Historical KPI tracking (max 50)
  latest-summary.csv - CSV export

docs/
  KPI-GUIDE.md      - Detailed SLA system documentation
```

## Important Gotchas

1. **Manager name consistency**: On-call manager names must match EXACTLY between Jira `displayName`, Opsgenie email prefix, and hardcoded arrays. Case-sensitive.

2. **Dual SLA tracking**: When modifying KPI logic, remember both `onCall` and `assignee` metrics are calculated separately. See `src/kpi.js:73-141`.

3. **Date range filtering**: The fallback logic in `src/index.js:25-46` filters by assignment date OR creation date. This is intentional for catching tickets assigned late.

4. **Changelog requirement**: Full metrics require `expand: 'changelog'`. If API restricts changelog, metrics will be incomplete (no assignment times).

5. **CSV escaping**: `src/index.js:101-104` handles commas/quotes/newlines in CSV export. Don't use simple string concatenation.

## When Extending

**Adding new metrics**: Add to `computeMetrics()` in `src/metrics.js`, then include in CSV headers (`src/index.js:97-98`).

**New manager**: Update `ON_CALL_MANAGERS` array in BOTH `src/metrics.js` AND `src/kpi.js`.

**Custom SLA goals**: SLA goal is read from Jira custom field (`goalDuration`). To change default, modify `src/kpi.js:33` comparison logic.

**Dashboard pages**: Add new HTML in `dashboard/`, update navigation links, use existing API endpoints or add new ones in `server.js`.
