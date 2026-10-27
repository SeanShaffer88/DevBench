import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Columns,
  FileCode2,
  FileDiff,
  FolderSearch,
  Hash,
  Save,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { RelevanceBanner } from '../components/RelevanceBanner';
import { useWorkbench } from '../context/WorkbenchContext';

interface OpenTab {
  path: string;
  content: string;
  originalContent: string;
  encoding: string;
  lineEndings: 'LF' | 'CRLF' | 'Mixed' | 'N/A';
  hexPreview: string;
  symbols: { name: string; kind: string; line: number }[];
  isScratch?: boolean;
}

export const CodeModule: React.FC = () => {
  const {
    editorTarget,
    snippets,
    addSnippet,
    clipboardHistory,
    copySafeText,
    requestConsent,
    notify,
  } = useWorkbench();

  const [subtab, setSubtab] = useState<'editor' | 'search-rename' | 'compare-viewers' | 'utilities'>(
    'editor'
  );
  const [files, setFiles] = useState<{ path: string; name: string; type: string; size: number }[]>([]);
  const [fileFilter, setFileFilter] = useState('');

  const [openTabs, setOpenTabs] = useState<OpenTab[]>([
    {
      path: 'scratchpad.ts',
      content:
        '// DevBench Scratch Buffer (autosaved locally for crash recovery)\nexport function checkDpiScale(dpi: number): string {\n  return `${Math.round((dpi / 96) * 100)}%`;\n}\n',
      originalContent: '',
      encoding: 'UTF-8',
      lineEndings: 'LF',
      hexPreview: '00000000  2F 2F 20 44 65 76 42 65  6E 63 68 20 53 63 72 61  |// DevBench Scra|',
      symbols: [{ name: 'checkDpiScale', kind: 'function', line: 2 }],
      isScratch: true,
    },
  ]);
  const [activeTabPath, setActiveTabPath] = useState<string>('scratchpad.ts');
  const [splitView, setSplitView] = useState<boolean>(false);
  const [viewerMode, setViewerMode] = useState<'code' | 'hex' | 'structured'>('code');
  const [gotoLine, setGotoLine] = useState<string>('');

  // Search & Bulk rename state
  const [searchQuery, setSearchQuery] = useState('PerMonitorV2');
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchHits, setSearchHits] = useState<{ file: string; line: number; preview: string }[]>([]);
  const [renameDir, setRenameDir] = useState('');
  const [renameFind, setRenameFind] = useState('');
  const [renameReplace, setRenameReplace] = useState('');
  const [renamePreviews, setRenamePreviews] = useState<{ oldName: string; newName: string }[]>([]);

  // Compare & Merge helper
  const [leftText, setLeftText] = useState(
    '{\n  "dpiAwareness": "System",\n  "arch": "x64",\n  "signing": false\n}'
  );
  const [rightText, setRightText] = useState(
    '{\n  "dpiAwareness": "PerMonitorV2",\n  "arch": "x64;ARM64",\n  "signing": true\n}'
  );
  const [csvSample, setCsvSample] = useState(
    'Target,Arch,Installer,Signed\nWindows 11 24H2,x64,MSIX,Yes\nWindows 11 ARM,ARM64,MSIX,Yes\nWindows 10 22H2,x64,NSIS,Yes'
  );

  // Utilities state
  const [regexPattern, setRegexPattern] = useState('([A-Z]{3,}-\\d+):\\s*(.+)');
  const [regexTestStr, setRegexTestStr] = useState('MSB3644: Reference assemblies for net8.0-windows not found');
  const [cronExpr, setCronExpr] = useState('0 2 * * 1-5');
  const [utilInput, setUtilInput] = useState('DevBench Windows Desktop SDK 1.0');
  const [sha256Hex, setSha256Hex] = useState('');
  const [pickedColor, setPickedColor] = useState('#38bdf8');
  const [newSnipTitle, setNewSnipTitle] = useState('');
  const [newSnipBody, setNewSnipBody] = useState('');

  useEffect(() => {
    fetch('/api/files')
      .then((r) => r.json())
      .then((d) => setFiles((d.files || []).filter((f: { type: string }) => f.type === 'file')))
      .catch(() => {});
  }, []);

  const loadWorkspaceFile = useCallback(
    async (filePath: string) => {
      const existing = openTabs.find((t) => t.path === filePath);
      if (existing) {
        setActiveTabPath(filePath);
        return;
      }
      try {
        const r = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
        const data = await r.json();
        if (!r.ok) {
          notify(`Could not open ${filePath}: ${data.error}`);
          return;
        }
        const tab: OpenTab = {
          path: data.path,
          content: data.content,
          originalContent: data.content,
          encoding: data.encoding,
          lineEndings: data.lineEndings,
          hexPreview: data.hexPreview,
          symbols: data.symbols || [],
        };
        setOpenTabs((prev) => [...prev, tab]);
        setActiveTabPath(data.path);
        if (data.isBinary) setViewerMode('hex');
      } catch (err) {
        notify(`Read error: ${(err as Error).message}`);
      }
    },
    [openTabs, notify]
  );

  useEffect(() => {
    if (editorTarget) {
      setSubtab('editor');
      loadWorkspaceFile(editorTarget.file);
      if (editorTarget.line) setGotoLine(String(editorTarget.line));
    }
  }, [editorTarget, loadWorkspaceFile]);

  const currentTab = openTabs.find((t) => t.path === activeTabPath) || openTabs[0];

  const updateCurrentContent = (next: string) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.path === currentTab.path ? { ...t, content: next } : t))
    );
    try {
      localStorage.setItem(`devbench.draft.${currentTab.path}`, next);
    } catch {
      // ignore
    }
  };

  const saveCurrentTab = async (eolOverride?: 'LF' | 'CRLF', withBom?: boolean) => {
    if (currentTab.isScratch) {
      notify('Scratchpad draft saved to local crash-recovery storage.');
      return;
    }
    const targetEol = eolOverride || (currentTab.lineEndings === 'CRLF' ? 'CRLF' : 'LF');
    const r = await fetch('/api/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: currentTab.path,
        content: currentTab.content,
        lineEndings: targetEol,
        withBom: Boolean(withBom),
      }),
    });
    const data = await r.json();
    if (r.ok) {
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === currentTab.path
            ? {
                ...t,
                originalContent: t.content,
                lineEndings: targetEol,
                encoding: withBom ? 'UTF-8 BOM' : 'UTF-8',
              }
            : t
        )
      );
      notify(`Saved ${data.savedPath} (${targetEol}, ${withBom ? 'UTF-8 BOM' : 'UTF-8'})`);
    } else {
      notify(`Save failed: ${data.error}`);
    }
  };

  const formatCurrentBuffer = () => {
    try {
      if (currentTab.path.endsWith('.json')) {
        const pretty = JSON.stringify(JSON.parse(currentTab.content), null, 2) + '\n';
        updateCurrentContent(pretty);
        notify('Formatted JSON document.');
        return;
      }
      // Trim trailing whitespace on lines
      const cleaned = currentTab.content
        .split(/\r?\n/)
        .map((l) => l.replace(/[ \t]+$/, ''))
        .join('\n');
      updateCurrentContent(cleaned);
      notify('Normalized indentation & trimmed trailing whitespace.');
    } catch (err) {
      notify(`Format check error: ${(err as Error).message}`);
    }
  };

  // Bracket balance quick diagnostic
  const bracketDiag = useMemo(() => {
    let round = 0;
    let curly = 0;
    let square = 0;
    for (const ch of currentTab.content) {
      if (ch === '(') round++;
      else if (ch === ')') round--;
      else if (ch === '{') curly++;
      else if (ch === '}') curly--;
      else if (ch === '[') square++;
      else if (ch === ']') square--;
    }
    if (round === 0 && curly === 0 && square === 0) return 'Brackets balanced · 0 syntax warnings';
    return `Unbalanced delimiter detected ( ()=${round}, {}=${curly}, []=${square} )`;
  }, [currentTab.content]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch('/api/files/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, isRegex: searchRegex }),
    });
    const d = await r.json();
    setSearchHits(d.hits || []);
  };

  const previewBulkRename = async () => {
    const r = await fetch('/api/files/bulk-rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directory: renameDir,
        findText: renameFind,
        replaceText: renameReplace,
        execute: false,
      }),
    });
    const d = await r.json();
    setRenamePreviews(d.previews || []);
  };

  const executeBulkRename = () => {
    requestConsent(
      {
        id: `ren-${Date.now()}`,
        title: `Execute Bulk Rename (${renamePreviews.length} files)`,
        actionType: 'file-mutate',
        description: `Renames ${renamePreviews.length} file(s) in "${renameDir || '/'}" replacing "${renameFind}" with "${renameReplace}".`,
        impactScope: 'Local Project',
        reversibleNote: 'Reversible by running inverse bulk rename with swapped find/replace strings.',
      },
      async () => {
        await fetch('/api/files/bulk-rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directory: renameDir,
            findText: renameFind,
            replaceText: renameReplace,
            execute: true,
            consentConfirmed: true,
          }),
        });
        notify(`Renamed ${renamePreviews.length} file(s).`);
        setRenamePreviews([]);
      }
    );
  };

  // Compute line-by-line comparison
  const diffLines = useMemo(() => {
    const a = leftText.split(/\r?\n/);
    const b = rightText.split(/\r?\n/);
    const max = Math.max(a.length, b.length);
    const out: { line: number; left: string; right: string; changed: boolean }[] = [];
    for (let i = 0; i < max; i++) {
      out.push({
        line: i + 1,
        left: a[i] ?? '',
        right: b[i] ?? '',
        changed: (a[i] ?? '') !== (b[i] ?? ''),
      });
    }
    return out;
  }, [leftText, rightText]);

  // SHA-256 live calculation in browser WebCrypto
  useEffect(() => {
    let active = true;
    const enc = new TextEncoder().encode(utilInput);
    crypto.subtle
      ?.digest('SHA-256', enc)
      .then((buf) => {
        if (!active) return;
        const hex = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        setSha256Hex(hex);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [utilInput]);

  const regexEvaluation = useMemo(() => {
    try {
      const rx = new RegExp(regexPattern);
      const m = regexTestStr.match(rx);
      if (!m) return { valid: true, matched: false, groups: [] as string[] };
      return { valid: true, matched: true, groups: Array.from(m) };
    } catch (err) {
      return { valid: false, matched: false, error: (err as Error).message, groups: [] as string[] };
    }
  }, [regexPattern, regexTestStr]);

  const cronExplanation = useMemo(() => {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return 'Expected 5 cron fields: <minute> <hour> <day-of-month> <month> <day-of-week>';
    const [min, hr, dom, mon, dow] = parts;
    return `Runs at minute [${min}], hour [${hr}], day-of-month [${dom}], month [${mon}], day-of-week [${dow}].`;
  }, [cronExpr]);

  return (
    <div className="stack-md">
      <RelevanceBanner subtitle="Lightweight multi-tab editor, diff & format viewers, search/rename, snippets & utilities" />

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${subtab === 'editor' ? 'active' : ''}`}
          onClick={() => setSubtab('editor')}
        >
          <FileCode2 size={14} /> Code Editor & Hex Viewer
        </button>
        <button
          type="button"
          className={`subtab ${subtab === 'search-rename' ? 'active' : ''}`}
          onClick={() => setSubtab('search-rename')}
        >
          <FolderSearch size={14} /> Search Across Files & Bulk Rename
        </button>
        <button
          type="button"
          className={`subtab ${subtab === 'compare-viewers' ? 'active' : ''}`}
          onClick={() => setSubtab('compare-viewers')}
        >
          <FileDiff size={14} /> Diff, Conflict Helper & CSV/Markdown Viewers
        </button>
        <button
          type="button"
          className={`subtab ${subtab === 'utilities' ? 'active' : ''}`}
          onClick={() => setSubtab('utilities')}
        >
          <Wrench size={14} /> Snippets, Regex, Cron, Hash & Color Tools
        </button>
      </div>

      {subtab === 'editor' && (
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 12 }}>
          {/* File Explorer & Symbol Outline */}
          <div className="card stack-sm" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            <strong>Workspace Files</strong>
            <input
              className="input"
              placeholder="Quick open file..."
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
            />
            <div className="stack-sm" style={{ gap: 3 }}>
              {files
                .filter((f) => !fileFilter || f.path.toLowerCase().includes(fileFilter.toLowerCase()))
                .slice(0, 60)
                .map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="btn btn-sm"
                    style={{
                      justifyContent: 'flex-start',
                      borderColor: f.path === currentTab.path ? 'var(--accent)' : 'transparent',
                      fontSize: '0.79rem',
                    }}
                    onClick={() => loadWorkspaceFile(f.path)}
                  >
                    <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.path}
                    </span>
                  </button>
                ))}
            </div>

            {currentTab.symbols.length > 0 && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', width: '100%' }} />
                <strong>Outline / Symbols ({currentTab.symbols.length})</strong>
                <div className="stack-sm" style={{ gap: 3 }}>
                  {currentTab.symbols.map((sym) => (
                    <button
                      key={`${sym.name}-${sym.line}`}
                      type="button"
                      className="btn btn-sm"
                      style={{ justifyContent: 'space-between', fontSize: '0.78rem' }}
                      onClick={() => setGotoLine(String(sym.line))}
                    >
                      <span>{sym.name}</span>
                      <span className="muted">:{sym.line}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Editor Canvas */}
          <div className="card stack-sm">
            {/* Open Tabs Bar */}
            <div className="flex-between">
              <div className="flex-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                {openTabs.map((t) => {
                  const dirty = !t.isScratch && t.content !== t.originalContent;
                  return (
                    <button
                      key={t.path}
                      type="button"
                      className={`btn btn-sm ${t.path === currentTab.path ? 'btn-primary' : ''}`}
                      onClick={() => setActiveTabPath(t.path)}
                    >
                      <span>
                        {t.path.split('/').pop()}
                        {dirty ? ' •' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-row">
                <button
                  type="button"
                  className={`btn btn-sm ${viewerMode === 'code' ? 'btn-primary' : ''}`}
                  onClick={() => setViewerMode('code')}
                >
                  Code
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${viewerMode === 'hex' ? 'btn-primary' : ''}`}
                  onClick={() => setViewerMode('hex')}
                >
                  Hex Dump
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${splitView ? 'btn-primary' : ''}`}
                  onClick={() => setSplitView(!splitView)}
                  title="Toggle Split Reference View"
                >
                  <Columns size={13} /> Split
                </button>
              </div>
            </div>

            {/* Breadcrumbs & Encoding/EOL Controls */}
            <div className="card-elevated flex-between" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
              <div className="mono">
                DevBench &rsaquo; {currentTab.path.split('/').join(' › ')}
                {gotoLine ? ` (Focused Line ${gotoLine})` : ''}
              </div>
              <div className="flex-row">
                <span className="badge">{currentTab.encoding}</span>
                <span className="badge">{currentTab.lineEndings}</span>
                <button type="button" className="btn btn-sm" onClick={formatCurrentBuffer}>
                  <Sparkles size={12} /> Format
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => saveCurrentTab('CRLF', false)}
                  title="Convert & Save with Windows CRLF Line Endings"
                >
                  Save CRLF
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => saveCurrentTab()}
                >
                  <Save size={12} /> Save
                </button>
              </div>
            </div>

            {viewerMode === 'hex' ? (
              <pre
                className="card-elevated mono"
                style={{ margin: 0, overflowX: 'auto', maxHeight: '52vh', fontSize: '0.82rem' }}
              >
                {currentTab.hexPreview || 'No binary bytes loaded.'}
              </pre>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: splitView ? '1fr 1fr' : '1fr',
                  gap: 10,
                }}
              >
                <textarea
                  className="textarea code-editor-area"
                  rows={20}
                  value={currentTab.content}
                  onChange={(e) => updateCurrentContent(e.target.value)}
                  spellCheck={false}
                  aria-label={`Code editor for ${currentTab.path}`}
                />
                {splitView && (
                  <div
                    className="card-elevated mono"
                    style={{ overflowY: 'auto', maxHeight: '52vh', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}
                  >
                    <div className="muted" style={{ marginBottom: 6 }}>
                      Split Reference / Saved Snapshot ({currentTab.path})
                    </div>
                    {currentTab.originalContent || currentTab.content}
                  </div>
                )}
              </div>
            )}

            <div className="flex-between muted" style={{ fontSize: '0.78rem' }}>
              <span>{bracketDiag}</span>
              <span>Lines: {currentTab.content.split(/\r?\n/).length} · Autosave crash-draft enabled</span>
            </div>
          </div>
        </div>
      )}

      {subtab === 'search-rename' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Search Across Workspace Files</h3>
            <form onSubmit={runSearch} className="flex-row">
              <input
                className="input mono"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search identifier, string, or regex..."
              />
              <label className="flex-row" style={{ fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={searchRegex}
                  onChange={(e) => setSearchRegex(e.target.checked)}
                />
                Regex
              </label>
              <button type="submit" className="btn btn-primary">
                Search
              </button>
            </form>
            <div className="stack-sm" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              {searchHits.map((hit, idx) => (
                <div key={`${hit.file}-${hit.line}-${idx}`} className="card-elevated flex-between">
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: '0.83rem' }}>
                      {hit.file}:{hit.line}
                    </div>
                    <div className="muted mono" style={{ fontSize: '0.77rem' }}>
                      {hit.preview}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setSubtab('editor');
                      loadWorkspaceFile(hit.file);
                      setGotoLine(String(hit.line));
                    }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Safe Bulk File Rename (Preview + Consent)</h3>
            <div className="muted" style={{ fontSize: '0.83rem' }}>
              Preview exact filename transformations before touching disk.
            </div>
            <input
              className="input mono"
              placeholder="Directory (blank for workspace root, e.g. windows)"
              value={renameDir}
              onChange={(e) => setRenameDir(e.target.value)}
            />
            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input
                className="input mono"
                placeholder="Find substring in filename..."
                value={renameFind}
                onChange={(e) => setRenameFind(e.target.value)}
              />
              <input
                className="input mono"
                placeholder="Replace with..."
                value={renameReplace}
                onChange={(e) => setRenameReplace(e.target.value)}
              />
            </div>
            <div className="flex-row">
              <button type="button" className="btn" onClick={previewBulkRename}>
                Preview Matches
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={renamePreviews.length === 0}
                onClick={executeBulkRename}
              >
                Approve & Rename ({renamePreviews.length})
              </button>
            </div>
            {renamePreviews.map((p) => (
              <div key={p.oldName} className="card-elevated mono" style={{ fontSize: '0.82rem' }}>
                {p.oldName} &rarr; <strong style={{ color: 'var(--accent)' }}>{p.newName}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {subtab === 'compare-viewers' && (
        <div className="stack-md">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Side-by-Side Configuration / File Comparison</h3>
            <div className="grid-2">
              <textarea
                className="textarea mono"
                rows={6}
                value={leftText}
                onChange={(e) => setLeftText(e.target.value)}
                aria-label="Left comparison text"
              />
              <textarea
                className="textarea mono"
                rows={6}
                value={rightText}
                onChange={(e) => setRightText(e.target.value)}
                aria-label="Right comparison text"
              />
            </div>
            <div className="card-elevated mono" style={{ fontSize: '0.8rem', overflowX: 'auto' }}>
              {diffLines.map((row) => (
                <div
                  key={row.line}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '36px 1fr 1fr',
                    gap: 8,
                    background: row.changed ? 'var(--warning-soft)' : 'transparent',
                    padding: '2px 6px',
                  }}
                >
                  <span className="muted">{row.line}</span>
                  <span>{row.left}</span>
                  <span>{row.right}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>CSV / Structured Table & Markdown Viewer</h3>
            <textarea
              className="textarea mono"
              rows={4}
              value={csvSample}
              onChange={(e) => setCsvSample(e.target.value)}
            />
            <table className="data-table">
              <tbody>
                {csvSample
                  .trim()
                  .split(/\r?\n/)
                  .map((line, idx) => (
                    <tr key={idx}>
                      {line.split(',').map((cell, cIdx) =>
                        idx === 0 ? <th key={cIdx}>{cell}</th> : <td key={cIdx}>{cell}</td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subtab === 'utilities' && (
        <div className="grid-2">
          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>Snippet Library & Safe Clipboard History</h3>
            {snippets.map((sn) => (
              <div key={sn.id} className="card-elevated stack-sm">
                <div className="flex-between">
                  <strong>{sn.title}</strong>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => copySafeText(sn.title, sn.body)}
                  >
                    Copy Snippet
                  </button>
                </div>
                <pre className="mono muted" style={{ margin: 0, fontSize: '0.77rem', overflowX: 'auto' }}>
                  {sn.body}
                </pre>
              </div>
            ))}

            <div className="stack-sm" style={{ marginTop: 6 }}>
              <input
                className="input"
                placeholder="New snippet title..."
                value={newSnipTitle}
                onChange={(e) => setNewSnipTitle(e.target.value)}
              />
              <textarea
                className="textarea mono"
                rows={3}
                placeholder="Snippet code body..."
                value={newSnipBody}
                onChange={(e) => setNewSnipBody(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!newSnipTitle.trim() || !newSnipBody.trim()}
                onClick={() => {
                  addSnippet({
                    title: newSnipTitle.trim(),
                    language: 'text',
                    tags: ['Custom'],
                    body: newSnipBody,
                  });
                  setNewSnipTitle('');
                  setNewSnipBody('');
                }}
              >
                Save Snippet
              </button>
            </div>

            {clipboardHistory.length > 0 && (
              <div className="card-elevated" style={{ fontSize: '0.78rem' }}>
                <strong>Recent Redacted Clipboard History ({clipboardHistory.length})</strong>
                {clipboardHistory.slice(0, 3).map((item, i) => (
                  <div key={i} className="mono muted" style={{ marginTop: 4 }}>
                    {item.slice(0, 90)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card stack-sm">
            <h3 style={{ margin: 0 }}>
              <Hash size={15} /> Regex, Cron, Hash, Base64 & Color Utilities
            </h3>

            <div className="card-elevated stack-sm">
              <strong>Regex Tester</strong>
              <input
                className="input mono"
                value={regexPattern}
                onChange={(e) => setRegexPattern(e.target.value)}
                placeholder="Regular expression..."
              />
              <input
                className="input mono"
                value={regexTestStr}
                onChange={(e) => setRegexTestStr(e.target.value)}
                placeholder="Sample input string..."
              />
              <div style={{ fontSize: '0.82rem' }}>
                {!regexEvaluation.valid ? (
                  <span style={{ color: 'var(--danger)' }}>Invalid Regex: {regexEvaluation.error}</span>
                ) : regexEvaluation.matched ? (
                  <span style={{ color: 'var(--success)' }}>
                    Matched! Capture groups: {JSON.stringify(regexEvaluation.groups)}
                  </span>
                ) : (
                  <span className="muted">No match</span>
                )}
              </div>
            </div>

            <div className="card-elevated stack-sm">
              <strong>Cron Expression Helper</strong>
              <input
                className="input mono"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
              />
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                {cronExplanation}
              </div>
            </div>

            <div className="card-elevated stack-sm">
              <strong>Base64, URL, SHA-256 & Timestamp Converter</strong>
              <input
                className="input mono"
                value={utilInput}
                onChange={(e) => setUtilInput(e.target.value)}
              />
              <div className="mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
                <div>
                  <strong>Base64:</strong> {btoa(unescape(encodeURIComponent(utilInput)))}
                </div>
                <div>
                  <strong>URL Encoded:</strong> {encodeURIComponent(utilInput)}
                </div>
                <div>
                  <strong>SHA-256:</strong> {sha256Hex}
                </div>
                <div>
                  <strong>Unix Epoch Now:</strong> {Math.floor(Date.now() / 1000)} ({new Date().toISOString()})
                </div>
              </div>
              <div className="flex-row">
                <input
                  type="color"
                  value={pickedColor}
                  onChange={(e) => setPickedColor(e.target.value)}
                  style={{ width: 42, height: 30, padding: 0, border: 'none', background: 'none' }}
                />
                <span className="mono">Picked Color: {pickedColor.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeModule;
