'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, RotateCw, X, Home, Shield, LogOut } from 'lucide-react';

const BASE = '/api/agents/browser-stream';

export function BrowserApp({ initialUrl }: { initialUrl?: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [inputUrl, setInputUrl] = useState(initialUrl?.trim() || 'https://www.google.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typedText, setTypedText] = useState('');
  const [hideTypedText, setHideTypedText] = useState(false);
  const canvasRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const landingUrl = initialUrl?.trim() || 'https://www.google.com';

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

  const doAction = useCallback(async (params: Record<string, string>) => {
    setLoading(true);
    try {
      // First perform the action
      const actionResult = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), cache: 'no-store' });
      if (!actionResult.ok) {
        const data = await actionResult.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${actionResult.status}`);
      }
      // Then get fresh screenshot
      await fetchFrame();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fetchFrame]);

  const navigate = useCallback(async (target: string) => {
    if (!target.trim()) return;
    const url = target.startsWith('http') ? target : target.includes('.') ? 'https://' + target : 'https://www.google.com/search?q=' + encodeURIComponent(target);
    setLoading(true);
    setInputUrl(url);
    try {
      const actionResult = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'navigate', url }), cache: 'no-store' });
      if (!actionResult.ok) {
        const data = await actionResult.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${actionResult.status}`);
      }
      await fetchFrame();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [fetchFrame]);

  const typeIntoPage = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!typedText) return;
    const text = typedText;
    setTypedText('');
    await doAction({ action: 'type', text });
  }, [doAction, typedText]);

  const clearSession = useCallback(async () => {
    if (!window.confirm('Завершить внешний сеанс и удалить сохранённые данные входа?')) return;
    const res = await fetch(BASE, { method: 'DELETE' });
    if (!res.ok) { setError('Не удалось очистить сеанс'); return; }
    setPageTitle(''); setPageUrl(''); setImgSrc(null); setInputUrl(landingUrl);
    setError('Внешний сеанс удалён. Войдите снова, чтобы продолжить.');
  }, [landingUrl]);

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
    void navigate(landingUrl);
  }, [landingUrl, navigate]);

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
        <button type="button" onClick={() => void clearSession()} title="Завершить внешние сеансы" className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group">
          <LogOut className="w-4 h-4 text-white/50 group-hover:text-rose-300" />
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

      <form onSubmit={typeIntoPage} className="flex shrink-0 items-center gap-2 border-b border-black/20 bg-[#252536] px-2 py-1.5">
        <input
          value={typedText}
          onChange={e => setTypedText(e.target.value)}
          type={hideTypedText ? 'password' : 'text'}
          maxLength={500}
          autoComplete="off"
          placeholder="Введите текст на странице (логин или пароль)"
          aria-label="Текст для ввода на странице"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500/50"
        />
        <label className="flex items-center gap-1 text-[10px] text-white/50">
          <input type="checkbox" checked={hideTypedText} onChange={e => setHideTypedText(e.target.checked)} /> Скрыть
        </label>
        <button type="submit" disabled={!typedText || loading} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-40">Ввести</button>
      </form>

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
          <Image
            src={imgSrc}
            alt="Browser viewport"
            width={1280}
            height={800}
            unoptimized
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
        <span className="ml-auto shrink-0 pl-2 text-[10px] text-white/30" title="Лимит бесплатного Cloudflare Browser Run">
          Free: 10 мин/день
        </span>
      </div>
    </div>
  );
}
