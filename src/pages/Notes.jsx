import { useEffect, useState } from 'react';
import { Check, Inbox, Loader2, Pin, PinOff, Send, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { addNote, deleteNote, getNotes, resurfaceNotes, updateNote } from '../services/notesApi';

const KINDS = [
  { key: 'note', label: 'Note' },
  { key: 'idea', label: 'Idea' },
  { key: 'question', label: 'To check' },
];

const kindStyle = {
  note: 'bg-surface-container text-text-muted',
  idea: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  question: 'bg-ai-electric-blue/10 text-ai-electric-blue',
  follow_up: 'bg-ai-electric-blue/10 text-ai-electric-blue',
};

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [resurfaced, setResurfaced] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('note');
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getNotes();
      setNotes(data.notes || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    resurfaceNotes().then((data) => setResurfaced(data.items || [])).catch(() => {});
  }, []);

  const capture = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      await addNote({ body: body.trim(), kind });
      setBody('');
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (note) => { await updateNote(note.id, { isPinned: !note.isPinned }); await load(); };
  const markDone = async (id) => {
    await updateNote(id, { status: 'done' });
    setResurfaced((prev) => prev.filter((item) => item.id !== id));
    await load();
  };
  const remove = async (id) => {
    await deleteNote(id);
    setResurfaced((prev) => prev.filter((item) => item.id !== id));
    await load();
  };
  const dismissResurfaced = (id) => setResurfaced((prev) => prev.filter((item) => item.id !== id));

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="space-y-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Notes &amp; inbox</h1>
          <p className="font-body text-on-surface-variant">Dump anything here. Your second brain resurfaces it before you forget.</p>
        </div>

        <form onSubmit={capture} className="app-card p-3 sm:p-4">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') capture(event); }}
            rows={2}
            placeholder="Rattling noise in the car above 60mph… (⌘/Ctrl + Enter to save)"
            className="w-full resize-none rounded-xl border border-outline-variant bg-surface-card p-3 text-[15px] focus:border-secondary focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {KINDS.map((option) => (
                <button key={option.key} type="button" onClick={() => setKind(option.key)} className={cn('min-h-9 rounded-lg px-3 text-xs font-bold', kind === option.key ? 'bg-primary text-white' : 'bg-surface-container text-text-muted')}>{option.label}</button>
              ))}
            </div>
            <button type="submit" disabled={isSaving || !body.trim()} className="min-h-10 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Save
            </button>
          </div>
        </form>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      {resurfaced.length > 0 && (
        <section className="rounded-[20px] border border-ai-electric-blue/30 bg-ai-electric-blue/5 p-4">
          <div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-ai-electric-blue" /><h2 className="font-display text-lg font-bold text-on-surface">From your past notes</h2></div>
          <div className="space-y-2">
            {resurfaced.map((note) => (
              <div key={note.id} className="rounded-xl bg-surface-card border border-border-subtle p-3">
                <p className="text-sm font-semibold text-on-surface">{note.body}</p>
                <p className="mt-1 text-sm text-ai-electric-blue">{note.followUp}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-text-muted">{String(note.createdAt).slice(0, 10)}</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => markDone(note.id)} className="min-h-8 inline-flex items-center gap-1 rounded-lg bg-success-proactive/10 px-2.5 text-xs font-bold text-success-proactive"><Check className="h-3.5 w-3.5" /> Done</button>
                    <button type="button" onClick={() => dismissResurfaced(note.id)} className="min-h-8 rounded-lg bg-surface-container px-2.5 text-xs font-bold text-text-muted">Keep</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="app-card overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border-subtle"><Inbox className="h-5 w-5 text-text-muted" /><h2 className="section-title">Inbox</h2></div>
        <ul className="divide-y divide-border-subtle">
          {notes.map((note) => (
            <li key={note.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-on-surface whitespace-pre-wrap break-words">{note.body}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', kindStyle[note.kind] || kindStyle.note)}>{note.kind === 'question' ? 'to check' : note.kind}</span>
                  <span className="text-xs text-text-muted">{String(note.createdAt).slice(0, 10)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={() => togglePin(note)} className={cn('flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-container', note.isPinned ? 'text-secondary' : 'text-text-muted')} aria-label={note.isPinned ? 'Unpin' : 'Pin'}>{note.isPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}</button>
                <button type="button" onClick={() => markDone(note.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-success-proactive/10 hover:text-success-proactive" aria-label="Mark done"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(note.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-error/10 hover:text-error" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
          {!isLoading && notes.length === 0 && <li className="p-8 text-center text-sm text-text-muted">Inbox is empty. Capture your first thought above.</li>}
          {isLoading && <li className="p-8 text-center text-sm text-text-muted">Loading…</li>}
        </ul>
      </section>
    </div>
  );
}
