import { apiRequest } from './http';

// AI Dev Planner — Stage-0 MVP. Every endpoint is admin-gated on the server (403 for non-admins).

function qs(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function send(path, method, payload) {
  return apiRequest(path, { method, body: JSON.stringify(payload || {}) });
}

// --- WorkOS dashboard ---
export function getDashboard(params = {}) {
  return apiRequest(`/planner/dashboard${qs(params)}`);
}

// --- Projects (Module D4) ---
export function listProjects() {
  return apiRequest('/planner/projects');
}

// Returns { project, meetings, deliverables, tasks, promptTemplates, objectives }.
export function getProject(id) {
  return apiRequest(`/planner/projects/${encodeURIComponent(id)}`);
}

// payload accepts: name, description, code, status, repoUrl, techStack (string|array),
// architecture, codingStandards, folderStructure.
export function createProject(payload) {
  return send('/planner/projects', 'POST', payload);
}

export function updateProject(id, payload) {
  return send(`/planner/projects/${encodeURIComponent(id)}`, 'PATCH', payload);
}

export function deleteProject(id) {
  return apiRequest(`/planner/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- Prompt library ---
export function listPromptTemplates(params = {}) {
  return apiRequest(`/planner/prompt-templates${qs(params)}`);
}

export function createPromptTemplate(payload) {
  return send('/planner/prompt-templates', 'POST', payload);
}

export function updatePromptTemplate(id, payload) {
  return send(`/planner/prompt-templates/${encodeURIComponent(id)}`, 'PUT', payload);
}

export function deletePromptTemplate(id) {
  return apiRequest(`/planner/prompt-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const PROJECT_STATUSES = ['active', 'paused', 'archived'];

export const projectStatusStyles = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  archived: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};

// --- Module A: notes -> structured task drafts (not persisted until accepted) ---
export function structureNotes(notes) {
  return send('/planner/structure', 'POST', { notes });
}

// payload: { planDate, projectId, tasks: [{ title, description, acceptanceCriteria[], projectTag, estimateLabel, estimatedMinutes }] }
export function acceptTasks(payload) {
  return send('/planner/tasks/accept', 'POST', payload);
}

// --- MOM import: meeting -> deliverables -> tasks ---
// Returns { meeting:{title,summary,objectives[],participants[],confidence,rawText},
//           deliverables:[{title,note,confidence,tasks:[{title,description,acceptanceCriteria[],
//             category,priority,estimatedMinutes,estimateLabel,confidence,sourceExcerpt}]}] } — NOT persisted.
export function extractMeeting(notes) {
  return send('/planner/meetings/extract', 'POST', { notes });
}

// payload: { planDate, projectId, meetingDate, meeting:{...}, deliverables:[{...tasks}] } → persists the tree.
export function commitMeeting(payload) {
  return send('/planner/meetings/commit', 'POST', payload);
}

export function getMeeting(id) {
  return apiRequest(`/planner/meetings/${encodeURIComponent(id)}`);
}

// --- Tasks (Modules C/D) ---
export function listTasks(params = {}) {
  return apiRequest(`/planner/tasks${qs(params)}`);
}

export function getTask(id) {
  return apiRequest(`/planner/tasks/${encodeURIComponent(id)}`);
}

export function createTask(payload) {
  return send('/planner/tasks', 'POST', payload);
}

export function updateTask(id, payload) {
  return send(`/planner/tasks/${encodeURIComponent(id)}`, 'PUT', payload);
}

export function deleteTask(id) {
  return apiRequest(`/planner/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- Dependencies + validation (task detail) ---
// dependsOn: array of task ids this task is blocked by. Returns { dependencies }.
export function setDependencies(id, dependsOn) {
  return send(`/planner/tasks/${encodeURIComponent(id)}/dependencies`, 'PUT', { dependsOn });
}

// payload: { action: 'confirm'|'reject'|'merge'|'split', mergeWithTaskId?, splits?:[{title,description,estimatedMinutes}] }
// Returns { action, task, tasks }.
export function validateTask(id, payload) {
  return send(`/planner/tasks/${encodeURIComponent(id)}/validate`, 'POST', payload);
}

// --- AI Workspace (execution brief, prompt-only) ---
// Returns { task, project, meeting, deliverable, dependencies,
//           brief:{projectContext, meetingContext, deliverableContext, requirements, expectedOutput, references:[{label,value}]},
//           executionPrompt, promptUsed, tokenEstimate }.
export function getTaskWorkspace(id) {
  return apiRequest(`/planner/tasks/${encodeURIComponent(id)}/workspace`);
}

// --- Knowledge base (cross-entity search) ---
// params: { q, type: 'meetings'|'deliverables'|'tasks'|'prompts' }
// Returns { query, type, total, facets:{meetings,deliverables,tasks,prompts}, results:[{type,id,title,snippet,projectId,...}] }.
export function searchKnowledge(params = {}) {
  return apiRequest(`/planner/knowledge/search${qs(params)}`);
}

// --- Analytics (delivery efficiency) ---
// params: { range: '7d'|'30d'|'all' } → { range, kpis, quality, timeImpact, tasksByStatus, tasksByPriority, timeseries:[{date,tasks}] }
export function getAnalytics(params = {}) {
  return apiRequest(`/planner/analytics${qs(params)}`);
}

// --- Module B: prompt generation ---
export function generatePrompt(id) {
  return send(`/planner/tasks/${encodeURIComponent(id)}/prompt`, 'POST', {});
}

// Record the exact prompt text the user actually copied/used (B4).
export function setPromptUsed(id, promptUsed) {
  return send(`/planner/tasks/${encodeURIComponent(id)}/prompt-used`, 'PATCH', { promptUsed });
}

// --- Module C: time estimation ---
export function generateEstimate(id) {
  return send(`/planner/tasks/${encodeURIComponent(id)}/estimate`, 'POST', {});
}

// --- Module E: comprehension summary ---
export function generateComprehension(id, codeOrDiff) {
  return send(`/planner/tasks/${encodeURIComponent(id)}/comprehension`, 'POST', { codeOrDiff });
}

// payload: { userAnnotation?, userAnswer?, summaryFeedback? ('up'|'down'|null) }
export function updateComprehension(id, payload) {
  return send(`/planner/tasks/${encodeURIComponent(id)}/comprehension`, 'PATCH', payload);
}

// --- Module F: standup digest ---
export function getStandup(params = {}) {
  return apiRequest(`/planner/standup${qs(params)}`);
}

// --- Data export (no lock-in) ---
export function exportUrl(format = 'json') {
  return `/api/planner/export${qs({ format })}`;
}

// --- Shared display helpers ---
export const STATUSES = ['planned', 'in_progress', 'done', 'blocked'];
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];

export const priorityStyles = {
  critical: 'bg-red-500/15 text-red-700 dark:text-red-400',
  high: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  medium: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  low: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};

export const priorityLabels = {
  critical: 'P0 · Critical',
  high: 'P1 · High',
  medium: 'P2 · Medium',
  low: 'P3 · Low',
};

// Minutes-from-midnight → "9:00 AM" for weekly time-blocking.
export function formatClock(minute) {
  const value = Number(minute);
  if (!Number.isFinite(value)) return '';
  const h = Math.floor(value / 60) % 24;
  const m = value % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
}


export const statusStyles = {
  planned: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  in_progress: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  blocked: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export const statusLabels = {
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};

export function formatMinutes(minutes) {
  const total = Number(minutes) || 0;
  if (total <= 0) return '—';
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function toDateInput(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// Monday-based week start as YYYY-MM-DD.
export function weekStartOf(date = new Date()) {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toDateInput(d);
}
