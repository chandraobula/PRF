import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

// ---------------------------------------------------------------------------
// A small, dependency-free Markdown renderer scoped to what the assistant emits:
// headings, lists, tables, code blocks, blockquotes, rules and inline styling.
// ---------------------------------------------------------------------------

export default function ChatMarkdown({ text }) {
  if (!text) return null;
  return <div className="chat-prose">{renderBlocks(text)}</div>;
}

function renderBlocks(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1; // closing fence
      blocks.push(<CodeBlock key={`code-${blocks.length}`} language={language} code={code.join('\n')} />);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-5 border-border-subtle" />);
      index += 1;
      continue;
    }

    // Table: | a | b |  followed by | --- | --- |
    if (trimmed.startsWith('|') && isTableDivider(lines[index + 1])) {
      const rows = [];
      const header = splitRow(trimmed);
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitRow(lines[index].trim()));
        index += 1;
      }
      blocks.push(<Table key={`table-${blocks.length}`} header={header} rows={rows} />);
      continue;
    }

    // Headings
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      const sizes = {
        1: 'mt-6 mb-3 text-[19px]',
        2: 'mt-6 mb-2.5 text-[17px]',
        3: 'mt-5 mb-2 text-[15px]',
        4: 'mt-4 mb-1.5 text-[14px]',
      };
      const Tag = `h${Math.min(level + 1, 6)}`;
      blocks.push(
        <Tag key={`h-${blocks.length}`} className={`font-display font-bold tracking-tight text-on-surface first:mt-0 ${sizes[level]}`}>
          {content}
        </Tag>,
      );
      index += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ') || trimmed === '>') {
      const quoted = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote key={`q-${blocks.length}`} className="my-3 border-l-2 border-primary/40 pl-4 text-on-surface-variant italic">
          {renderBlocks(quoted.join('\n'))}
        </blockquote>,
      );
      continue;
    }

    // Lists (unordered or ordered, with single-level nesting)
    if (isListItem(trimmed)) {
      const ordered = /^\d+[.)]\s/.test(trimmed);
      const items = [];
      while (index < lines.length && (isListItem(lines[index].trim()) || isNestedContinuation(lines[index], items.length))) {
        const current = lines[index];
        if (isListItem(current.trim())) {
          items.push({ indent: leadingSpaces(current), text: stripMarker(current.trim()) });
        } else if (items.length) {
          items[items.length - 1].text += `\n${current.trim()}`;
        }
        index += 1;
      }
      blocks.push(<List key={`list-${blocks.length}`} ordered={ordered} items={items} />);
      continue;
    }

    // Blank line
    if (!trimmed) {
      index += 1;
      continue;
    }

    // Paragraph — merge consecutive non-structural lines into one block.
    const paragraph = [];
    while (index < lines.length) {
      const candidate = lines[index];
      const candidateTrimmed = candidate.trim();
      if (
        !candidateTrimmed
        || isListItem(candidateTrimmed)
        || candidateTrimmed.startsWith('```')
        || candidateTrimmed.startsWith('>')
        || candidateTrimmed.startsWith('|')
        || /^#{1,4}\s/.test(candidateTrimmed)
      ) break;
      paragraph.push(candidateTrimmed);
      index += 1;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-2.5 first:mt-0 last:mb-0">
        {renderInline(paragraph.join(' '))}
      </p>,
    );
  }

  return blocks;
}

function List({ ordered, items }) {
  const baseIndent = Math.min(...items.map((item) => item.indent));
  const Tag = ordered ? 'ol' : 'ul';

  return (
    <Tag className={`my-2.5 space-y-1.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-text-muted`}>
      {items.map((item, i) => (
        <li key={i} className={item.indent > baseIndent ? 'ml-4' : ''}>
          {renderInline(item.text)}
        </li>
      ))}
    </Tag>
  );
}

function Table({ header, rows }) {
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-border-subtle">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="bg-surface-container-low">
            {header.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-on-surface whitespace-nowrap">
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border-subtle">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top text-on-surface-variant">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (insecure context) — nothing useful to show.
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border-subtle bg-surface-container-lowest">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success-proactive" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-6">
        <code className="font-mono text-on-surface">{code}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

const INLINE_RULES = [
  { pattern: /^`([^`]+)`/, render: (m, key) => <code key={key} className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-[13px] text-on-surface">{m[1]}</code> },
  { pattern: /^\[([^\]]+)\]\(([^)\s]+)\)/, render: (m, key) => <a key={key} href={m[2]} target="_blank" rel="noreferrer" className="font-medium text-secondary underline underline-offset-2 hover:opacity-80">{m[1]}</a> },
  { pattern: /^\*\*\*([^*]+)\*\*\*/, render: (m, key) => <strong key={key} className="font-semibold text-on-surface"><em>{m[1]}</em></strong> },
  { pattern: /^\*\*([\s\S]+?)\*\*/, render: (m, key) => <strong key={key} className="font-semibold text-on-surface">{m[1]}</strong> },
  { pattern: /^~~([\s\S]+?)~~/, render: (m, key) => <del key={key} className="text-text-muted">{m[1]}</del> },
  { pattern: /^(?:\*|_)([^*_\n]+)(?:\*|_)/, render: (m, key) => <em key={key}>{m[1]}</em> },
];

// Only these characters can begin an inline construct, so we jump between them
// instead of testing every rule at every character. This matters because the
// whole message re-renders on each streamed token.
const INLINE_TRIGGER = /[`*_~[\n]/;

function renderInline(text) {
  if (!text) return null;

  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length) {
    const triggerAt = remaining.search(INLINE_TRIGGER);

    if (triggerAt === -1) {
      parts.push(remaining);
      break;
    }

    if (triggerAt > 0) {
      parts.push(remaining.slice(0, triggerAt));
      remaining = remaining.slice(triggerAt);
      continue;
    }

    // Preserve hard line breaks inside a block.
    if (remaining[0] === '\n') {
      parts.push(<br key={key} />);
      key += 1;
      remaining = remaining.slice(1);
      continue;
    }

    const rule = INLINE_RULES.find((candidate) => candidate.pattern.test(remaining));

    if (rule) {
      const match = remaining.match(rule.pattern);
      parts.push(rule.render(match, key));
      key += 1;
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // A trigger character that opens nothing (e.g. a lone asterisk) is literal.
    parts.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isListItem(line) {
  return /^([-*+]|\d+[.)])\s+/.test(line);
}

function stripMarker(line) {
  return line.replace(/^([-*+]|\d+[.)])\s+/, '');
}

function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

function isNestedContinuation(line, itemCount) {
  return itemCount > 0 && line.startsWith('  ') && Boolean(line.trim());
}

function isTableDivider(line) {
  return Boolean(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

function splitRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}
