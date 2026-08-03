import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Check, Cloud, GripVertical, Highlighter, Italic, List, Loader2, Palette,
  Pin, Plus, Search, StickyNote, Strikethrough, Trash2, Type, Underline,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  createStickyNote, deleteStickyNote, getStickyNotes, reorderStickyNotes, updateStickyNote,
} from '../../services/stickyNotesApi';

// ---------------------------------------------------------------------------
// Paper palette.
//
// These live in JS, not as CSS modifier classes, and are applied as inline
// custom properties. Tailwind tree-shakes @layer rules it cannot find in the
// source, so a class name built as `sticky-note--${color}` was being stripped
// from the production bundle — which is why the colours never showed up.
// ---------------------------------------------------------------------------

const PALETTE = {
  yellow: { paper: '#FFF7A5', fold: '#F4E77C', ink: '#3B3413' },
  pink: { paper: '#FFD2E0', fold: '#F7B3C7', ink: '#4B1B2C' },
  blue: { paper: '#C8E8FF', fold: '#A4D6F7', ink: '#12314A' },
  green: { paper: '#CDEFC3', fold: '#ACDF9E', ink: '#1D3A15' },
  purple: { paper: '#E1D7FF', fold: '#C6B6F6', ink: '#2D1F52' },
  orange: { paper: '#FFDCB0', fold: '#F8C287', ink: '#4A2B0B' },
};

const COLORS = Object.keys(PALETTE);
const FONTS = ['hand', 'print', 'clean'];
const FONT_LABELS = { hand: 'Handwritten', print: 'Printed', clean: 'Clean' };

// Written out in full rather than interpolated: Tailwind only keeps @layer rules
// whose class names appear literally in the source. `sticky-font-${font}` would
// be invisible to the scanner and the typography would silently vanish in prod —
// the exact failure the paper colours hit.
const FONT_CLASS = {
  hand: 'sticky-font-hand',
  print: 'sticky-font-print',
  clean: 'sticky-font-clean',
};
const AUTOSAVE_DELAY = 700;

// Mirrors the server-side allowlist in functions/api/[[path]].js.
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark',
  'br', 'div', 'p', 'ul', 'ol', 'li',
]);
const DROP_ENTIRELY = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template']);

/**
 * Strip everything except the small formatting allowlist, and remove every
 * attribute. Assigning to a detached <template> parses without running scripts
 * or loading resources, so this is safe to do on untrusted markup.
 */
function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';

  const walk = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
      }

      const tag = node.tagName.toLowerCase();

      if (DROP_ENTIRELY.has(tag)) {
        node.remove();
        return;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Unwrap: the text is worth keeping, the element is not.
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        node.remove();
        return;
      }

      [...node.attributes].forEach((attr) => node.removeAttribute(attr.name));
      walk(node);
    });
  };

  walk(template.content);
  return template.innerHTML;
}

function isBlank(html) {
  return !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Deterministic tilt so the board reads as paper rather than a grid of divs. */
function tiltFor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 400) / 100) - 2;
}

export default function StickyBoard() {
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [savingIds, setSavingIds] = useState(() => new Set());
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const timers = useRef(new Map());

  useEffect(() => {
    let active = true;

    getStickyNotes('work')
      .then((data) => { if (active) setNotes(data); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load your notes.'); })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const markSaving = useCallback((id, saving) => {
    setSavingIds((current) => {
      const next = new Set(current);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const persist = useCallback(async (id, patch) => {
    markSaving(id, true);
    try {
      const saved = await updateStickyNote(id, patch);
      setNotes((current) => current.map((note) => (
        // Keep the local body: the caret lives in that DOM node, and we already
        // sanitised what we sent, so echoing the server copy back gains nothing.
        note.id === id ? { ...note, ...saved, body: note.body } : note
      )));
      setError('');
    } catch (saveError) {
      setError(saveError.message || 'Could not save that note.');
    } finally {
      markSaving(id, false);
    }
  }, [markSaving]);

  const scheduleSave = useCallback((id, patch) => {
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);

    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      persist(id, patch);
    }, AUTOSAVE_DELAY));
  }, [persist]);

  const editBody = useCallback((id, body) => {
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, body } : note)));
    scheduleSave(id, { body });
  }, [scheduleSave]);

  const addNote = async () => {
    const color = COLORS[notes.length % COLORS.length];
    try {
      const note = await createStickyNote({ board: 'work', body: '', color, font: 'hand' });
      setNotes((current) => [...current, note]);
      requestAnimationFrame(() => document.getElementById(`sticky-${note.id}`)?.focus());
    } catch (addError) {
      setError(addError.message || 'Could not add a note.');
    }
  };

  const removeNote = async (id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    const snapshot = notes;
    setNotes((current) => current.filter((note) => note.id !== id));

    try {
      await deleteStickyNote(id);
    } catch (deleteError) {
      setNotes(snapshot);
      setError(deleteError.message || 'Could not delete that note.');
    }
  };

  const cycle = (note, key, values) => {
    const next = values[(values.indexOf(note[key]) + 1) % values.length];
    setNotes((current) => current.map((item) => (item.id === note.id ? { ...item, [key]: next } : item)));
    persist(note.id, { [key]: next });
  };

  const togglePin = (note) => {
    const isPinned = !note.isPinned;
    setNotes((current) => current.map((item) => (item.id === note.id ? { ...item, isPinned } : item)));
    persist(note.id, { isPinned });
  };

  const handleDrop = async (targetId) => {
    setDragOverId(null);

    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }

    const from = notes.findIndex((note) => note.id === dragId);
    const to = notes.findIndex((note) => note.id === targetId);
    if (from < 0 || to < 0) return;

    const reordered = [...notes];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    setNotes(reordered);
    setDragId(null);

    try {
      await reorderStickyNotes(reordered.map((note) => note.id));
    } catch {
      // Ordering is cosmetic — not worth interrupting the user over.
    }
  };

  const search = query.trim().toLowerCase();
  const visible = useMemo(() => (
    search
      ? notes.filter((note) => note.body.replace(/<[^>]*>/g, ' ').toLowerCase().includes(search))
      : notes
  ), [notes, search]);

  const pinnedCount = notes.filter((note) => note.isPinned).length;

  return (
    <div className="sticky-board-shell">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title">Sticky board</h2>
          <p className="text-sm text-text-muted">
            {notes.length === 0
              ? 'Jot anything down — it saves itself'
              : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${pinnedCount ? ` · ${pinnedCount} pinned` : ''} · saved automatically`}
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface-card pl-9 pr-3 text-[14px]"
            />
          </div>
          <button
            type="button"
            onClick={addNote}
            className="min-h-11 shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New note
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

      {isLoading ? (
        <div className="flex min-h-[240px] items-center justify-center gap-3 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">Loading your board</span>
        </div>
      ) : (
        <div className="sticky-board">
          {visible.length === 0 && (
            <div className="col-span-full flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle p-8 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-low text-text-muted">
                <StickyNote className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-on-surface">
                {search ? 'No notes match that search' : 'Your board is empty'}
              </p>
              <p className="mt-1 max-w-xs text-sm text-text-muted">
                {search ? 'Try a different word.' : 'Add a note and start typing — everything saves on its own.'}
              </p>
              {!search && (
                <button type="button" onClick={addNote} className="mt-4 min-h-11 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white">
                  <Plus className="h-4 w-4" /> Add a note
                </button>
              )}
            </div>
          )}

          {visible.map((note) => (
            <StickyCard
              key={note.id}
              note={note}
              isSaving={savingIds.has(note.id)}
              isDragging={dragId === note.id}
              isDragOver={dragOverId === note.id}
              onChange={(body) => editBody(note.id, body)}
              onDelete={() => removeNote(note.id)}
              onCycleColor={() => cycle(note, 'color', COLORS)}
              onCycleFont={() => cycle(note, 'font', FONTS)}
              onTogglePin={() => togglePin(note)}
              onDragStart={() => setDragId(note.id)}
              onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              onDragOver={() => setDragOverId(note.id)}
              onDrop={() => handleDrop(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StickyCard({
  note, isSaving, isDragging, isDragOver, onChange, onDelete, onCycleColor,
  onCycleFont, onTogglePin, onDragStart, onDragEnd, onDragOver, onDrop,
}) {
  const editorRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeMarks, setActiveMarks] = useState({});
  // Dragging is armed from the grip only, so selecting text doesn't drag the note.
  const [dragArmed, setDragArmed] = useState(false);

  const paper = PALETTE[note.color] || PALETTE.yellow;
  const tilt = note.isPinned ? 0 : tiltFor(note.id);
  const blank = isBlank(note.body);

  // Seed the editor once. React must not own this subtree afterwards — writing
  // innerHTML on every render would reset the caret to the start on each keypress.
  useEffect(() => {
    const node = editorRef.current;
    if (node && node.innerHTML !== note.body) {
      node.innerHTML = note.body || '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const refreshMarks = useCallback(() => {
    if (typeof document.queryCommandState !== 'function') return;
    try {
      setActiveMarks({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      });
    } catch {
      // Older browsers throw when there is no active selection.
    }
  }, []);

  const emit = useCallback(() => {
    const node = editorRef.current;
    if (!node) return;
    onChange(sanitizeHtml(node.innerHTML));
    refreshMarks();
  }, [onChange, refreshMarks]);

  /**
   * execCommand is formally deprecated but remains the only API every browser
   * implements for rich-text editing in a contentEditable, and it is what the
   * native Cmd/Ctrl+B shortcuts already drive. styleWithCSS is forced off so we
   * get <b>/<i> tags rather than styled spans, which the sanitiser would strip.
   */
  const run = (command) => {
    editorRef.current?.focus();
    try {
      document.execCommand('styleWithCSS', false, false);
    } catch {
      // Not supported everywhere; the default is already what we want.
    }
    document.execCommand(command);
    emit();
  };

  const toggleHighlight = () => {
    const node = editorRef.current;
    if (!node) return;
    node.focus();

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);

    // Already highlighted? Unwrap it instead of nesting another <mark>.
    let ancestor = range.commonAncestorContainer;
    while (ancestor && ancestor !== node) {
      if (ancestor.nodeType === Node.ELEMENT_NODE && ancestor.tagName === 'MARK') {
        const parent = ancestor.parentNode;
        while (ancestor.firstChild) parent.insertBefore(ancestor.firstChild, ancestor);
        parent.removeChild(ancestor);
        emit();
        return;
      }
      ancestor = ancestor.parentNode;
    }

    const mark = document.createElement('mark');
    try {
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
      selection.removeAllRanges();
    } catch {
      // Selection spanned incompatible block boundaries — leave the text as-is.
      return;
    }
    emit();
  };

  // Paste as plain text: statement HTML from other apps is the main source of
  // junk markup, and the sanitiser would throw most of it away anyway.
  const handlePaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emit();
  };

  return (
    <article
      className={cn(
        'sticky-note',
        FONT_CLASS[note.font] || FONT_CLASS.hand,
        isDragging && 'opacity-40',
        isDragOver && 'sticky-note--dropzone',
      )}
      style={{
        '--sticky-tilt': `${tilt}deg`,
        '--sticky-paper': paper.paper,
        '--sticky-fold': paper.fold,
        '--sticky-ink': paper.ink,
        paddingTop: note.isPinned ? '1.35rem' : undefined,
      }}
      draggable={dragArmed}
      onDragStart={onDragStart}
      onDragEnd={() => { setDragArmed(false); onDragEnd(); }}
      onDragOver={(event) => { event.preventDefault(); onDragOver(); }}
      onDrop={(event) => { event.preventDefault(); setDragArmed(false); onDrop(); }}
    >
      {note.isPinned && <span className="sticky-note__pin" aria-hidden="true" />}

      <div className="sticky-note__toolbar">
        <span
          className="sticky-note__grip"
          aria-hidden="true"
          onMouseDown={() => setDragArmed(true)}
          onMouseUp={() => setDragArmed(false)}
        >
          <GripVertical className="h-4 w-4" />
        </span>

        <span className="sticky-note__status" aria-live="polite">
          {isSaving
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</>
            : <><Check className="h-3 w-3" /> Saved</>}
        </span>

        <div className="sticky-note__actions">
          <button type="button" onClick={onTogglePin} aria-label={note.isPinned ? 'Unpin note' : 'Pin note'} aria-pressed={note.isPinned}>
            <Pin className={cn('h-3.5 w-3.5', note.isPinned && 'fill-current')} />
          </button>
          <button type="button" onClick={onCycleFont} aria-label={`Typeface: ${FONT_LABELS[note.font] || 'Handwritten'}`} title={FONT_LABELS[note.font] || 'Handwritten'}>
            <Type className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onCycleColor} aria-label="Change paper colour">
            <Palette className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete note">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        id={`sticky-${note.id}`}
        ref={editorRef}
        className="sticky-note__body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Note text"
        data-placeholder="Write something…"
        data-empty={blank ? 'true' : 'false'}
        onInput={emit}
        onBlur={() => { setIsFocused(false); emit(); }}
        onFocus={() => { setIsFocused(true); refreshMarks(); }}
        onKeyUp={refreshMarks}
        onMouseUp={refreshMarks}
        onPaste={handlePaste}
      />

      {isFocused && (
        // onMouseDown is prevented so clicking a button never steals the caret
        // out of the editor — otherwise the command would have no selection.
        <div className="sticky-note__format" onMouseDown={(event) => event.preventDefault()}>
          <FormatButton label="Bold" active={activeMarks.bold} onClick={() => run('bold')}><Bold className="h-3.5 w-3.5" /></FormatButton>
          <FormatButton label="Italic" active={activeMarks.italic} onClick={() => run('italic')}><Italic className="h-3.5 w-3.5" /></FormatButton>
          <FormatButton label="Underline" active={activeMarks.underline} onClick={() => run('underline')}><Underline className="h-3.5 w-3.5" /></FormatButton>
          <FormatButton label="Strikethrough" active={activeMarks.strikeThrough} onClick={() => run('strikeThrough')}><Strikethrough className="h-3.5 w-3.5" /></FormatButton>
          <FormatButton label="Highlight" onClick={toggleHighlight}><Highlighter className="h-3.5 w-3.5" /></FormatButton>
          <FormatButton label="Bullet list" active={activeMarks.insertUnorderedList} onClick={() => run('insertUnorderedList')}><List className="h-3.5 w-3.5" /></FormatButton>
        </div>
      )}

      <p className="sticky-note__meta">
        <Cloud className="h-3 w-3" />
        {formatUpdated(note.updatedAt)}
      </p>
    </article>
  );
}

function FormatButton({ label, active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={Boolean(active)}>
      {children}
    </button>
  );
}

function formatUpdated(value) {
  if (!value) return 'Just now';

  // SQLite CURRENT_TIMESTAMP is UTC with no zone marker; say so explicitly.
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return 'Just now';

  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
