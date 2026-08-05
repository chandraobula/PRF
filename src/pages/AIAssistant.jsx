import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, CalendarClock, Car, Check, Copy, Plus, RotateCcw,
  Sparkles, Square, TriangleAlert, Wallet, ShoppingCart, CreditCard,
} from 'lucide-react';
import ChatMarkdown from '../components/ChatMarkdown';
import { streamChatMessage } from '../services/aiApi';
import { getCurrentAccount } from '../services/authApi';
import { cn } from '../lib/utils';

const SUGGESTIONS = [
  { icon: Wallet, label: 'Financial health check', prompt: 'Give me a financial health check for this month.' },
  { icon: ShoppingCart, label: "What's expiring in my pantry?", prompt: "What's expiring soon in my pantry, and what am I low on?" },
  { icon: CreditCard, label: 'Review my subscriptions', prompt: 'Show my active subscriptions and what they cost me each month.' },
  { icon: CalendarClock, label: 'Upcoming important dates', prompt: 'What important dates and deadlines are coming up?' },
  { icon: Car, label: 'Car maintenance due', prompt: 'Is anything due on my car — maintenance, insurance or registration?' },
  { icon: Sparkles, label: 'Where is my money going?', prompt: 'Summarize my spending this month by category and flag anything unusual.' },
];

let messageCounter = 0;
const nextId = () => {
  messageCounter += 1;
  return `m${messageCounter}`;
};

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function AIAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [isPinned, setIsPinned] = useState(true);
  const [userName, setUserName] = useState('');

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const messagesRef = useRef(messages);

  messagesRef.current = messages;
  const isEmpty = messages.length === 0;

  useEffect(() => {
    let active = true;
    getCurrentAccount()
      .then((result) => {
        if (active && result?.user) {
          setUserName(result.user.displayName || result.user.email?.split('@')[0] || '');
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // ---- scrolling -----------------------------------------------------------

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setIsPinned(distanceFromBottom < 80);
  }, []);

  // Follow the stream only while the user is parked at the bottom, so scrolling
  // up to re-read an earlier answer isn't yanked back down on every token.
  useLayoutEffect(() => {
    if (isPinned) scrollToBottom('auto');
  }, [messages, isPinned, scrollToBottom]);

  // ---- composer ------------------------------------------------------------

  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [input, isEmpty]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [isEmpty]);

  // ---- sending -------------------------------------------------------------

  const runStream = useCallback(async (history, prompt) => {
    const userMessage = { id: nextId(), role: 'user', content: prompt };
    const assistantId = nextId();
    const assistantMessage = { id: assistantId, role: 'assistant', content: '', status: '', tools: [] };

    setMessages([...history, userMessage, assistantMessage]);
    setInput('');
    setError('');
    setIsStreaming(true);
    setIsPinned(true);

    const patchAssistant = (patch) => {
      setMessages((current) => current.map((message) => (
        message.id === assistantId ? { ...message, ...patch(message) } : message
      )));
    };

    // Tokens can arrive far faster than the display refreshes. Buffering them
    // and committing at most once per animation frame keeps the number of
    // full-message re-renders (and ChatMarkdown re-parses) tied to frame rate
    // instead of token rate, which is what actually made streaming feel janky.
    let pendingContent = '';
    let rafId = null;

    const flushContent = () => {
      rafId = null;
      if (!pendingContent) return;
      const toApply = pendingContent;
      pendingContent = '';
      patchAssistant((message) => ({ content: message.content + toApply, status: '' }));
    };

    const queueContent = (chunk) => {
      pendingContent += chunk;
      if (rafId == null) {
        rafId = requestAnimationFrame(flushContent);
      }
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = [...history, userMessage].map(({ role, content }) => ({ role, content }));

      await streamChatMessage(payload, {
        signal: controller.signal,
        onContent: queueContent,
        onStatus: (message, tools) => {
          // A status chip means this round has no content pending yet — flush
          // immediately so it isn't held behind the next animation frame.
          flushContent();
          patchAssistant(() => ({ status: message, tools }));
        },
        onReset: () => {
          pendingContent = '';
          if (rafId != null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          patchAssistant(() => ({ content: '' }));
        },
      });
    } catch (streamError) {
      flushContent();
      if (streamError.name === 'AbortError') {
        patchAssistant((message) => ({ status: '', stopped: !message.content }));
      } else {
        setError(streamError.message || 'Something went wrong. Please try again.');
        patchAssistant(() => ({ status: '', failed: true }));
      }
    } finally {
      flushContent();
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const sendMessage = useCallback((text) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed || isStreaming) return;
    runStream(messagesRef.current, trimmed);
  }, [isStreaming, runStream]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    if (isStreaming) return;
    const current = messagesRef.current;
    const lastUserIndex = current.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex < 0) return;
    runStream(current.slice(0, lastUserIndex), current[lastUserIndex].content);
  }, [isStreaming, runStream]);

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
    setError('');
    setIsPinned(true);
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage(input);
    }
    if (event.key === 'Escape' && isStreaming) {
      event.preventDefault();
      stopStreaming();
    }
  };

  // Stable identity so React.memo can skip already-finished turns while the
  // newest answer streams in.
  const handleCopy = useCallback(async (content, id) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard unavailable — silently skip rather than interrupting the chat.
    }
  }, []);

  const composer = (
    <Composer
      textareaRef={textareaRef}
      value={input}
      onChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={() => sendMessage(input)}
      onStop={stopStreaming}
      isStreaming={isStreaming}
    />
  );

  return (
    <div className="ai-chat-shell">
      {!isEmpty && (
        <div className="chat-topbar">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success-proactive" />
            Connected to your Life OS data
          </span>
          <button type="button" onClick={startNewChat} className="chat-ghost-button">
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>
      )}

      <div ref={scrollRef} onScroll={handleScroll} className="chat-scroll">
        {isEmpty ? (
          <div className="chat-empty mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
                <Sparkles className="h-7 w-7" />
              </div>
              <h1 className="font-display text-[28px] font-bold tracking-tight text-on-surface sm:text-[32px]">
                {greeting()}{userName ? `, ${userName}` : ''}
              </h1>
              <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-text-muted">
                Ask about your money, pantry, subscriptions, car or upcoming dates — answers come from your real Life OS data.
              </p>
            </div>

            {composer}

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="group flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3 text-left transition-all hover:border-primary/30 hover:shadow-ambient active:scale-[.99]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] font-medium text-on-surface">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
            <div className="space-y-7">
              {messages.map((message, index) => (
                message.role === 'user' ? (
                  <UserTurn key={message.id} content={message.content} />
                ) : (
                  <AssistantTurn
                    key={message.id}
                    message={message}
                    isLast={index === messages.length - 1}
                    isStreaming={isStreaming}
                    copied={copiedId === message.id}
                    onCopy={handleCopy}
                    onRegenerate={regenerate}
                  />
                )
              ))}

              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-error/25 bg-error/5 px-4 py-3 text-[14px] text-error">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">Couldn't get an answer</p>
                    <p className="mt-0.5 break-words text-on-surface-variant">{error}</p>
                    <button type="button" onClick={regenerate} className="mt-2 text-[13px] font-semibold text-secondary hover:underline">
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!isEmpty && (
        <div className="chat-footer">
          {!isPinned && (
            <button
              type="button"
              onClick={() => { setIsPinned(true); scrollToBottom('smooth'); }}
              aria-label="Scroll to latest message"
              className="absolute -top-11 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-on-surface shadow-ambient transition-transform hover:scale-105"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            {composer}
            <p className="mt-2 text-center text-[11px] leading-4 text-text-muted">
              Life OS AI can make mistakes. Double-check anything important.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

const UserTurn = memo(function UserTurn({ content }) {
  return (
    <article className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-surface-container-high px-4 py-2.5 text-[15px] leading-6 text-on-surface sm:max-w-[75%]">
        {content}
      </div>
    </article>
  );
});

const AssistantTurn = memo(function AssistantTurn({ message, isLast, isStreaming, copied, onCopy, onRegenerate }) {
  const live = isLast && isStreaming;
  const showThinking = live && !message.content;
  const showActions = Boolean(message.content) && !live;

  return (
    <article className="chat-turn chat-turn-enter">
      <div className="chat-avatar bg-primary text-white">
        <Sparkles className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="chat-speaker">Life OS AI</p>

        {(message.status || showThinking) && (
          <div className="mb-2 flex items-center gap-2.5 text-[13px] font-medium text-text-muted">
            <span className="chat-dots" aria-hidden="true"><i /><i /><i /></span>
            <span>{message.status || 'Thinking…'}</span>
          </div>
        )}

        {message.content && (
          <div className={cn('chat-copy', live && 'chat-copy-live')}>
            <ChatMarkdown text={message.content} />
          </div>
        )}

        {message.stopped && !message.content && (
          <p className="text-[14px] italic text-text-muted">Stopped.</p>
        )}

        {showActions && (
          <div className="chat-actions">
            <button
              type="button"
              onClick={() => onCopy(message.content, message.id)}
              aria-label={copied ? 'Copied' : 'Copy response'}
            >
              {copied ? <Check className="text-success-proactive" /> : <Copy />}
            </button>
            <button type="button" onClick={onRegenerate} aria-label="Regenerate response">
              <RotateCcw />
            </button>
          </div>
        )}
      </div>
    </article>
  );
});

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({ textareaRef, value, onChange, onKeyDown, onSend, onStop, isStreaming }) {
  const canSend = Boolean(value.trim()) && !isStreaming;

  return (
    <div className="chat-composer">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Ask about your finances, pantry, car…"
        aria-label="Message Life OS AI"
        className="chat-composer-input"
      />

      <div className="flex items-end justify-between gap-2 pl-1">
        <p className="pb-1 text-[11px] leading-4 text-text-muted">
          <kbd className="chat-kbd">Enter</kbd> to send · <kbd className="chat-kbd">Shift</kbd>+<kbd className="chat-kbd">Enter</kbd> for a new line
        </p>

        {isStreaming ? (
          <button type="button" onClick={onStop} aria-label="Stop generating" className="chat-send-button bg-surface-container-highest text-on-surface hover:opacity-90">
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className="chat-send-button bg-primary text-white hover:opacity-90 disabled:bg-surface-container-highest disabled:text-text-muted"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
