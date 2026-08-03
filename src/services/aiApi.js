import { notifyUnauthorized } from '../lib/session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Stream an answer from the Ask Life OS backend.
 *
 * The backend speaks SSE with four frame types:
 *   (default)      { content }  — a token of the answer
 *   event: status  { message }  — a tool run started ("Checking your finances…")
 *   event: reset   {}           — discard prose streamed before a tool call
 *   event: error   { message }  — upstream failure
 *   data: [DONE]                — end of stream
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} handlers
 * @param {(chunk: string) => void} handlers.onContent
 * @param {(message: string) => void} [handlers.onStatus]
 * @param {() => void} [handlers.onReset]
 * @param {(model: string) => void} [handlers.onModel]
 * @param {AbortSignal} [handlers.signal]
 */
export async function streamChatMessage(messages, { onContent, onStatus, onReset, onModel, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      notifyUnauthorized();
    }
    throw new Error(await readErrorMessage(response));
  }

  if (!response.body) {
    throw new Error('Streaming is not supported by this browser.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamError = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; anything after the last one
      // is an incomplete frame that must wait for the next chunk.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const result = handleFrame(frame, { onContent, onStatus, onReset, onModel });
        if (result.error) streamError = new Error(result.error);
        if (result.done) return finalize(streamError);
      }
    }

    if (buffer.trim()) {
      const result = handleFrame(buffer, { onContent, onStatus, onReset, onModel });
      if (result.error) streamError = new Error(result.error);
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return finalize(streamError);
}

function finalize(streamError) {
  if (streamError) throw streamError;
}

/**
 * Parse a single SSE frame. Returns `{ done, error }` instead of throwing so the
 * caller controls when the stream unwinds — an error frame must not be swallowed.
 */
function handleFrame(frame, { onContent, onStatus, onReset, onModel }) {
  let event = 'message';
  const dataLines = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) continue; // Comment / keep-alive.
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) return {};

  const payload = dataLines.join('\n');
  if (payload === '[DONE]') return { done: true };

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return {};
  }

  switch (event) {
    case 'error':
      return { error: data.message || 'The assistant hit an error.' };
    case 'status':
      onStatus?.(data.message || '', data.tools || []);
      return {};
    case 'reset':
      onReset?.();
      return {};
    case 'meta':
      onModel?.(data.model || '');
      return {};
    default:
      if (data.content) onContent?.(data.content);
      return {};
  }
}

async function readErrorMessage(response) {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || `Request failed with ${response.status}`;
  } catch {
    return text.slice(0, 200) || `Request failed with ${response.status}`;
  }
}
