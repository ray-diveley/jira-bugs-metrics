import { differenceInMinutes, parseISO } from 'date-fns';
import { calculateBusinessMinutes, isOutsideBusinessHours, getCreatedTimeContext } from './businessHours.js';
import { ON_CALL_MANAGERS, SLA_RESPONDERS } from './constants.js';

export function computeMetrics(issue) {
  const key = issue.key;
  const fields = issue.fields || {};
  const created = fields.created;
  let resolutionDate = fields.resolutiondate || fields.resolveddatetime || null;
  const assignee = fields.assignee ? fields.assignee.displayName : null;
  const status = fields.status ? fields.status.name : null;
  const comments = (fields.comment && fields.comment.comments) || [];
  const histories = (issue.changelog && issue.changelog.histories) || [];

  // If no resolution date but status is closed/complete, find when status changed to closed
  if (!resolutionDate && status) {
    const closedStatuses = ['closed', 'complete', 'completed', 'done', 'resolved'];
    const statusLower = status.toLowerCase();
    if (closedStatuses.some(s => statusLower.includes(s))) {
      for (const h of histories) {
        for (const item of h.items) {
          if (item.field === 'status') {
            const toString = (item.toString || '').toLowerCase();
            if (closedStatuses.some(s => toString.includes(s))) {
              resolutionDate = h.created;
              break;
            }
          }
        }
        if (resolutionDate) break;
      }
    }
  }

  // Find first assignee assignment time and who assigned it
  // Note: changelog.histories is in reverse chronological order (newest first)
  let firstAssignmentTime = null;
  let assignedBy = null;
  for (let i = histories.length - 1; i >= 0; i--) {
    const h = histories[i];
    for (const item of h.items) {
      if (item.field === 'assignee' && item.toString) {
        if (!firstAssignmentTime) {
          firstAssignmentTime = h.created;
          assignedBy = h.author && h.author.displayName ? h.author.displayName : 'Unknown';
        }
        break;
      }
    }
  }

  // If no assignment in changelog but there's a current assignee, assume assigned at creation
  if (!firstAssignmentTime && assignee) {
    firstAssignmentTime = created;
    assignedBy = 'Self-assigned'; // Assigned at ticket creation
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[debug] ${key}: No changelog assignment, using creation time as assignment for ${assignee}`);
    }
  }

  // Find first on-call action (assignment or comment from ANY on-call person)
  // This includes the current assignee if they're an on-call manager
  let firstOnCallActionTime = null;
  let firstOnCallActionType = null;
  let onCallPersonWhoActedFirst = null;

  // Check all history items for assignments by on-call managers
  for (const h of histories) {
    const actorName = h.author && h.author.displayName ? h.author.displayName : null;
    if (!actorName || !ON_CALL_MANAGERS.includes(actorName)) continue;

    for (const item of h.items) {
      if (item.field === 'assignee' && item.toString) {
        const actionTime = h.created;
        if (!firstOnCallActionTime || parseISO(actionTime) < parseISO(firstOnCallActionTime)) {
          firstOnCallActionTime = actionTime;
          firstOnCallActionType = 'assignment';
          onCallPersonWhoActedFirst = actorName;
        }
        break;
      }
    }
  }

  // Check all comments for comments by on-call managers (including current assignee)
  for (const c of comments) {
    const authorName = c.author && c.author.displayName ? c.author.displayName : null;
    if (!authorName || !ON_CALL_MANAGERS.includes(authorName)) continue;

    const commentTime = c.created;
    if (!firstOnCallActionTime || parseISO(commentTime) < parseISO(firstOnCallActionTime)) {
      firstOnCallActionTime = commentTime;
      firstOnCallActionType = 'comment';
      onCallPersonWhoActedFirst = authorName;
    }
  }

  // If current assignee is an on-call manager and took first action, update assignedBy
  if (onCallPersonWhoActedFirst && assignee === onCallPersonWhoActedFirst && !assignedBy) {
    assignedBy = 'Self-assigned';
  }

  // Find first action from SLA responders (on-call managers + key engineers)
  // This is used for SLA measurement - only these people's actions count
  let firstHumanActionTime = null;
  let firstHumanActionPerson = null;

  // Check for first assignment by SLA responders
  // Iterate in reverse chronological order to find the earliest assignment
  for (let i = histories.length - 1; i >= 0; i--) {
    const h = histories[i];
    const actorName = h.author && h.author.displayName ? h.author.displayName : null;
    if (!actorName || !SLA_RESPONDERS.includes(actorName)) continue;

    for (const item of h.items) {
      if (item.field === 'assignee' && item.toString) {
        if (!firstHumanActionTime || parseISO(h.created) < parseISO(firstHumanActionTime)) {
          firstHumanActionTime = h.created;
          firstHumanActionPerson = actorName;
        }
        break;
      }
    }
  }

  // Check for first comment by SLA responders
  for (const c of comments) {
    const authorName = c.author && c.author.displayName ? c.author.displayName : null;
    if (!authorName || !SLA_RESPONDERS.includes(authorName)) continue;

    const commentTime = c.created;
    if (!firstHumanActionTime || parseISO(commentTime) < parseISO(firstHumanActionTime)) {
      firstHumanActionTime = commentTime;
      firstHumanActionPerson = authorName;
    }
  }

  // Update onCallPersonWhoActedFirst if no on-call manager acted first
  // This ensures non-on-call SLA responders (like Katelyn, Manjeet) are tracked
  if (!onCallPersonWhoActedFirst && firstHumanActionPerson) {
    onCallPersonWhoActedFirst = firstHumanActionPerson;
  }

  // Legacy: Find first manager comment (any comment from the person who assigned)
  let firstManagerCommentTime = null;
  let managerCommentedBeforeAssignment = false;

  if (assignedBy) {
    for (const c of comments) {
      if (c.author && c.author.displayName === assignedBy) {
        firstManagerCommentTime = c.created;
        // Check if comment came before assignment
        if (firstAssignmentTime) {
          const commentMoment = parseISO(c.created);
          const assignmentMoment = parseISO(firstAssignmentTime);
          if (commentMoment < assignmentMoment) {
            managerCommentedBeforeAssignment = true;
          }
        }
        break;
      }
    }
  }

  // Determine first assignee comment time after assignment
  let firstAssigneeCommentTime = null;
  if (assignee && firstAssignmentTime) {
    const assignmentMoment = parseISO(firstAssignmentTime);
    for (const c of comments) {
      if (!c.author || c.author.displayName !== assignee) continue;
      const commentTime = parseISO(c.created);
      if (commentTime >= assignmentMoment) {
        firstAssigneeCommentTime = c.created;
        break;
      }
    }
  }

  const nowIso = new Date().toISOString();
  const endForOpenDuration = resolutionDate || nowIso;
  const openDurationMinutes = safeDiffMinutes(created, endForOpenDuration);
  const timeToResolutionMinutes = resolutionDate ? safeDiffMinutes(created, resolutionDate) : null;
  const timeToFirstAssigneeCommentMinutes = (firstAssignmentTime && firstAssigneeCommentTime)
    ? safeDiffMinutes(firstAssignmentTime, firstAssigneeCommentTime)
    : null;

  // Calculate on-call response metrics
  const timeToFirstOnCallActionMinutes = firstOnCallActionTime
    ? safeDiffMinutes(created, firstOnCallActionTime)
    : null;
  const timeToAssignmentMinutes = firstAssignmentTime
    ? safeDiffMinutes(created, firstAssignmentTime)
    : null;
  const timeToManagerCommentMinutes = firstManagerCommentTime
    ? safeDiffMinutes(created, firstManagerCommentTime)
    : null;

  // Extract SLA information - search all custom fields for SLA data
  let slaData = null;

  // Common SLA field patterns in Jira
  const slaFieldCandidates = Object.keys(fields).filter(key =>
    key.toLowerCase().includes('sla') ||
    key.includes('customfield')
  );

  for (const fieldKey of slaFieldCandidates) {
    const field = fields[fieldKey];
    if (!field) continue;

    // Check for SLA structure
    if (field.completedCycles && field.completedCycles.length > 0) {
      slaData = field.completedCycles.map(cycle => ({
        name: cycle.goalName || cycle.name || 'SLA',
        breached: cycle.breached || false,
        goalDuration: cycle.goalDuration ? cycle.goalDuration.millis : null,
        elapsedTime: cycle.elapsedTime ? cycle.elapsedTime.millis : null,
        remainingTime: cycle.remainingTime ? cycle.remainingTime.millis : null
      }));
      break;
    } else if (field.ongoingCycle) {
      const cycle = field.ongoingCycle;
      slaData = [{
        name: cycle.goalName || cycle.name || 'SLA',
        breached: cycle.breached || false,
        goalDuration: cycle.goalDuration ? cycle.goalDuration.millis : null,
        elapsedTime: cycle.elapsedTime ? cycle.elapsedTime.millis : null,
        remainingTime: cycle.remainingTime ? cycle.remainingTime.millis : null
      }];
      break;
    }
    // Also check for simpler SLA format (like Time to first response)
    else if (field._links && field.ongoingCycle !== undefined) {
      slaData = [{
        name: fieldKey,
        breached: false,
        goalDuration: null,
        elapsedTime: null,
        remainingTime: null
      }];
      break;
    }
  }

  // Calculate business hours for key metrics
  // On-call action uses default (EST) timezone since tickets come from US/UK customers
  const businessHoursToFirstOnCallAction = firstOnCallActionTime
    ? calculateBusinessMinutes(created, firstOnCallActionTime)
    : null;

  // Assignee response uses assignee's timezone for fair measurement
  const businessHoursToFirstAssigneeComment = (firstAssignmentTime && firstAssigneeCommentTime && assignee)
    ? calculateBusinessMinutes(firstAssignmentTime, firstAssigneeCommentTime, assignee)
    : null;

  // Calculate business hours from creation to assignee comment (for SLA comparison)
  const businessHoursToFirstAssigneeCommentFromCreation = firstAssigneeCommentTime
    ? calculateBusinessMinutes(created, firstAssigneeCommentTime)
    : null;

  // Calculate business hours to first HUMAN action (for true SLA measurement)
  const businessHoursToFirstHumanAction = firstHumanActionTime
    ? calculateBusinessMinutes(created, firstHumanActionTime)
    : null;

  return {
    key,
    summary: fields.summary,
    status,
    priority: fields.priority ? fields.priority.name : 'None',
    assigneeCurrent: assignee,
    created,
    resolutionDate,
    firstAssignmentTime,
    firstAssigneeCommentTime,
    assignedBy,
    firstManagerCommentTime,
    firstOnCallActionTime,
    firstOnCallActionType,
    onCallPersonWhoActedFirst,
    managerCommentedBeforeAssignment,
    timeToFirstOnCallActionMinutes,
    timeToAssignmentMinutes,
    timeToManagerCommentMinutes,
    businessHoursToFirstOnCallAction,
    businessHoursToFirstAssigneeComment,
    businessHoursToFirstAssigneeCommentFromCreation,
    businessHoursToFirstHumanAction,
    createdOutsideBusinessHours: isOutsideBusinessHours(created),
    createdTimeContext: getCreatedTimeContext(created),
    sla: slaData,
    openDurationMinutes,
    timeToResolutionMinutes,
    timeToFirstAssigneeCommentMinutes,
    url: `https://your-domain.atlassian.net/browse/${key}`
  };
}

function safeDiffMinutes(a, b) {
  try { return differenceInMinutes(parseISO(b), parseISO(a)); } catch { return null; }
}

export function summarize(allMetrics) {
  const numeric = (name) => allMetrics.map(m => m[name]).filter(v => typeof v === 'number');
  const avg = (arr) => arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2) : null;
  return {
    count: allMetrics.length,
    avgOpenDurationMinutes: avg(numeric('openDurationMinutes')),
    avgTimeToResolutionMinutes: avg(numeric('timeToResolutionMinutes')),
    avgTimeToFirstAssigneeCommentMinutes: avg(numeric('timeToFirstAssigneeCommentMinutes')),
    avgBusinessHoursToFirstOnCallAction: avg(numeric('businessHoursToFirstOnCallAction')),
    avgBusinessHoursToFirstAssigneeComment: avg(numeric('businessHoursToFirstAssigneeComment'))
  };
}
