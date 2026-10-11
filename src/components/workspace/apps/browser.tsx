'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, RotateCw, X, Home, Shield, LogOut, ExternalLink } from 'lucide-react';

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
  const actionPendingRef = useRef(false);
  const landingUrl = initialUrl?.trim() || 'https://www.google.com';
  const dailyQuotaBlocked = /дневн.{0,30}лимит/i.test(error);

  const acceptFrame = useCallback(async (res: Response) => {
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    if (!res.headers.get('content-type')?.startsWith('image/')) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Браузер вернул пустую страницу');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const title = decodeURIComponent(res.headers.get('X-Page-Title') || '');
    const currentUrl = decodeURIComponent(res.headers.get('X-Page-Url') || '');
    setImgSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    if (title) setPageTitle(title);
    if (currentUrl) { setPageUrl(currentUrl); setInputUrl(currentUrl); }
    setError('');
    return currentUrl;
  }, []);

  const fetchFrame = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${BASE}?action=screenshot`, { signal: abortRef.current.signal, cache: 'no-store' });
      return await acceptFrame(res);
    } catch (e: unknown) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      if (!isAbort) setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }, [acceptFrame]);

  const doAction = useCallback(async (params: Record<string, string>) => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const actionResult = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), cache: 'no-store' });
      // POST already returns the resulting frame. A second screenshot request
      // reopened the same remote site and could discard a login form's focus.
      await acceptFrame(actionResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      actionPendingRef.current = false;
      setLoading(false);
    }
  }, [acceptFrame]);

  const navigate = useCallback(async (target: string) => {
    if (!target.trim() || actionPendingRef.current) return;
    actionPendingRef.current = true;
    const url = target.startsWith('http') ? target : target.includes('.') ? 'https://' + target : 'https://www.google.com/search?q=' + encodeURIComponent(target);
    setLoading(true);
    setInputUrl(url);
    setError('');
    try {
      const actionResult = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'navigate', url }), cache: 'no-store' });
      await acceptFrame(actionResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { actionPendingRef.current = false; setLoading(false); }
  }, [acceptFrame]);

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

  const openExternally = useCallback(() => {
    const target = pageUrl || inputUrl || landingUrl;
    const externalUrl = /^https?:\/\//i.test(target)
      ? target
      : target.includes('.')
        ? `https://${target}`
        : `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    window.open(externalUrl, '_blank', 'noopener,noreferrer');
  }, [inputUrl, landingUrl, pageUrl]);

  // Handle clicks on the screenshot image
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // The image is contained inside the viewport. Account for the letterbox
    // before mapping a local pointer to the remote 1280x800 viewport.
    const scale = Math.min(rect.width / 1280, rect.height / 800);
    const renderedWidth = 1280 * scale;
    const renderedHeight = 800 * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const rawX = (e.clientX - rect.left - offsetX) / scale;
    const rawY = (e.clientY - rect.top - offsetY) / scale;
    if (rawX < 0 || rawY < 0 || rawX >= 1280 || rawY >= 800) return;
    const x = Math.round(rawX);
    const y = Math.round(rawY);
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
    void (async () => {
      // Reopen the last page (and its authenticated session) before choosing
      // a landing page. This prevents each window opening from losing BilimClass.
      const restoredUrl = await fetchFrame();
      if (restoredUrl === 'about:blank') await navigate(landingUrl);
    })();
  }, [fetchFrame, landingUrl, navigate]);

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
      <div ref={containerRef} className="flex-1 overflow-hidden relative bg-[#090b12] cursor-crosshair">
        {!imgSrc && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#090b12] flex-col gap-3">
            <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/55 text-sm">Загрузка безопасного браузера…</p>
          </div>
        )}
        {imgSrc && (
          <Image
            src={imgSrc}
            alt="Browser viewport"
            width={1280}
            height={800}
            unoptimized
            className="w-full h-full object-contain cursor-default"
            ref={canvasRef}
            onClick={handleImageClick}
            onWheel={handleWheel}
            draggable={false}
          />
        )}
        {error && (
          <div className={`absolute z-10 flex justify-center px-3 ${imgSrc ? 'left-3 right-3 top-3' : 'inset-0 items-center bg-[#090b12]'}`}>
            <div className={`flex max-w-full items-center gap-3 rounded-lg border border-amber-300/20 bg-[#151722]/95 px-3 py-2 shadow-xl ${imgSrc ? 'w-full' : 'flex-col text-center'}`} role="status" aria-live="polite">
              <p className="min-w-0 flex-1 text-sm text-white/75">{error}</p>
              {dailyQuotaBlocked ? (
                <>
                  <button type="button" onClick={openExternally} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-300/25 bg-sky-300/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-300/20">
                    <ExternalLink className="size-3.5" /> Открыть сайт отдельно
                  </button>
                  <span className="shrink-0 text-xs text-amber-200/70">Сброс в 00:00 UTC</span>
                </>
              ) : (
                <button type="button" onClick={() => navigate(pageUrl || landingUrl)} className="shrink-0 text-sm text-blue-300 underline underline-offset-2">Повторить</button>
              )}
              <button type="button" onClick={() => setError('')} aria-label="Скрыть сообщение" className="shrink-0 text-white/50 hover:text-white"><X className="size-4" /></button>
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        )}
      </div>

      {/* Status bar */}
      <div className="h-5 bg-[#252536] border-t border-black/20 flex items-center px-3 shrink-0">
        <span className="text-[10px] text-white/25 truncate">{pageUrl}</span>
        <span className="ml-auto shrink-0 pl-2 text-[10px] text-white/30" title="Лимит бесплатного Cloudflare Browser Run">
          Бесплатно: 10 мин/день · тайм-аут бездействия 1 мин
        </span>
      </div>
    </div>
  );
}
