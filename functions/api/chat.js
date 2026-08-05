// ---------------------------------------------------------------------------
// Ask Life OS — Tool-calling AI chat backend
// Uses OpenRouter with function calling to query the user's D1 data.
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-email',
};

// Models answer multi-part questions by calling one tool per round, so this has
// to cover "audit my subscriptions, pantry and dates" style questions. D1 reads
// are cheap; the real cost is one extra model round-trip.
const MAX_TOOL_ROUNDS = 6;

// Models are tried in order. The first one that accepts the request wins, so a
// model being retired, rate-limited or out of credit degrades instead of 500ing.
// Every entry must support OpenRouter tool calling (`supported_parameters: tools`).
// Ordered by active-parameter count (the main driver of time-to-first-token on
// OpenRouter's shared free pool) so the common case answers fast, with larger
// models as a quality fallback: gpt-oss-20b (3.6B active) and nemotron-nano-9b
// (9B, both full tool+structured-output support) first, nemotron-3-super
// (12B active) for tougher multi-tool questions, ling-3.0-flash as a last,
// large-context resort. Re-check openrouter.ai/api/v1/models periodically —
// free-tier slugs and their capabilities change without notice.
const DEFAULT_MODELS = [
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'inclusionai/ling-3.0-flash:free',
];

// Status codes worth retrying on the next model in the chain.
const FALLBACK_STATUSES = new Set([402, 404, 408, 409, 413, 429, 500, 502, 503, 504]);

// Friendly labels for the "Checking your…" status chips in the UI.
const TOOL_LABELS = {
  get_finance_summary: 'finances',
  get_recent_transactions: 'recent transactions',
  get_pantry_summary: 'pantry',
  get_subscriptions: 'subscriptions',
  get_important_dates: 'important dates',
  get_notes: 'notes',
  get_car_summary: 'vehicles',
};

// ---------------------------------------------------------------------------
// Tool definitions (sent to the LLM so it knows what it can call)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_finance_summary',
      description:
        'Get the user\'s financial summary for the current month including total income, expenses, net cash flow, savings rate, budget usage, and spending breakdown by category.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_transactions',
      description:
        'Get the user\'s most recent financial transactions (income, expenses, refunds). Returns up to 20 entries with merchant name, amount, category, and date.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['income', 'expense', 'refund'],
            description: 'Optional filter by transaction type.',
          },
          limit: {
            type: 'number',
            description: 'Number of transactions to return (max 20, default 10).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pantry_summary',
      description:
        'Get the user\'s pantry inventory: all food items, quantities, expiry dates, low-stock alerts, and the shopping list.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_subscriptions',
      description:
        'Get all of the user\'s active subscriptions including name, cost, billing cadence, next renewal date, and total monthly/yearly spend estimates.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_important_dates',
      description:
        'Get the user\'s important dates and deadlines: birthdays, license renewals, insurance expiry, warranties, and upcoming reminders.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_notes',
      description:
        'Get the user\'s saved notes, ideas, questions, and follow-ups.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_car_summary',
      description:
        'Get the user\'s vehicle information: cars owned, mileage, maintenance schedule, insurance/registration/warranty expiry dates.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// ---------------------------------------------------------------------------
// CORS preflight
// ---------------------------------------------------------------------------

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// ---------------------------------------------------------------------------
// Main POST handler
// ---------------------------------------------------------------------------

export async function onRequestPost({ request, env }) {
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return json({ error: 'OPENROUTER_API_KEY is not configured.' }, 500);
  }

  if (!env.DB) {
    return json({ error: 'Database not available.' }, 503);
  }

  try {
    // 1. Authenticate the user (same session-cookie logic as [[path]].js)
    const user = await authenticateUser(request, env.DB, env);

    if (user.error) {
      return json({ error: user.error }, 401);
    }

    // 2. Parse request body
    const body = await request.json();
    const messages = sanitizeMessages(body.messages);

    if (!messages.length) {
      return json({ error: 'messages[] is required.' }, 400);
    }

    // 3. Build the system prompt with user context
    const systemPrompt = buildSystemPrompt(user);

    // 4. Run the tool-calling loop and stream the response
    const stream = runToolCallingLoop({
      apiKey,
      systemPrompt,
      messages,
      db: env.DB,
      userId: user.userId,
      models: resolveModels(env),
      referer: new URL(request.url).origin,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        // Stops Cloudflare/nginx style proxies from buffering the SSE body.
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return json({ error: error.message || 'Internal error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Tool-calling loop and Streaming
// ---------------------------------------------------------------------------

function runToolCallingLoop({ apiKey, systemPrompt, messages, db, userId, models, referer }) {
  const conversation = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (payload, event) => {
        if (closed) return;
        const prefix = event ? `event: ${event}\n` : '';
        controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(payload)}\n\n`));
      };

      const finish = () => {
        if (closed) return;
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        closed = true;
        controller.close();
      };

      let streamedAnything = false;

      try {
        for (let round = 1; round <= MAX_TOOL_ROUNDS; round += 1) {
          const isFinalRound = round === MAX_TOOL_ROUNDS;

          // On the final round we keep the tool schema visible but forbid calling
          // it. Removing `tools` outright makes models that were mid-sequence
          // emit raw `<tool_call>` syntax as prose instead of answering.
          if (isFinalRound) {
            conversation.push({
              role: 'system',
              content:
                'You now have all the data you are going to get. Answer the user directly using the tool results above. Do not request any more tools.',
            });
          }

          const { response, model } = await callOpenRouter({
            apiKey,
            models,
            messages: conversation,
            toolChoice: isFinalRound ? 'none' : 'auto',
            referer,
          });

          if (round === 1) {
            send({ model }, 'meta');
          }

          const turn = await readModelStream(response, {
            onContent: (text) => {
              streamedAnything = true;
              send({ content: text });
            },
          });

          // `tool_choice: 'none'` is advisory with some providers, so on the final
          // round any tool calls are dropped rather than trusted.
          if (!turn.toolCalls.length || isFinalRound) {
            if (!streamedAnything) {
              send({ content: "I couldn't put together an answer for that. Please try rephrasing your question." });
            }
            finish();
            return;
          }

          // The model decided to call tools after emitting prose. That prose was
          // already streamed, so tell the client to discard it before the real answer.
          if (turn.content) {
            send({}, 'reset');
            streamedAnything = false;
          }

          send(
            {
              message: describeToolRun(turn.toolCalls),
              tools: turn.toolCalls.map((call) => call.function.name),
            },
            'status',
          );

          conversation.push({
            role: 'assistant',
            content: turn.content || null,
            tool_calls: turn.toolCalls,
          });

          for (const call of turn.toolCalls) {
            let toolArgs = {};
            try {
              toolArgs = JSON.parse(call.function.arguments || '{}');
            } catch {
              // Malformed arguments: run the tool with its defaults rather than failing.
            }
            const toolResult = await executeTool(call.function.name, toolArgs, db, userId);
            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify(toolResult),
            });
          }
        }

        finish();
      } catch (error) {
        send({ message: error.message || 'The assistant is unavailable right now.' }, 'error');
        finish();
      }
    },
  });
}

/**
 * Consume one OpenRouter SSE response, streaming prose out as it arrives and
 * reassembling any tool calls. Tool-call fragments are keyed by `index` because
 * providers send the id only on the first fragment of each parallel call.
 */
async function readModelStream(response, { onContent }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const byIndex = new Map();
  const gate = createToolSyntaxGate(onContent);

  const consume = (line) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return; // Partial or non-JSON keep-alive frame.
    }

    // OpenRouter can surface upstream failures inside the stream body.
    if (data.error) {
      throw new Error(data.error.message || 'Upstream model error');
    }

    const delta = data.choices?.[0]?.delta;
    if (!delta) return;

    if (Array.isArray(delta.tool_calls)) {
      for (const fragment of delta.tool_calls) {
        const index = fragment.index ?? byIndex.size;
        const existing = byIndex.get(index) || {
          id: fragment.id || `call_${index}`,
          type: 'function',
          function: { name: '', arguments: '' },
        };
        if (fragment.id) existing.id = fragment.id;
        if (fragment.function?.name) existing.function.name = fragment.function.name;
        if (fragment.function?.arguments) existing.function.arguments += fragment.function.arguments;
        byIndex.set(index, existing);
      }
    }

    if (delta.content) {
      content += delta.content;
      gate.push(delta.content);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      consume(line.trim());
    }
  }

  if (buffer.trim()) {
    consume(buffer.trim());
  }

  gate.flush();

  return {
    content: gate.text,
    toolCalls: [...byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, call]) => call)
      .filter((call) => call.function.name),
  };
}

/**
 * Some open models occasionally emit their tool-call syntax as plain text
 * instead of a structured `tool_calls` delta. Emitting that verbatim shows the
 * user `<tool_call><function=...>` gibberish, so hold back the opening tokens
 * until we can tell prose from a leaked tag, then drop the tag entirely.
 */
function createToolSyntaxGate(onContent) {
  const OPENERS = ['<tool_call', '<function=', '<tool▁call', '<|tool_call'];
  const CLOSERS = [/<\/tool_call>/, /<\/function>/, /<\/tool▁call>/];
  const LOOKAHEAD = 16;

  let pending = '';
  let decided = false;
  let suppressing = false;
  let text = '';

  const isPossibleOpener = (value) =>
    OPENERS.some((opener) => opener.startsWith(value) || value.startsWith(opener));

  const emit = (chunk) => {
    if (!chunk) return;
    text += chunk;
    onContent(chunk);
  };

  return {
    get text() {
      return text;
    },

    push(chunk) {
      if (suppressing) {
        pending += chunk;
        const closer = CLOSERS.find((pattern) => pattern.test(pending));
        if (!closer) return;
        // Tag closed — resume streaming whatever follows it.
        const rest = pending.split(closer)[1] || '';
        pending = '';
        suppressing = false;
        decided = true;
        emit(rest.replace(/^\s+/, ''));
        return;
      }

      if (decided) {
        emit(chunk);
        return;
      }

      pending += chunk;
      const probe = pending.trimStart();

      if (probe.length < LOOKAHEAD && isPossibleOpener(probe)) {
        return; // Still ambiguous — keep buffering.
      }

      if (OPENERS.some((opener) => probe.startsWith(opener))) {
        suppressing = true;
        return;
      }

      decided = true;
      const buffered = pending;
      pending = '';
      emit(buffered);
    },

    flush() {
      if (suppressing) {
        pending = '';
        return;
      }
      if (pending) {
        const buffered = pending;
        pending = '';
        emit(buffered);
      }
    },
  };
}

function describeToolRun(toolCalls) {
  const labels = [...new Set(toolCalls.map((call) => TOOL_LABELS[call.function.name] || 'data'))];
  if (labels.length === 1) return `Checking your ${labels[0]}…`;
  return `Checking your ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}…`;
}

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------

function resolveModels(env) {
  // OPENROUTER_MODEL accepts a single slug or a comma-separated fallback chain.
  const configured = (env.OPENROUTER_MODEL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...configured, ...DEFAULT_MODELS])];
}

async function callOpenRouter({ apiKey, models, messages, toolChoice, referer }) {
  let lastError = null;

  for (const model of models) {
    const payload = {
      model,
      messages,
      stream: true,
      tools: TOOLS,
      tool_choice: toolChoice || 'auto',
      // This assistant reports numbers back to the user, so keep sampling tight.
      temperature: 0.3,
      max_tokens: 1600,
    };

    let response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // OpenRouter attributes usage with these; they are optional but recommended.
          'HTTP-Referer': referer || 'https://lifeos.pages.dev',
          'X-Title': 'Life OS',
        },
        body: JSON.stringify(payload),
        // Free-tier models occasionally stall with no response at all. Bound
        // just the time-to-first-byte so a hung model fails over to the next
        // one in the chain instead of leaving the user staring at nothing.
        signal: AbortSignal.timeout(15000),
      });
    } catch (networkError) {
      lastError = networkError.name === 'TimeoutError' || networkError.name === 'AbortError'
        ? new Error(`${model} did not respond in time.`)
        : new Error(`Could not reach OpenRouter (${networkError.message}).`);
      continue;
    }

    if (response.ok && response.body) {
      return { response, model };
    }

    const detail = await response.text().catch(() => '');
    lastError = new Error(friendlyOpenRouterError(response.status, detail, model));
    console.error(`OpenRouter ${response.status} for ${model}: ${detail.slice(0, 500)}`);

    if (!FALLBACK_STATUSES.has(response.status)) {
      break; // 401/403/400 will fail identically on every model.
    }
  }

  throw lastError || new Error('No OpenRouter model is available.');
}

function friendlyOpenRouterError(status, detail, model) {
  if (status === 401) return 'The OpenRouter API key is invalid or expired.';
  if (status === 402) return 'This OpenRouter account is out of credits.';
  if (status === 429) return 'Rate limit reached on OpenRouter. Please try again in a moment.';
  if (status === 404) return `The model "${model}" is no longer available on OpenRouter.`;
  return `OpenRouter error ${status}: ${String(detail).slice(0, 200)}`;
}

/**
 * Keep only the fields the chat completions API accepts and drop client-side
 * bookkeeping (ids, timestamps, empty placeholder turns).
 */
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => message && typeof message.content === 'string' && message.content.trim())
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.content }));
}

// ---------------------------------------------------------------------------
// Tool execution — maps tool names to D1 queries
// ---------------------------------------------------------------------------

async function executeTool(toolName, args, db, userId) {
  try {
    switch (toolName) {
      case 'get_finance_summary':
        return await queryFinanceSummary(db, userId);
      case 'get_recent_transactions':
        return await queryRecentTransactions(db, userId, args);
      case 'get_pantry_summary':
        return await queryPantrySummary(db, userId);
      case 'get_subscriptions':
        return await querySubscriptions(db, userId);
      case 'get_important_dates':
        return await queryImportantDates(db, userId);
      case 'get_notes':
        return await queryNotes(db, userId);
      case 'get_car_summary':
        return await queryCarSummary(db, userId);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    // Log the real cause but hand the model a neutral message — otherwise raw
    // D1/SQL errors get relayed straight to the user in the answer.
    console.error(`Tool ${toolName} failed:`, error);
    return { error: `Could not read the user's ${TOOL_LABELS[toolName] || 'data'} right now.` };
  }
}

// ---------------------------------------------------------------------------
// Database query functions (lightweight wrappers using the same D1 queries)
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthBounds(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  const startDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    start: startDate.toISOString().slice(0, 10),
    nextStart: nextDate.toISOString().slice(0, 10),
  };
}

function daysBetween(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  return Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function formatMoney(amountMinor, currency = 'USD') {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

// -- Finance summary --

async function queryFinanceSummary(db, userId) {
  const now = today();
  const { start, nextStart } = monthBounds(now);

  // Monthly cashflow
  const cashflow = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_minor ELSE 0 END), 0) AS income_minor,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_minor ELSE 0 END), 0) AS expense_minor,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_minor ELSE 0 END), 0) AS refund_minor,
        COUNT(*) AS tx_count
      FROM finance_transactions
      WHERE user_id = ? AND status != 'deleted'
        AND occurred_on >= ? AND occurred_on < ?`,
    )
    .bind(userId, start, nextStart)
    .first();

  const income = Number(cashflow?.income_minor || 0);
  const expense = Math.max(0, Number(cashflow?.expense_minor || 0) - Number(cashflow?.refund_minor || 0));
  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

  // Spending by category
  const categoryResult = await db
    .prepare(
      `SELECT c.name, SUM(t.amount_minor) AS spent
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.status != 'deleted' AND t.type = 'expense'
        AND t.occurred_on >= ? AND t.occurred_on < ?
      GROUP BY c.name
      ORDER BY spent DESC LIMIT 10`,
    )
    .bind(userId, start, nextStart)
    .all();

  const categories = (categoryResult.results || []).map((r) => ({
    category: r.name || 'Uncategorized',
    spent: formatMoney(Number(r.spent || 0)),
  }));

  // Account balance
  const balRow = await db
    .prepare(
      `SELECT COALESCE(SUM(current_balance_minor), 0) AS bal
      FROM finance_accounts WHERE user_id = ? AND is_archived = 0`,
    )
    .bind(userId)
    .first();

  return {
    month: `${start} to ${nextStart}`,
    totalBalance: formatMoney(Number(balRow?.bal || 0)),
    monthlyIncome: formatMoney(income),
    monthlyExpenses: formatMoney(expense),
    netCashflow: formatMoney(net),
    savingsRate: `${savingsRate}%`,
    transactionCount: Number(cashflow?.tx_count || 0),
    spendingByCategory: categories,
  };
}

// -- Recent transactions --

async function queryRecentTransactions(db, userId, args = {}) {
  const limit = Math.min(args.limit || 10, 20);
  const binds = [userId];
  let typeFilter = '';

  if (args.type) {
    typeFilter = ' AND t.type = ?';
    binds.push(args.type);
  }

  const result = await db
    .prepare(
      `SELECT t.type, t.occurred_on, t.amount_minor, t.currency, t.merchant, t.payee, t.notes,
              c.name AS category_name
      FROM finance_transactions t
      LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.status != 'deleted'${typeFilter}
      ORDER BY t.occurred_on DESC, t.created_at DESC
      LIMIT ?`,
    )
    .bind(...binds, limit)
    .all();

  return {
    transactions: (result.results || []).map((r) => ({
      type: r.type,
      date: r.occurred_on,
      merchant: r.merchant || r.payee || 'Unknown',
      amount: formatMoney(Number(r.amount_minor || 0), r.currency || 'USD'),
      category: r.category_name || 'Uncategorized',
      notes: r.notes || null,
    })),
  };
}

// -- Pantry summary --

async function queryPantrySummary(db, userId) {
  const now = today();

  const itemsResult = await db
    .prepare(
      `SELECT name, category, quantity, unit, location, low_stock_threshold, expires_on, notes
      FROM pantry_items
      WHERE user_id = ? AND status != 'deleted'
      ORDER BY category ASC, name ASC`,
    )
    .bind(userId)
    .all();

  const items = (itemsResult.results || []).map((r) => ({
    name: r.name,
    category: r.category,
    quantity: Number(r.quantity || 0),
    unit: r.unit,
    location: r.location,
    expiresOn: r.expires_on,
    isLowStock: Number(r.quantity || 0) <= Number(r.low_stock_threshold || 0),
    isExpiringSoon: r.expires_on ? daysBetween(now, r.expires_on) <= 7 : false,
    daysUntilExpiry: r.expires_on ? daysBetween(now, r.expires_on) : null,
  }));

  const shoppingResult = await db
    .prepare(
      `SELECT name, quantity, unit, category FROM pantry_shopping_items
      WHERE user_id = ? AND status = 'open'
      ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all();

  return {
    totalItems: items.length,
    lowStockItems: items.filter((i) => i.isLowStock).map((i) => `${i.name} (${i.quantity} ${i.unit})`),
    expiringSoonItems: items.filter((i) => i.isExpiringSoon).map((i) => `${i.name} expires ${i.expiresOn} (${i.daysUntilExpiry} days)`),
    allItems: items.map((i) => `${i.name}: ${i.quantity} ${i.unit} [${i.category}]${i.location ? ` in ${i.location}` : ''}`),
    shoppingList: (shoppingResult.results || []).map((r) => `${r.name}${r.quantity ? ` x${r.quantity} ${r.unit || ''}`.trimEnd() : ''}${r.category ? ` [${r.category}]` : ''}`),
  };
}

// -- Subscriptions --

async function querySubscriptions(db, userId) {
  const now = today();
  const CADENCE_PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, custom: 1 };

  const result = await db
    .prepare(
      `SELECT * FROM subscriptions
      WHERE user_id = ? AND status != 'cancelled'
      ORDER BY next_renewal_on IS NULL, next_renewal_on ASC`,
    )
    .bind(userId)
    .all();

  const subs = (result.results || []).map((r) => ({
    name: r.name,
    provider: r.provider,
    category: r.category,
    amount: formatMoney(Number(r.amount_minor || 0), r.currency || 'USD'),
    cadence: r.cadence,
    nextRenewalOn: r.next_renewal_on,
    daysUntilRenewal: r.next_renewal_on ? daysBetween(now, r.next_renewal_on) : null,
    status: r.status,
  }));

  const activeSubs = subs.filter((s) => s.status === 'active');
  const monthlyTotal = Math.round(
    (result.results || [])
      .filter((r) => r.status === 'active')
      .reduce((sum, r) => sum + Number(r.amount_minor || 0) * (CADENCE_PER_MONTH[r.cadence] || 1), 0),
  );

  return {
    activeCount: activeSubs.length,
    estimatedMonthlyTotal: formatMoney(monthlyTotal),
    estimatedYearlyTotal: formatMoney(monthlyTotal * 12),
    subscriptions: subs,
    upcomingRenewals: subs.filter((s) => s.daysUntilRenewal !== null && s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= 30),
  };
}

// -- Important dates --

async function queryImportantDates(db, userId) {
  const now = today();

  const result = await db
    .prepare(
      `SELECT * FROM important_dates
      WHERE user_id = ? AND status = 'active'
      ORDER BY due_on ASC`,
    )
    .bind(userId)
    .all();

  const dates = (result.results || []).map((r) => {
    const nextOn = computeNextOccurrence(r.due_on, r.recurs, now);
    const daysUntil = nextOn ? daysBetween(now, nextOn) : null;
    return {
      title: r.title,
      category: r.category,
      person: r.person,
      nextDate: nextOn,
      daysUntil,
      recurs: r.recurs,
      notes: r.notes,
    };
  }).sort((a, b) => (a.daysUntil ?? 1e9) - (b.daysUntil ?? 1e9));

  return {
    totalCount: dates.length,
    upcoming: dates.filter((d) => d.daysUntil !== null && d.daysUntil >= 0 && d.daysUntil <= 60),
    overdue: dates.filter((d) => d.daysUntil !== null && d.daysUntil < 0),
    allDates: dates,
  };
}

function computeNextOccurrence(dueOn, recurs, now) {
  if (!dueOn) return null;
  if (recurs === 'none') return dueOn;

  const base = new Date(`${dueOn}T00:00:00Z`);
  const current = new Date(`${now}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return dueOn;

  const next = new Date(base.getTime());
  if (recurs === 'annual') {
    next.setUTCFullYear(current.getUTCFullYear());
    if (next < current) next.setUTCFullYear(current.getUTCFullYear() + 1);
  } else if (recurs === 'monthly') {
    next.setUTCFullYear(current.getUTCFullYear());
    next.setUTCMonth(current.getUTCMonth());
    if (next < current) next.setUTCMonth(current.getUTCMonth() + 1);
  }
  return next.toISOString().slice(0, 10);
}

// -- Notes --

async function queryNotes(db, userId) {
  const result = await db
    .prepare(
      `SELECT body, kind, tags_json, is_pinned, status, created_at
      FROM notes WHERE user_id = ? AND status != 'archived'
      ORDER BY is_pinned DESC, created_at DESC LIMIT 50`,
    )
    .bind(userId)
    .all();

  return {
    count: (result.results || []).length,
    notes: (result.results || []).map((r) => ({
      body: r.body,
      kind: r.kind,
      tags: parseJson(r.tags_json, []),
      isPinned: Number(r.is_pinned || 0) === 1,
      createdAt: r.created_at,
    })),
  };
}

// -- Car summary --

async function queryCarSummary(db, userId) {
  const now = today();

  const vehicleResult = await db
    .prepare(
      `SELECT name, make, model, year, odometer_miles, battery_percent,
              insurance_expires_on, registration_expires_on, warranty_expires_on
      FROM vehicles WHERE user_id = ? AND status != 'deleted'
      ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all();

  const vehicles = (vehicleResult.results || []).map((r) => ({
    name: r.name,
    make: r.make,
    model: r.model,
    year: r.year,
    odometerMiles: r.odometer_miles,
    batteryPercent: r.battery_percent,
    insuranceExpires: r.insurance_expires_on,
    registrationExpires: r.registration_expires_on,
    warrantyExpires: r.warranty_expires_on,
    insuranceDaysLeft: r.insurance_expires_on ? daysBetween(now, r.insurance_expires_on) : null,
    registrationDaysLeft: r.registration_expires_on ? daysBetween(now, r.registration_expires_on) : null,
  }));

  const maintenanceResult = await db
    .prepare(
      `SELECT m.title, m.due_date, m.priority, m.status, m.notes, v.name AS vehicle_name
      FROM vehicle_maintenance_items m
      LEFT JOIN vehicles v ON v.id = m.vehicle_id
      WHERE m.user_id = ? AND m.status IN ('open', 'scheduled')
      ORDER BY m.due_date ASC`,
    )
    .bind(userId)
    .all();

  return {
    vehicleCount: vehicles.length,
    vehicles,
    pendingMaintenance: (maintenanceResult.results || []).map((r) => ({
      title: r.title,
      vehicle: r.vehicle_name,
      dueDate: r.due_date,
      priority: r.priority,
      notes: r.notes,
    })),
  };
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(user) {
  const now = today();
  return `You are **Life OS AI**, the user's personal life management assistant. You have access to tools that can query the user's real data from their Life OS account.

Current date: ${now}
User's name: ${user.displayName || 'User'}

## Your Behavior
- When the user asks about their finances, pantry, subscriptions, vehicles, important dates, or notes, **always use the appropriate tools** to fetch their real data before answering.
- If a question spans several areas, request **every tool you need in the same turn** rather than one per turn.
- Present financial amounts clearly. Amounts are stored in minor units (cents/paise), and the tools return formatted values.
- Be concise but thorough. Use bullet points and bold text for readability.
- If the user asks a general knowledge question that doesn't need their personal data, answer directly without calling tools.
- Be warm and proactive — if you notice expiring items or overdue dates, mention them.
- Never make up data. If a tool returns empty results, say so honestly.
- Format monetary values as the tool returns them (e.g., "USD 150.00" or "INR 3,420.00").`;
}

// ---------------------------------------------------------------------------
// Authentication (mirrors [[path]].js logic)
// ---------------------------------------------------------------------------

async function authenticateUser(request, db, env) {
  // Check for Cloudflare Access header
  const accessEmail = request.headers.get('cf-access-authenticated-user-email');
  if (accessEmail) {
    return {
      userId: request.headers.get('cf-access-authenticated-user-id') || accessEmail,
      email: accessEmail,
      displayName: accessEmail.split('@')[0],
    };
  }

  // Check session cookie
  const sessionToken = readCookie(request, 'lifeos_session');
  if (sessionToken) {
    const sessionHash = await sha256Base64Url(sessionToken);
    const row = await db
      .prepare(
        `SELECT u.id, u.email, u.display_name, u.role
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
        LIMIT 1`,
      )
      .bind(sessionHash)
      .first();

    if (row) {
      if (row.role === 'suspended') {
        return { error: 'Your account has been suspended.' };
      }
      return {
        userId: row.id,
        email: row.email,
        displayName: row.display_name || row.email.split('@')[0],
      };
    }
  }

  // Check auth mode
  const authMode = env.AUTH_MODE || (env.REQUIRE_ACCESS === 'true' ? 'access' : 'demo');
  if (authMode === 'public' || authMode === 'access') {
    return { error: 'Please sign in to continue.' };
  }

  // Demo mode fallback
  const email = request.headers.get('x-user-email') || env.DEV_USER_EMAIL || 'demo@lifeos.local';
  return {
    userId: request.headers.get('x-user-id') || env.DEV_USER_ID || 'demo-user',
    email,
    displayName: email.split('@')[0],
  };
}

function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const arr = new Uint8Array(digest);
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
