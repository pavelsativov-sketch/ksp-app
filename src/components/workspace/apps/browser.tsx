'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Home, Shield } from 'lucide-react';

const BASE = '/api/agents/browser-stream';

export function BrowserApp() {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [inputUrl, setInputUrl] = useState('https://bilimland.kz');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFrame = useCallback(async (params: Record<string, string> = {}) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    
    const qs = new URLSearchParams({ action: 'screenshot', ...params }).toString();
    try {
      const res = await fetch(`${BASE}?${qs}`, { signal: abortRef.current.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const title = decodeURIComponent(res.headers.get('X-Page-Title') || '');
      const currentUrl = decodeURIComponent(res.headers.get('X-Page-Url') || '');
      setImgSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      if (title) setPageTitle(title);
      if (currentUrl) { setPageUrl(currentUrl); setInputUrl(currentUrl); }
      setError('');
    } catch (e: unknown) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      if (!isAbort) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Auto-refresh every 1.5s when idle
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      if (!loading) fetchFrame();
    }, 1500);
    return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
  }, [fetchFrame, loading]);

  const doAction = useCallback(async (params: Record<string, string>) => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    setLoading(true);
    try {
      // First perform the action
      await fetch(`${BASE}?${new URLSearchParams(params)}`, { cache: 'no-store' });
      // Then get fresh screenshot
      await fetchFrame();
    } finally {
      setLoading(false);
      // Resume auto-refresh
      refreshIntervalRef.current = setInterval(() => fetchFrame(), 1500);
    }
  }, [fetchFrame]);

  const navigate = useCallback(async (target: string) => {
    if (!target.trim()) return;
    const url = target.startsWith('http') ? target : target.includes('.') ? 'https://' + target : 'https://www.google.com/search?q=' + encodeURIComponent(target);
    setLoading(true);
    setInputUrl(url);
    try {
      await fetch(`${BASE}?${new URLSearchParams({ action: 'navigate', url })}`, { cache: 'no-store' });
      await fetchFrame();
    } finally { setLoading(false); }
  }, [fetchFrame]);

  // Handle clicks on the screenshot image
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // Map click position to 1280x800 viewport
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1280);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 800);
    doAction({ action: 'click', x: x.toString(), y: y.toString() });
  }, [doAction]);

  // Handle scroll on the screenshot
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    doAction({ action: 'scroll', dy: Math.round(e.deltaY).toString() });
  }, [doAction]);

  // Load on mount. Навигация уходит в сетевой запрос, поэтому setState
  // выполняется уже после await — синхронного обновления в теле эффекта нет.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void navigate('https://www.google.com');
  }, [navigate]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] select-none">
      {/* Tab Bar */}
      <div className="h-9 bg-[#252536] flex items-end px-2 shrink-0 border-b border-black/30">
        <div className="h-8 min-w-[160px] max-w-[240px] bg-[#1e1e2e] rounded-t-md px-3 flex items-center gap-2 border-t border-x border-white/[0.06]">
          {loading ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
          ) : (
            <div className="w-3.5 h-3.5 shrink-0 rounded-sm bg-blue-500/30 flex items-center justify-center">
              <span className="text-[7px] text-blue-300 font-bold">B</span>
            </div>
          )}
          <span className="text-[11px] text-white/60 truncate flex-1">{pageTitle || pageUrl || 'New Tab'}</span>
        </div>
        <button className="w-7 h-7 mb-0.5 flex items-center justify-center text-white/30 hover:text-white/60 text-lg">+</button>
      </div>

      {/* Navigation Bar */}
      <div className="h-11 bg-[#1e1e2e] border-b border-black/30 flex items-center gap-1.5 px-2 shrink-0">
        <button onClick={() => doAction({ action: 'back' })} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group">
          <ArrowLeft className="w-4 h-4 text-white/50 group-hover:text-white/80" />
        </button>
        <button onClick={() => doAction({ action: 'forward' })} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group">
          <ArrowRight className="w-4 h-4 text-white/50 group-hover:text-white/80" />
        </button>
        <button onClick={() => doAction({ action: 'reload' })} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group">
          <RotateCw className={`w-4 h-4 text-white/50 group-hover:text-white/80 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => navigate('https://www.google.com')} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group">
          <Home className="w-4 h-4 text-white/50 group-hover:text-white/80" />
        </button>

        {/* URL Bar */}
        <form
          className="flex-1 flex items-center h-8 bg-[#313147] rounded-full px-3 gap-2 border border-transparent focus-within:border-blue-500/50 transition-all"
          onSubmit={e => { e.preventDefault(); navigate(inputUrl); }}
        >
          <Shield className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <input
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            className="flex-1 bg-transparent text-[12px] text-white/80 outline-none"
            placeholder="Search or enter URL..."
          />
          {inputUrl && (
            <button type="button" onClick={() => { setInputUrl(''); }} className="text-white/20 hover:text-white/50">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Viewport — real Playwright screenshot */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative bg-white cursor-crosshair">
        {!imgSrc && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 flex-col gap-3">
            <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Starting browser...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <p className="text-gray-500 text-sm mb-2">{error}</p>
              <button onClick={() => navigate(pageUrl || 'https://google.com')} className="text-blue-500 text-sm underline">Retry</button>
            </div>
          </div>
        )}
        {imgSrc && (
          <img
            ref={canvasRef}
            src={imgSrc}
            alt="Browser viewport"
            className="w-full h-full object-cover object-top cursor-default"
            onClick={handleImageClick}
            onWheel={handleWheel}
            draggable={false}
          />
        )}
        {loading && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        )}
      </div>

      {/* Status bar */}
      <div className="h-5 bg-[#252536] border-t border-black/20 flex items-center px-3 shrink-0">
        <span className="text-[10px] text-white/25 truncate">{pageUrl}</span>
      </div>
    </div>
  );
}
