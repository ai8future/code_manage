'use client';

import { useState, useEffect } from 'react';
import { FileText, ChevronDown, ChevronRight, X, Loader2, ExternalLink, Pencil, Archive } from 'lucide-react';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface DocFile {
  filename: string;
  title: string;
  description?: string;
  preview?: string;
  date?: string;
  source?: 'project' | 'vault';
  vaultPath?: string;
}

interface DocsCardProps {
  projectPath: string;
}

interface DocModalProps {
  doc: DocFile;
  projectPath: string;
  onClose: () => void;
  onOpenInEditor: () => void;
  onEdit: () => void;
}

function DocModal({ doc, projectPath, onClose, onOpenInEditor, onEdit }: DocModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const basePath = doc.source === 'vault' && doc.vaultPath ? doc.vaultPath : projectPath;
    const filePath = `${basePath}/${doc.filename}`;

    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          // Strip front-matter from content for display
          let rawContent = data.content;
          if (rawContent.startsWith('---')) {
            const endIndex = rawContent.indexOf('---', 3);
            if (endIndex !== -1) {
              rawContent = rawContent.slice(endIndex + 3).trim();
            }
          }
          setContent(rawContent);
        }
      })
      .catch(() => setError('Failed to load file'))
      .finally(() => setLoading(false));
  }, [doc, projectPath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700/50 w-[80%] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            {doc.source === 'vault' ? (
              <Archive size={18} className="text-amber-500 flex-shrink-0" />
            ) : (
              <FileText size={18} className="text-blue-500 flex-shrink-0" />
            )}
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {doc.title}
            </h3>
            {doc.source === 'vault' && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded uppercase tracking-wide">
                Vault
              </span>
            )}
            {doc.date && (
              <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{doc.date}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Edit"
            >
              <Pencil size={16} className="text-gray-500" />
            </button>
            <button
              onClick={onOpenInEditor}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Open in VS Code"
            >
              <ExternalLink size={16} className="text-gray-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          )}
          {error && (
            <div className="text-red-500 text-center py-12">{error}</div>
          )}
          {content && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-4">
                      <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-gray-100 dark:bg-gray-700">{children}</thead>
                  ),
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => (
                    <tr className="border-b border-gray-300 dark:border-gray-600">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
                      {children}
                    </td>
                  ),
                  code: ({ className, children }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !className;

                    if (isInline) {
                      return (
                        <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">
                          {children}
                        </code>
                      );
                    }

                    const language = match ? match[1] : 'text';
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={language}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    );
                  },
                  pre: ({ children }) => <div className="mb-4 overflow-hidden rounded-lg">{children}</div>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DocsCard({ projectPath }: DocsCardProps) {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<DocFile | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocFile | null>(null);

  const fetchDocs = () => {
    fetch(`/api/projects/docs?path=${encodeURIComponent(projectPath)}`)
      .then(res => res.json())
      .then(data => {
        setDocs(data.docs || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
  }, [projectPath]);

  const getDocPath = (doc: DocFile) => {
    return doc.source === 'vault' && doc.vaultPath ? doc.vaultPath : projectPath;
  };

  const handleOpenInEditor = async (doc: DocFile) => {
    const basePath = getDocPath(doc);
    const filePath = `${basePath}/${doc.filename}`;
    try {
      await fetch('/api/actions/open-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
    } catch (err) {
      console.error('Failed to open doc file:', err);
    }
  };

  // Don't render if no docs found
  if (!loading && docs.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-blue-500 p-4 shadow-sm">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FileText size={18} className="text-blue-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Docs</h3>
          <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
            {loading ? '...' : docs.length}
          </span>
        </button>

        {expanded && (
          <div className="mt-3 space-y-1">
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Loading...
              </div>
            ) : (
              docs.map((doc) => (
                <div
                  key={`${doc.source || 'project'}-${doc.filename}`}
                  className="px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <div className="flex items-start gap-2">
                    {doc.source === 'vault' ? (
                      <Archive size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <FileText size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-medium text-gray-900 dark:text-white">
                          {doc.title}
                        </p>
                        {doc.source === 'vault' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded uppercase tracking-wide">
                            Vault
                          </span>
                        )}
                        {doc.date && (
                          <span className="text-xs text-gray-400 flex-shrink-0">{doc.date}</span>
                        )}
                        <ExternalLink size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto" />
                      </div>
                      {doc.preview && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {doc.preview}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Doc Modal */}
      {selectedDoc && (
        <DocModal
          doc={selectedDoc}
          projectPath={projectPath}
          onClose={() => setSelectedDoc(null)}
          onOpenInEditor={() => {
            handleOpenInEditor(selectedDoc);
            setSelectedDoc(null);
          }}
          onEdit={() => {
            setEditingDoc(selectedDoc);
            setSelectedDoc(null);
          }}
        />
      )}

      {/* Markdown Editor Modal */}
      {editingDoc && (
        <MarkdownEditor
          projectPath={getDocPath(editingDoc)}
          filename={editingDoc.filename}
          onClose={() => setEditingDoc(null)}
          onSave={() => {
            fetchDocs();
            setEditingDoc(null);
          }}
        />
      )}
    </>
  );
}
