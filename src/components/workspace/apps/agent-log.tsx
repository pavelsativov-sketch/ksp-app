'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, CheckCircle2, AlertCircle, Wrench, BrainCircuit } from 'lucide-react';

interface LogEntry {
  id: number;
  type: 'START' | 'THINK' | 'TOOL_CALL' | 'TOOL_RESULT' | 'REASONING' | 'END' | 'ERROR' | 'WARNING' | 'user';
  message: string;
  data?: unknown;
  timestamp: Date;
}

export function AgentLogApp() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [logs]);

  // Poll SSE when a task is running
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/task/${taskId}`);
        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          const text = decoder.decode(value);
          const lines = text.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'STATUS_UPDATE' && (parsed.status === 'completed' || parsed.status === 'failed')) {
                setRunning(false);
              } else if (parsed.type) {
                setLogs(prev => [...prev, {
                  id: Date.now() + Math.random(),
                  type: parsed.type,
                  message: parsed.message || '',
                  data: parsed.data,
                  timestamp: new Date(parsed.timestamp || Date.now()),
                }]);
              }
            } catch {}
          }
        }
      } catch (e) {
        setRunning(false);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [taskId]);

  const submitTask = async () => {
    if (!prompt.trim() || running) return;
    const userMsg = prompt.trim();
    setPrompt('');
    setLogs(prev => [...prev, { id: Date.now(), type: 'user', message: userMsg, timestamp: new Date() }]);
    setRunning(true);

    try {
      const res = await fetch('/api/agents/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg }),
      });
      const data = await res.json();
      if (data.taskId) {
        setTaskId(data.taskId);
      } else {
        setLogs(prev => [...prev, { id: Date.now(), type: 'ERROR', message: data.error || 'Failed to start task', timestamp: new Date() }]);
        setRunning(false);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setLogs(prev => [...prev, { id: Date.now(), type: 'ERROR', message, timestamp: new Date() }]);
      setRunning(false);
    }
  };

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'THINK': return <BrainCircuit className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'TOOL_CALL': return <Wrench className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'TOOL_RESULT': return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
      case 'REASONING': return <BrainCircuit className="w-4 h-4 text-indigo-400 shrink-0" />;
      case 'ERROR': return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
      case 'END': return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'user': return <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0"><span className="text-[8px] text-white font-bold">U</span></div>;
      default: return <Bot className="w-4 h-4 text-white/30 shrink-0" />;
    }
  };

  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'user': return 'text-white';
      case 'THINK': return 'text-purple-300';
      case 'REASONING': return 'text-indigo-300';
      case 'TOOL_CALL': return 'text-blue-300';
      case 'TOOL_RESULT': return 'text-green-300';
      case 'ERROR': return 'text-red-300';
      case 'END': return 'text-emerald-300';
      default: return 'text-white/70';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      {/* Header */}
      <div className="h-10 bg-[#16162a] border-b border-white/[0.06] flex items-center px-4 gap-2 shrink-0">
        <Bot className="w-4 h-4 text-purple-400" />
        <span className="text-[12px] text-white/70 font-medium">AI Agent — Mektep Control</span>
        {running && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin ml-auto" />}
      </div>

      {/* Log Area */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-white/20 gap-3">
            <Bot className="w-16 h-16" />
            <p className="text-sm text-center">Введите задание для AI Агента</p>
            <p className="text-xs text-center text-white/10 max-w-sm">
              Например: «Создай КСП по информатике для 8 класса на тему Системы счисления»
            </p>
          </div>
        )}

        {logs.map(entry => (
          <div key={entry.id} className={`flex gap-3 ${entry.type === 'user' ? 'justify-end' : ''}`}>
            {entry.type !== 'user' && getIcon(entry.type)}
            <div className={`max-w-[85%] ${entry.type === 'user' ? 'bg-blue-600/30 rounded-2xl rounded-br-md px-4 py-2.5' : ''}`}>
              {entry.type === 'user' ? (
                <p className="text-[13px] text-white">{entry.message}</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] text-white/20 uppercase tracking-wide font-semibold">{entry.type.replace('_', ' ')}</span>
                    <span className="text-[10px] text-white/15">{entry.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <p className={`text-[13px] ${getColor(entry.type)} mt-0.5 leading-relaxed`}>{entry.message}</p>
                  {entry.data && (
                    <pre className="text-[11px] text-white/30 mt-1 bg-white/[0.03] rounded px-2 py-1 overflow-x-auto max-h-32">
                      {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {running && (
          <div className="flex gap-3 items-center">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
            <span className="text-[13px] text-purple-300/60 animate-pulse">Агент работает...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 bg-[#16162a] border-t border-white/[0.06] shrink-0">
        <form
          className="flex items-center gap-2 bg-[#252540] rounded-xl px-3 py-2 border border-white/[0.06] focus-within:border-purple-500/30 transition-colors"
          onSubmit={e => { e.preventDefault(); submitTask(); }}
        >
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-white/80 outline-none placeholder:text-white/25"
            placeholder="Опишите задание для агента..."
            disabled={running}
          />
          <button
            type="submit"
            disabled={running || !prompt.trim()}
            className="w-8 h-8 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:hover:bg-purple-600 flex items-center justify-center transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </form>
      </div>
    </div>
  );
}
