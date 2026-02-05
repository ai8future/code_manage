'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { X, Minus, Maximize2, Minimize2, ChevronUp } from 'lucide-react';

interface TerminalPanelProps {
  projectPath: string;
  onClose?: () => void;
}

interface HistoryEntry {
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
}

export function TerminalPanel({ projectPath, onClose }: TerminalPanelProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [height, setHeight] = useState(300);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isMinimized]);

  const executeCommand = async (command: string) => {
    if (!command.trim()) return;

    setIsRunning(true);
    setCommandHistory((prev) => [...prev, command]);
    setHistoryIndex(-1);

    try {
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: projectPath }),
      });

      const result = await response.json();

      setHistory((prev) => [
        ...prev,
        {
          command,
          output: result.stdout + (result.stderr ? `\n${result.stderr}` : ''),
          exitCode: result.exitCode,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setHistory((prev) => [
        ...prev,
        {
          command,
          output: `Error: Failed to execute command`,
          exitCode: 1,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsRunning(false);
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isRunning) {
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex =
          historyIndex === -1
            ? commandHistory.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      if (isRunning) {
        // Note: This won't actually kill the process on the server
        // but it provides visual feedback
        setIsRunning(false);
        setHistory((prev) => [
          ...prev,
          {
            command: input,
            output: '^C',
            exitCode: 130,
            timestamp: new Date(),
          },
        ]);
        setInput('');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setHistory([]);
    }
  };

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;

    const onMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(600, startHeight + delta));
      setHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-2 flex items-center justify-between">
        <span className="text-gray-400 text-sm font-mono">Terminal - {projectPath.split('/').pop()}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 hover:bg-gray-800 rounded"
          >
            <ChevronUp size={16} className="text-gray-400" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded"
            >
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700
        flex flex-col
        ${isMaximized ? 'h-screen' : ''}
      `}
      style={isMaximized ? undefined : { height }}
    >
      {/* Resize handle */}
      {!isMaximized && (
        <div
          ref={resizeRef}
          onMouseDown={handleResize}
          className="h-1 bg-gray-700 hover:bg-blue-500 cursor-ns-resize"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-gray-300 text-sm font-mono">
          {projectPath.split('/').pop()}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-gray-700 rounded"
            title="Minimize"
          >
            <Minus size={14} className="text-gray-400" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 hover:bg-gray-700 rounded"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <Minimize2 size={14} className="text-gray-400" />
            ) : (
              <Maximize2 size={14} className="text-gray-400" />
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-700 rounded"
              title="Close"
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal output */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((entry, i) => (
          <div key={i} className="mb-2">
            <div className="flex items-start">
              <span className="text-green-400 mr-2">$</span>
              <span className="text-white">{entry.command}</span>
            </div>
            {entry.output && (
              <pre
                className={`ml-4 whitespace-pre-wrap ${
                  entry.exitCode !== 0 ? 'text-red-400' : 'text-gray-300'
                }`}
              >
                {entry.output}
              </pre>
            )}
          </div>
        ))}

        {/* Current input line */}
        <div className="flex items-center">
          <span className="text-green-400 mr-2">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            className="flex-1 bg-transparent text-white outline-none font-mono"
            placeholder={isRunning ? 'Running...' : 'Enter command...'}
            autoFocus
          />
          {isRunning && (
            <span className="animate-pulse text-yellow-400 ml-2">running</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-1 bg-gray-800 border-t border-gray-700 text-xs text-gray-500">
        Press Enter to run • Ctrl+L to clear • Ctrl+C to cancel
      </div>
    </div>
  );
}
