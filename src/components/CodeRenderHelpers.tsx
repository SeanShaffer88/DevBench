import React from 'react';

const KEYWORD_SET = new Set([
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'async', 'await', 'return',
  'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally',
  'interface', 'type', 'class', 'extends', 'implements', 'public', 'private', 'protected',
  'static', 'readonly', 'new', 'true', 'false', 'null', 'undefined', 'namespace', 'using',
  'fn', 'pub', 'struct', 'enum', 'impl', 'match', 'mut', 'def', 'elif', 'SELECT', 'FROM', 'WHERE',
]);

function highlightLineTokens(line: string): React.ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('<!--') || trimmed.startsWith(';')) {
    return [
      <span key="cmt" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        {line}
      </span>,
    ];
  }

  // Tokenize strings, XML tags, numbers, identifiers, and punctuation
  const tokenRegex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|<\/?[A-Za-z0-9:._-]+|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const tok = match[0];
    if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) {
      parts.push(
        <span key={keyIdx++} style={{ color: 'var(--success)' }}>
          {tok}
        </span>
      );
    } else if (tok.startsWith('<')) {
      parts.push(
        <span key={keyIdx++} style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {tok}
        </span>
      );
    } else if (/^\d/.test(tok)) {
      parts.push(
        <span key={keyIdx++} style={{ color: 'var(--warning)' }}>
          {tok}
        </span>
      );
    } else if (KEYWORD_SET.has(tok)) {
      parts.push(
        <span key={keyIdx++} style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {tok}
        </span>
      );
    } else {
      parts.push(tok);
    }
    lastIndex = match.index + tok.length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [line];
}

export const SyntaxHighlightedView: React.FC<{
  content: string;
  focusedLine?: number;
}> = ({ content, focusedLine }) => {
  const lines = content.split(/\r?\n/);
  return (
    <div
      className="card-elevated code-editor-area"
      style={{ maxHeight: '54vh', overflow: 'auto', padding: '8px 0' }}
    >
      {lines.map((line, idx) => {
        const lineNo = idx + 1;
        const isFocused = focusedLine === lineNo;
        return (
          <div
            key={lineNo}
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr',
              padding: '0 12px 0 6px',
              background: isFocused ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            <span
              className="muted"
              style={{ textAlign: 'right', paddingRight: 12, userSelect: 'none', fontSize: '0.78rem' }}
            >
              {lineNo}
            </span>
            <span style={{ whiteSpace: 'pre' }}>{highlightLineTokens(line)}</span>
          </div>
        );
      })}
    </div>
  );
};

export const MarkdownPreviewView: React.FC<{ markdown: string }> = ({ markdown }) => {
  const lines = markdown.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="card-elevated mono"
            style={{ fontSize: '0.8rem', overflowX: 'auto', margin: '8px 0' }}
          >
            {codeLines.join('\n')}
          </pre>
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={i} style={{ margin: '10px 0 6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 4 }}>
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} style={{ margin: '12px 0 4px', color: 'var(--accent)' }}>
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} style={{ margin: '8px 0 4px' }}>
          {line.slice(4)}
        </h4>
      );
    } else if (line.startsWith('---')) {
      elements.push(
        <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }} />
      );
    } else if (/^\s*-\s+\[[ xX]\]/.test(line)) {
      const checked = /\[[xX]\]/.test(line);
      const label = line.replace(/^\s*-\s+\[[ xX]\]\s*/, '');
      elements.push(
        <div key={i} className="flex-row" style={{ margin: '3px 0' }}>
          <input type="checkbox" checked={checked} readOnly />
          <span>{label}</span>
        </div>
      );
    } else if (line.trim().startsWith('- ') || /^\d+\.\s+/.test(line.trim())) {
      elements.push(
        <div key={i} style={{ paddingLeft: 14, margin: '2px 0' }}>
          • {line.trim().replace(/^(?:-\s+|\d+\.\s+)/, '')}
        </div>
      );
    } else if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (/^\|[\s:-]+\|/.test(line.trim())) continue;
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      elements.push(
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
            gap: 8,
            padding: '5px 8px',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '0.84rem',
          }}
        >
          {cells.map((cell, cIdx) => (
            <span key={cIdx}>{cell.replace(/\*\*/g, '').replace(/`/g, '')}</span>
          ))}
        </div>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={i} style={{ margin: '5px 0', fontSize: '0.9rem' }}>
          {line}
        </p>
      );
    }
  }

  return (
    <div className="card-elevated" style={{ maxHeight: '54vh', overflowY: 'auto', padding: '12px 16px' }}>
      {elements}
    </div>
  );
};
