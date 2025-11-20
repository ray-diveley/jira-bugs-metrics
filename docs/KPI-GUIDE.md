# SLA Performance KPI System

## Overview

This system tracks and analyzes SLA performance metrics for your Jira bug tracking, providing comprehensive KPIs to measure team performance and improvement over time.

## Key Features

### 📊 SLA Compliance Tracking
- **Overall Compliance Rate**: Percentage of tickets meeting SLA response times
- **Met vs Breached**: Clear breakdown of SLA performance
- **Average Response Time**: Team-wide average time to first manager action
- **Pending Tickets**: Tickets still within SLA window awaiting response

### 👥 Manager Performance
- Individual compliance rates for each manager
- Response time averages by manager
- Ranking by performance
- Met/Breached/Pending breakdown per manager

### 📈 Trends & Comparisons
- **Quarterly Analysis**: Track performance quarter-over-quarter
- **Period Comparison**: Compare any two time periods
- **Historical Timeline**: Visual chart showing compliance over time
- **Improvement Tracking**: Identify trends and measure progress

### 📉 Response Time Distribution
- Breakdown of response times by category:
  - Under 1 hour
  - 1-2 hours
  - 2-4 hours (SLA goal)
  - 4-8 hours
  - Over 8 hours
  - No response yet

### 📅 Day of Week Analysis
- See which days have best/worst SLA performance
- Identify patterns in team responsiveness
- Optimize scheduling based on data

## How It Works

### SLA Calculation

**What counts as SLA compliance:**
- ✅ **Met**: Manager responded (comment or assignment) within SLA window (default: 4 hours)
- ❌ **Breached**: Manager's first action exceeded SLA window
- ⏳ **Pending**: No manager action yet, but still within SLA window

**Important**: Only the initial *response time* is measured for SLA. Resolution time can exceed SLA without penalty, as fixing the issue may take longer.

### Data Collection

1. **Automatic KPI Calculation**: Every time you run `npm start`, the system:
   - Collects metrics from Jira
   - Calculates SLA performance KPIs
   - Saves a snapshot to historical tracking
   - Updates compliance rates

2. **Historical Tracking**: All KPI snapshots are stored in `data/kpi-history.json` with:
   - Timestamp
   - Date range covered
   - Overall compliance metrics
   - Top performer information

3. **Quarterly Aggregation**: System automatically groups snapshots by quarter for trend analysis

## Dashboard Pages

### 1. Main Dashboard (`index.html`)
- Issue details with assignee filtering
- Manager response patterns with drill-down
- Developer metrics
- Access to KPI and Trends pages

### 2. SLA KPIs (`kpi.html`)
Current period performance:
- 6 key metric cards at the top
- Manager performance table with compliance rates
- Response time distribution chart
- Day of week analysis

### 3. Trends & Comparisons (`trends.html`)
Historical analysis:
- **Period Comparison Tool**: Select any two periods to compare
- **Quarterly Trends**: See quarter-over-quarter improvements
- **Timeline Chart**: Visual representation of compliance over time
- **All Snapshots**: Complete history of all collections

## Using the KPI System

### Setting Goals

**Current SLA Goal**: 4 hours (configurable in Jira)

**Target Compliance Rates**:
- 🟢 **Excellent**: ≥85% compliance
- 🟡 **Good**: 70-84% compliance
- 🔴 **Needs Improvement**: <70% compliance

### Measuring Quarter-over-Quarter Improvement

1. **Collect Data Regularly**: Run metrics collection weekly or bi-weekly
2. **Review Quarterly**: At end of each quarter, visit Trends page
3. **Identify Patterns**:
   - Which managers improved?
   - Are response times getting faster?
   - Is ticket volume affecting performance?
4. **Set Targets**: Use previous quarter as baseline for improvement goals

### Example KPI Reporting

**Q3 2025 Performance**:
- Overall Compliance: 78.5%
- Total Tickets: 45
- Met SLA: 35 tickets
- Breached SLA: 10 tickets
- Avg Response Time: 2h 15m

**Q4 2025 Target**:
- Overall Compliance: 85% (+6.5% improvement)
- Reduce breaches by 50% (from 10 to 5)
- Maintain avg response under 2 hours

## API Endpoints

The dashboard server provides these endpoints:

- `GET /api/latest-metrics` - Latest metrics collection
- `GET /api/kpi-history` - All historical KPI snapshots
- `GET /api/metrics-files` - List of all metrics files
- `POST /api/run-metrics` - Trigger new metrics collection

## Data Files

### Generated Files

1. **Metrics Files** (`data/metrics-YYYY-MM-DDTHH-mm-ss-sssZ.json`)
   - Raw metrics for each collection
   - Contains all ticket details, response times, SLA data

2. **KPI History** (`data/kpi-history.json`)
   - Historical snapshots of KPI calculations
   - Used for trends and comparisons
   - Keeps last 50 snapshots

3. **Summary CSV** (`data/latest-summary.csv`)
   - CSV export of latest metrics
   - For external analysis/reporting

## Configuration

### Date Range
Set in `.env` file:
```
JIRA_START_DATE=2025-11-03
JIRA_END_DATE=2025-11-19
```

These dates filter which tickets are included in metrics collection. Only tickets *created* within this range are analyzed.

### SLA Goal
Configured in Jira's SLA settings. The system reads the goal from Jira's SLA data (default: 4 hours / 14400000ms).

## Interpreting Results

### Good Performance Indicators
- ✅ Compliance rate trending upward
- ✅ Average response time decreasing
- ✅ Consistent performance across all managers
- ✅ Most tickets in "Under 2 hours" category

### Warning Signs
- ⚠️ Compliance rate declining quarter-over-quarter
- ⚠️ High variation between managers
- ⚠️ Many tickets in "Over 8 hours" category
- ⚠️ Specific days consistently underperforming

## Tips for Improvement

1. **Use Day Analysis**: If Mondays show poor performance, ensure adequate coverage
2. **Manager Coaching**: Share individual compliance rates for accountability
3. **Set Team Goals**: Publicize quarterly targets to motivate improvement
4. **Response Templates**: Speed up initial responses with templates
5. **Schedule Review**: Weekly quick check of pending tickets still within SLA

## Example Use Cases

### Executive Reporting
"In Q4 2025, our support team achieved an 82% SLA compliance rate, up from 75% in Q3, demonstrating a 7% improvement in response times."

### Team Performance Reviews
"Brad maintained a 95% SLA compliance rate this quarter, responding to tickets an average of 1h 30m, making him our top performer."

### Process Improvement
"Analysis shows Friday afternoons have 40% lower compliance. We've adjusted schedules to ensure coverage during this period."

### Capacity Planning
"Ticket volume increased 25% this quarter, but compliance only dropped 2%, indicating good team scaling. However, we should plan for additional capacity if growth continues."

## Technical Notes

- KPI calculations run automatically during metrics collection
- Historical data persists across collections
- All times are calculated from Jira's UTC timestamps
- Manager identification uses the `assignedBy` field (first person to take action)
- Browser LocalStorage used for dashboard configuration only

## Future Enhancements

Potential additions:
- Email alerts for SLA breaches
- Predictive analytics for capacity needs
- Integration with team calendars
- Custom SLA goals per ticket type/priority
- Export to PowerPoint for presentations
