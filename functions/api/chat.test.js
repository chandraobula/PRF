import { afterEach, describe, expect, it, vi } from 'vitest';
import { runModelRound, toGeminiConversation } from './chat.js';

function openAIStream(content) {
  const frame = JSON.stringify({ choices: [{ delta: { content } }] });
  return new Response(`data: ${frame}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('chat provider fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back from direct OpenAI to OpenRouter', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('api.openai.com')) {
        return new Response('busy', { status: 503 });
      }
      return openAIStream('Fallback answer');
    });
    vi.stubGlobal('fetch', fetchMock);
    const chunks = [];

    const result = await runModelRound({
      env: { OPENAI_API_KEY: 'test-openai', OPENROUTER_API_KEY: 'test-router' },
      messages: [{ role: 'user', content: 'Hello' }],
      toolChoice: 'auto',
      referer: 'https://lifeos.test',
      onContent: (text) => chunks.push(text),
    });

    expect(result.provider).toBe('openrouter');
    expect(result.turn.content).toBe('Fallback answer');
    expect(chunks.join('')).toBe('Fallback answer');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back from every OpenRouter model to Gemini', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('openrouter.ai')) {
        return new Response('server busy', { status: 503 });
      }
      return Response.json({
        candidates: [{ content: { parts: [{ text: 'Gemini answer' }] } }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const chunks = [];

    const result = await runModelRound({
      env: { OPENROUTER_API_KEY: 'test-router', GEMINI_API_KEY: 'test-gemini' },
      messages: [
        { role: 'system', content: 'Be helpful.' },
        { role: 'user', content: 'Hello' },
      ],
      toolChoice: 'auto',
      referer: 'https://lifeos.test',
      onContent: (text) => chunks.push(text),
    });

    expect(result.provider).toBe('gemini');
    expect(result.turn.content).toBe('Gemini answer');
    expect(chunks.join('')).toBe('Gemini answer');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('switches models when an accepted stream fails mid-response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response('data: {"error":{"message":"server busy"}}\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return openAIStream('Second model answered');
    });
    vi.stubGlobal('fetch', fetchMock);
    const onFallback = vi.fn();

    const result = await runModelRound({
      env: { OPENROUTER_API_KEY: 'test-router' },
      messages: [{ role: 'user', content: 'Hello' }],
      toolChoice: 'auto',
      referer: 'https://lifeos.test',
      onContent: () => {},
      onFallback,
    });

    expect(result.provider).toBe('openrouter');
    expect(result.turn.content).toBe('Second model answered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('converts tool calls and results for Gemini fallback rounds', () => {
    const converted = toGeminiConversation([
      { role: 'system', content: 'Use tools.' },
      { role: 'user', content: 'Check my pantry.' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ function: { name: 'get_pantry_summary', arguments: '{}' } }],
      },
      {
        role: 'tool',
        name: 'get_pantry_summary',
        content: '{"totalItems":2}',
      },
    ]);

    expect(converted.systemInstruction.parts[0].text).toBe('Use tools.');
    expect(converted.contents[1].parts[0].functionCall.name).toBe('get_pantry_summary');
    expect(converted.contents[2].parts[0].functionResponse.response).toEqual({ totalItems: 2 });
  });
});
