import { differenceInMinutes, parseISO } from 'date-fns';

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
    let firstAssignmentTime = null;
    let assignedBy = null;
    for (const h of histories) {
        for (const item of h.items) {
            if (item.field === 'assignee' && item.toString) {
                firstAssignmentTime = h.created;
                assignedBy = h.author && h.author.displayName ? h.author.displayName : 'Unknown';
                break;
            }
        }
        if (firstAssignmentTime) break;
    }

  // Find first manager comment (any comment from the person who assigned)
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

  // Determine first manager action (comment or assignment, whichever came first)
  let firstManagerActionTime = null;
  let firstManagerActionType = null;
  
  if (firstManagerCommentTime && firstAssignmentTime) {
    const commentMoment = parseISO(firstManagerCommentTime);
    const assignmentMoment = parseISO(firstAssignmentTime);
    if (commentMoment < assignmentMoment) {
      firstManagerActionTime = firstManagerCommentTime;
      firstManagerActionType = 'comment';
    } else {
      firstManagerActionTime = firstAssignmentTime;
      firstManagerActionType = 'assignment';
    }
  } else if (firstManagerCommentTime) {
    firstManagerActionTime = firstManagerCommentTime;
    firstManagerActionType = 'comment';
  } else if (firstAssignmentTime) {
    firstManagerActionTime = firstAssignmentTime;
    firstManagerActionType = 'assignment';
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
  
  // Calculate manager response metrics
  const timeToFirstManagerActionMinutes = firstManagerActionTime 
    ? safeDiffMinutes(created, firstManagerActionTime)
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
    firstManagerActionTime,
    firstManagerActionType,
    managerCommentedBeforeAssignment,
    timeToFirstManagerActionMinutes,
    timeToAssignmentMinutes,
    timeToManagerCommentMinutes,
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
    avgTimeToFirstAssigneeCommentMinutes: avg(numeric('timeToFirstAssigneeCommentMinutes'))
  };
}
