import { apiRequest } from './http';

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

function send(path, method, body = {}) {
  return apiRequest(path, { method, body: JSON.stringify(body) });
}

export function getCompassToday(date) {
  return apiRequest(`/compass/today${query({ date })}`);
}

export function getCompassPlan() {
  return apiRequest('/compass/plan');
}

export function saveCompassPlan(payload) {
  return send('/compass/plan', 'PUT', payload);
}

export function updateCompassDay(date, payload) {
  return send(`/compass/days/${encodeURIComponent(date)}`, 'PATCH', payload);
}

export function setCompassCheck(date, key, completed) {
  return send(`/compass/days/${encodeURIComponent(date)}/checks/${encodeURIComponent(key)}`, 'PUT', { completed });
}

export function setCompassBlock(date, blockId, status, payload = {}) {
  return send(`/compass/days/${encodeURIComponent(date)}/blocks/${encodeURIComponent(blockId)}`, 'PUT', { status, ...payload });
}

export function resetCompassDay(date, payload = {}) {
  return send(`/compass/days/${encodeURIComponent(date)}/reset`, 'POST', payload);
}

export function closeCompassDay(date, payload) {
  return send(`/compass/days/${encodeURIComponent(date)}/close`, 'POST', payload);
}

export function getCompassWeek(start) {
  return apiRequest(`/compass/week${query({ start })}`);
}

export function minuteToTimeInput(minute) {
  const value = Math.max(0, Math.min(1439, Number(minute) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function timeInputToMinute(value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  return Math.max(0, Math.min(1439, (hour || 0) * 60 + (minute || 0)));
}
