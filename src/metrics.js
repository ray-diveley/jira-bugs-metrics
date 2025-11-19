import { differenceInMinutes, parseISO } from 'date-fns';

export function computeMetrics(issue) {
  const key = issue.key;
  const fields = issue.fields || {};
  const created = fields.created;
  const resolutionDate = fields.resolutiondate || null;
  const assignee = fields.assignee ? fields.assignee.displayName : null;
  const status = fields.status ? fields.status.name : null;
  const comments = (fields.comment && fields.comment.comments) || [];
  const histories = (issue.changelog && issue.changelog.histories) || [];

  // Find first assignee assignment time
  let firstAssignmentTime = null;
  for (const h of histories) {
    for (const item of h.items) {
      if (item.field === 'assignee' && item.toString) {
        firstAssignmentTime = h.created;
        break;
      }
    }
    if (firstAssignmentTime) break;
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

  return {
    key,
    summary: fields.summary,
    status,
    assigneeCurrent: assignee,
    created,
    resolutionDate,
    firstAssignmentTime,
    firstAssigneeCommentTime,
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
