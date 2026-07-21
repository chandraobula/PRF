import { useState } from 'react';
import {
  ArrowUp, ChevronDown, Copy, FileText, Menu, MoreHorizontal, Paperclip,
  Plus, RotateCcw, Sparkles, ThumbsDown, ThumbsUp,
} from 'lucide-react';

const prompts = [
  'Plan the rest of my day',
  'Summarize my weekly spending',
  'What should I focus on next?',
];

export default function AIAssistant() {
  const [message, setMessage] = useState('');

  return (
    <div className="ai-chat-shell h-full min-h-[calc(100dvh-184px)] lg:min-h-[calc(100dvh-144px)] max-w-[1160px] mx-auto flex overflow-hidden bg-surface-card lg:rounded-[24px] lg:border lg:border-border-subtle lg:shadow-[0_8px_32px_rgba(15,23,42,.05)]">
      <aside className="hidden xl:flex w-64 shrink-0 border-r border-border-subtle bg-surface-container-lowest flex-col p-3">
        <button className="min-h-11 px-3 flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-card text-sm font-semibold hover:bg-surface-container-low"><Plus className="w-4 h-4" /> New conversation</button>
        <p className="px-2 mt-6 mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-text-muted">Recent</p>
        <nav className="space-y-1 text-sm">
          <button className="w-full min-h-10 px-3 rounded-lg bg-surface-container-low text-left font-medium truncate">Plan today’s focus</button>
          <button className="w-full min-h-10 px-3 rounded-lg text-left text-on-surface-variant hover:bg-surface-container-low truncate">Weekly finance summary</button>
          <button className="w-full min-h-10 px-3 rounded-lg text-left text-on-surface-variant hover:bg-surface-container-low truncate">Meal ideas from pantry</button>
        </nav>
      </aside>

      <section className="min-w-0 flex-1 flex flex-col bg-surface-card">
        <header className="h-14 px-3 sm:px-5 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button className="icon-button xl:hidden" aria-label="Open conversations"><Menu className="w-5 h-5" /></button>
            <button className="min-h-10 flex items-center gap-1.5 rounded-lg px-2 font-display text-[15px] font-bold hover:bg-surface-container-low">LifeOS <span className="text-text-muted font-semibold">AI</span><ChevronDown className="w-4 h-4 text-text-muted" /></button>
          </div>
          <div className="flex items-center gap-1"><button className="icon-button" aria-label="New conversation"><Plus className="w-5 h-5" /></button><button className="icon-button" aria-label="Conversation options"><MoreHorizontal className="w-5 h-5" /></button></div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8">
          <div className="max-w-3xl mx-auto py-7 sm:py-10 space-y-8">
            <article className="chat-turn">
              <div className="chat-avatar bg-primary text-white"><Sparkles className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="chat-speaker">LifeOS AI</p>
                <div className="chat-copy">
                  <p>Good morning, John. You have a clear window at 2:00 PM today. I can turn it into a focused work block for your Q3 roadmap.</p>
                  <p>Would you like me to schedule it and protect that time from new meetings?</p>
                </div>
                <div className="chat-actions"><button aria-label="Copy response"><Copy /></button><button aria-label="Good response"><ThumbsUp /></button><button aria-label="Bad response"><ThumbsDown /></button><button aria-label="Regenerate response"><RotateCcw /></button></div>
              </div>
            </article>

            <article className="chat-turn">
              <div className="chat-avatar bg-secondary-fixed text-on-secondary-fixed">JD</div>
              <div className="min-w-0 flex-1"><p className="chat-speaker">You</p><div className="chat-copy"><p>Yes, schedule it. Also give me a quick summary of my spending this week.</p></div></div>
            </article>

            <article className="chat-turn">
              <div className="chat-avatar bg-primary text-white"><Sparkles className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="chat-speaker">LifeOS AI</p>
                <div className="chat-copy"><p>Done — your deep-work block is set for <strong>2:00–3:00 PM</strong>.</p><p>Your spending is healthy overall:</p>
                  <div className="my-3 grid sm:grid-cols-3 gap-2">
                    <div className="chat-data-card"><span>Groceries</span><strong>₹3,420</strong><small>On track</small></div>
                    <div className="chat-data-card"><span>Dining</span><strong>₹1,850</strong><small className="text-amber-600 dark:text-amber-300">12% over usual</small></div>
                    <div className="chat-data-card"><span>Subscriptions</span><strong>₹1,299</strong><small>3 renewals</small></div>
                  </div>
                  <p className="text-text-muted">You have spent ₹1,760 less than your weekly budget.</p>
                </div>
                <div className="chat-actions"><button aria-label="Copy response"><Copy /></button><button aria-label="Good response"><ThumbsUp /></button><button aria-label="Bad response"><ThumbsDown /></button><button aria-label="Regenerate response"><RotateCcw /></button></div>
              </div>
            </article>
          </div>
        </div>

        <footer className="shrink-0 px-3 sm:px-6 pb-3 sm:pb-5 bg-gradient-to-t from-white via-white to-white/0">
          <div className="max-w-3xl mx-auto">
            <div className="hidden sm:flex gap-2 mb-3 overflow-x-auto pb-1">
              {prompts.map(prompt => <button key={prompt} onClick={() => setMessage(prompt)} className="min-h-9 px-3 rounded-full border border-border-subtle bg-surface-card text-xs font-medium whitespace-nowrap hover:bg-surface-container-low">{prompt}</button>)}
            </div>
            <div className="chat-composer">
              <textarea value={message} onChange={event => setMessage(event.target.value)} rows="1" placeholder="Message LifeOS…" aria-label="Message LifeOS" className="flex-1 min-h-12 max-h-32 resize-none bg-transparent py-3 px-1 text-[16px] leading-6 outline-none placeholder:text-text-muted" />
              <div className="flex items-center justify-between">
                <div className="flex items-center"><button className="icon-button" aria-label="Attach a file"><Paperclip className="w-5 h-5" /></button><button className="min-h-10 px-2 flex items-center gap-1.5 rounded-lg text-xs font-semibold text-text-muted hover:bg-surface-container-low"><FileText className="w-4 h-4" /> Add context</button></div>
                <button className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:bg-surface-container-highest disabled:text-text-muted transition-colors" disabled={!message.trim()} aria-label="Send message"><ArrowUp className="w-5 h-5" /></button>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] leading-4 text-text-muted">LifeOS can make mistakes. Check important information.</p>
          </div>
        </footer>
      </section>
    </div>
  );
}
