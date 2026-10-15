'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, X, Home, Shield, LogOut,
  ExternalLink, Lock, Play, KeyRound, Check,
} from 'lucide-react';

const BASE = '/api/agents/browser-stream';

// Разрешение удалённого браузера
const REMOTE_W = 1280;
const REMOTE_H = 800;

interface ActiveFieldInfo {
  tag: string;
  type: string;
  label?: string;
  name?: string;
  placeholder?: string;
  isPassword: boolean;
  isEditable: boolean;
  value?: string;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface PageAuthBarrier {
  requiresUserAction: boolean;
  kind: 'login' | 'captcha' | '2fa' | null;
  reason: string;
  domain: string;
}

export function BrowserApp({ initialUrl }: { initialUrl?: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [inputUrl, setInputUrl] = useState(initialUrl?.trim() || 'https://www.google.com');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeField, setActiveField] = useState<ActiveFieldInfo | null>(null);
  const [authBarrier, setAuthBarrier] = useState<PageAuthBarrier | null>(null);
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [clickPing, setClickPing] = useState<{ x: number; y: number; id: number } | null>(null);
  const [handingOver, setHandingOver] = useState(false);
  const [credDialog, setCredDialog] = useState(false);
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [credSaved, setCredSaved] = useState(false);

  const [imgLayout, setImgLayout] = useState<{ width: number; height: number } | null>(null);

  // Нативный <img> вместо Next.js <Image> — иначе pointer-events теряются на обёртке
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const kbInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingCountRef = useRef(0);
  const typeBufferRef = useRef('');
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInitialUrlRef = useRef(initialUrl?.trim() || '');
  const canvasFocusedRef = useRef(false);

  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  const landingUrl = initialUrl?.trim() || 'https://www.google.com';
  const dailyQuotaBlocked = /дневн.{0,30}лимит/i.test(error);
  const isInstalling = /устанавливается|запускается.*мин|failed to start/i.test(error);
  const isRateLimited = /ограничил|подождите \d+ секунд/i.test(error);
  const isSessionExpired = /session expired|сессия истекла|410/i.test(error);



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
    const rawActiveField = res.headers.get('X-Active-Field');
    const rawAuthBarrier = res.headers.get('X-Auth-Barrier');

    if (rawActiveField) {
      try {
        const parsed = JSON.parse(decodeURIComponent(rawActiveField)) as ActiveFieldInfo;
        setActiveField(parsed);
        if (parsed.value !== undefined) {
          setLiveText(parsed.value);
        }
      } catch {
        setActiveField(null);
      }
    } else {
      setActiveField(null);
      setLiveText('');
    }
    if (rawAuthBarrier) {
      try {
        const parsed = JSON.parse(decodeURIComponent(rawAuthBarrier)) as PageAuthBarrier;
        setAuthBarrier(parsed.requiresUserAction ? parsed : null);
      } catch { /* ignore */ }
    } else {
      setAuthBarrier(null);
    }

    setImgSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    if (title) setPageTitle(title);
    if (currentUrl) { setPageUrl(currentUrl); setInputUrl(currentUrl); }
    setError('');
    return currentUrl;
  }, []);

  const fetchFrame = useCallback(async () => {
    if (pendingCountRef.current > 0 || typeBufferRef.current) return undefined;
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

  const enqueueAction = useCallback((params: Record<string, string>) => {
    pendingCountRef.current += 1;
    const isNavigation = !params.action || ['navigate', 'reload', 'back', 'forward'].includes(params.action);
    if (isNavigation) setLoading(true);
    setError('');
    queueRef.current = queueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          const actionResult = await fetch(BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
            cache: 'no-store',
          });
          await acceptFrame(actionResult);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
          if (pendingCountRef.current === 0) setLoading(false);
        }
      });
    return queueRef.current;
  }, [acceptFrame]);

  const flushTypedBuffer = useCallback(() => {
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    const text = typeBufferRef.current;
    if (!text) return;
    typeBufferRef.current = '';
    void enqueueAction({ action: 'type', text });
  }, [enqueueAction]);

  const doAction = useCallback((params: Record<string, string>) => {
    flushTypedBuffer();
    return enqueueAction(params);
  }, [enqueueAction, flushTypedBuffer]);

  const navigate = useCallback(async (target: string) => {
    if (!target.trim()) return;
    flushTypedBuffer();
    const url = target.startsWith('http')
      ? target
      : target.includes('.')
        ? 'https://' + target
        : 'https://www.google.com/search?q=' + encodeURIComponent(target);
    setInputUrl(url);
    await enqueueAction({ action: 'navigate', url });
  }, [enqueueAction, flushTypedBuffer]);

  useEffect(() => {
    if (!isRateLimited) {
      setRetryCountdown(null);
      return;
    }
    setRetryCountdown(15);
    const interval = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          setError('');
          void navigate(pageUrl || landingUrl);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRateLimited, navigate, pageUrl, landingUrl]);

  const clearSession = useCallback(async () => {
    if (!window.confirm('Завершить внешний сеанс и удалить сохранённые данные входа?')) return;
    const res = await fetch(BASE, { method: 'DELETE' });
    if (!res.ok) { setError('Не удалось очистить сеанс'); return; }
    setPageTitle(''); setPageUrl(''); setImgSrc(null); setInputUrl(landingUrl);
    setActiveField(null); setAuthBarrier(null);
    setError('Внешний сеанс удалён. Войдите снова, чтобы продолжить.');
  }, [landingUrl]);

  const resumeAiControl = useCallback(async () => {
    flushTypedBuffer();
    setHandingOver(true);
    try {
      await fetch('/api/agents/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ control: 'ai' }),
      });
    } finally {
      setHandingOver(false);
    }
  }, [flushTypedBuffer]);

  const openExternally = useCallback(() => {
    const target = pageUrl || inputUrl || landingUrl;
    const externalUrl = /^https?:\/\//i.test(target)
      ? target
      : target.includes('.')
        ? `https://${target}`
        : `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    window.open(externalUrl, '_blank', 'noopener,noreferrer');
  }, [inputUrl, landingUrl, pageUrl]);

  /**
   * Клик по скриншоту — вычисляем координаты относительно удалённого экрана
   * (1280×800) с учётом масштабирования object-contain.
   *
   * Используем нативный <img> (imgRef) а не Next.js <Image>, чтобы
   * getBoundingClientRect() возвращал именно элемент изображения без обёртки.
   */
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;

    // Фокусируем ввод с клавиатуры для прямого набора в поле удалённого экрана
    kbInputRef.current?.focus({ preventScroll: true });
    setCanvasFocused(true);
    // Не сбрасываем liveText — поле могло уже содержать текст из activeField.value

    // Рассчитываем реальные координаты пикселя в удалённом браузере
    const rect = img.getBoundingClientRect();
    // object-contain сохраняет пропорции: масштаб = min(scaleX, scaleY)
    const scaleX = REMOTE_W / rect.width;
    const scaleY = REMOTE_H / rect.height;
    // Math.min — изображение вписывается в контейнер (object-fit:contain)
    const scale = Math.min(scaleX, scaleY);
    const renderedW = REMOTE_W / scale;
    const renderedH = REMOTE_H / scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;

    const rawX = (e.clientX - rect.left - offsetX) / (renderedW / REMOTE_W);
    const rawY = (e.clientY - rect.top - offsetY) / (renderedH / REMOTE_H);

    if (rawX < 0 || rawY < 0 || rawX >= REMOTE_W || rawY >= REMOTE_H) return;

    const x = Math.round(rawX);
    const y = Math.round(rawY);

    // Визуальная анимация клика (в координатах контейнера)
    setClickPing({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
    void doAction({ action: 'click', x: x.toString(), y: y.toString() });
  }, [doAction]);

  const queueCharacters = useCallback((chars: string) => {
    if (!chars) return;
    typeBufferRef.current += chars;
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    typeTimerRef.current = setTimeout(() => {
      flushTypedBuffer();
    }, 40);
  }, [flushTypedBuffer]);

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      // Let onPaste handle clipboard paste
      return;
    }
    const specialKeys = ['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (specialKeys.includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Backspace') {
        setLiveText((prev) => (prev.length > 0 ? prev.slice(0, -1) : ''));
        if (typeBufferRef.current.length > 0) {
          typeBufferRef.current = typeBufferRef.current.slice(0, -1);
          return;
        }
        flushTypedBuffer();
        void enqueueAction({ action: 'key', key: 'Backspace' });
        return;
      }
      flushTypedBuffer();
      void enqueueAction({ action: 'key', key: e.key });
      return;
    }
  }, [enqueueAction, flushTypedBuffer]);

  const handleCanvasInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = e.target.value;
    if (!val) return;
    e.target.value = '';
    setLiveText((prev) => prev + val);
    queueCharacters(val);
  }, [queueCharacters]);

  const handleCanvasPaste = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    setLiveText((prev) => prev + pasted);
    flushTypedBuffer();
    void enqueueAction({ action: 'type', text: pasted });
  }, [enqueueAction, flushTypedBuffer]);

  // Handle scroll on the screenshot
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    void doAction({ action: 'scroll', dy: Math.round(e.deltaY).toString() });
  }, [doAction]);

  // Load on mount or sync when initialUrl changes
  const startedRef = useRef(false);
  useEffect(() => {
    const trimmed = initialUrl?.trim() || '';
    if (!startedRef.current) {
      startedRef.current = true;
      lastInitialUrlRef.current = trimmed;
      void (async () => {
        if (trimmed) {
          await navigate(trimmed);
        } else {
          const restoredUrl = await fetchFrame();
          if (restoredUrl === 'about:blank' || !restoredUrl) {
            await navigate('https://www.google.com');
          }
        }
      })();
      return;
    }

    if (trimmed && trimmed !== lastInitialUrlRef.current) {
      lastInitialUrlRef.current = trimmed;
      void navigate(trimmed);
    }
  }, [fetchFrame, navigate, initialUrl]);

  // Keep canvasFocusedRef in sync so the interval below can read it without stale closure
  useEffect(() => { canvasFocusedRef.current = canvasFocused; }, [canvasFocused]);

  // Periodic frame sync so live agent actions inside OS Workspace are visible immediately.
  // Paused while user is actively controlling the browser to avoid refresh interruptions.
  useEffect(() => {
    const id = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        pendingCountRef.current === 0 &&
        !typeBufferRef.current &&
        !canvasFocusedRef.current
      ) {
        void fetchFrame();
      }
    }, 1200);
    return () => clearInterval(id);
  }, [fetchFrame]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setImgLayout({ width: rect.width, height: rect.height });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [imgSrc]);

  const fieldOverlayStyle = React.useMemo(() => {
    if (!activeField?.box || !imgLayout?.width || !imgLayout?.height) return null;

    const scaleX = REMOTE_W / imgLayout.width;
    const scaleY = REMOTE_H / imgLayout.height;
    const scale = Math.min(scaleX, scaleY); // object-fit:contain → min
    const renderedW = REMOTE_W / scale;
    const renderedH = REMOTE_H / scale;
    const offsetX = (imgLayout.width - renderedW) / 2;
    const offsetY = (imgLayout.height - renderedH) / 2;

    const b = activeField.box;
    const x = offsetX + b.x * (renderedW / REMOTE_W);
    const y = offsetY + b.y * (renderedH / REMOTE_H);
    const w = b.width * (renderedW / REMOTE_W);
    const h = b.height * (renderedH / REMOTE_H);

    if (w <= 0 || h <= 0) return null;

    return {
      left: Math.round(x),
      top: Math.round(y),
      width: Math.max(80, Math.round(w)),
      height: Math.max(26, Math.round(h)),
    };
  }, [activeField, imgLayout]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] select-none">
      {/* Tab Bar */}
      <div className="h-9 bg-[#252536] flex items-end px-2 shrink-0 border-b border-black/30">
        <div className="h-8 min-w-[160px] max-w-[260px] bg-[#1e1e2e] rounded-t-md px-3 flex items-center gap-2 border-t border-x border-white/[0.06]">
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
        <button type="button" onClick={() => void doAction({ action: 'back' })} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group" title="Назад">
          <ArrowLeft className="w-4 h-4 text-white/50 group-hover:text-white/80" />
        </button>
        <button type="button" onClick={() => void doAction({ action: 'forward' })} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group" title="Вперёд">
          <ArrowRight className="w-4 h-4 text-white/50 group-hover:text-white/80" />
        </button>
        <button type="button" onClick={() => void doAction({ action: 'reload' })} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group" title="Обновить">
          <RotateCw className={`w-4 h-4 text-white/50 group-hover:text-white/80 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" onClick={() => void navigate('https://www.google.com')} className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group" title="Домашняя страница">
          <Home className="w-4 h-4 text-white/50 group-hover:text-white/80" />
        </button>
        <button type="button" onClick={() => void clearSession()} title="Завершить внешние сеансы и очистить сохранённые входы" className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group">
          <LogOut className="w-4 h-4 text-white/50 group-hover:text-rose-300" />
        </button>

        {/* URL Bar */}
        <form
          className="flex-1 flex items-center h-8 bg-[#313147] rounded-full px-3 gap-2 border border-transparent focus-within:border-blue-500/50 transition-all"
          onSubmit={e => { e.preventDefault(); void navigate(inputUrl); }}
        >
          <Shield className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <input
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            className="flex-1 bg-transparent text-[12px] text-white/80 outline-none"
            placeholder="Введите адрес или поисковый запрос..."
          />
          {inputUrl && (
            <button type="button" onClick={() => { setInputUrl(''); }} className="text-white/20 hover:text-white/50">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Открыть в отдельной вкладке браузера */}
        <button type="button" onClick={openExternally} title="Открыть страницу в новой вкладке" className="w-8 h-8 rounded-md hover:bg-white/[0.06] flex items-center justify-center group">
          <ExternalLink className="w-4 h-4 text-white/50 group-hover:text-white/80" />
        </button>
      </div>

      {/* Панель быстрых закладок для учителя */}
      <div className="h-8 bg-[#181826] border-b border-black/30 flex items-center gap-1.5 px-2.5 shrink-0 text-[11px]">
        <span className="text-white/40 mr-1">Быстрый переход:</span>
        <button
          type="button"
          onClick={() => void navigate('https://www.bilimclass.kz/2026/frontoffice/dashboard')}
          className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-500/20 font-medium transition-colors"
        >
          BilimClass — Дэшборд учителя
        </button>
        <button
          type="button"
          onClick={() => void navigate('https://login.kundelik.kz')}
          className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/20 font-medium transition-colors"
        >
          Kundelik.kz
        </button>
        <button
          type="button"
          onClick={() => void navigate('https://nobd.edu.kz/login')}
          className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-500/20 font-medium transition-colors"
        >
          НОБД
        </button>
        {/* Кнопка сохранения учётных данных для текущего сайта */}
        <div className="ml-auto flex items-center">
          <button
            type="button"
            title="Сохранить логин/пароль для авто-входа на этом сайте"
            onClick={() => {
              const domain = (() => { try { return new URL(pageUrl || 'https://bilimclass.kz').hostname.replace(/^www\./, ''); } catch { return 'bilimclass.kz'; } })();
              setCredUsername('');
              setCredPassword('');
              setCredSaved(false);
              setCredDialog(true);
              // pre-fill domain hint in title
              void domain;
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300/70 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/15 transition-colors"
          >
            <KeyRound className="w-3 h-3" />
            <span>Пароль</span>
          </button>
        </div>
      </div>

      {/* Модальное окно сохранения учётных данных */}
      {credDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setCredDialog(false); }}>
          <div className="bg-[#1e1e32] border border-white/10 rounded-xl shadow-2xl p-5 w-80 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-medium">
                <KeyRound className="w-4 h-4 text-amber-400" />
                Авто-вход
              </div>
              <button type="button" onClick={() => setCredDialog(false)} className="text-white/30 hover:text-white/70">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed">
              Сохрани логин и пароль — браузер будет автоматически входить на этом сайте.
              Данные хранятся зашифрованными.
            </p>
            <div className="text-[11px] text-white/40 font-mono truncate">
              {(() => { try { return new URL(pageUrl || 'https://bilimclass.kz').hostname.replace(/^www\./, ''); } catch { return 'bilimclass.kz'; } })()}
            </div>
            <input
              type="text"
              placeholder="Логин (email или ИИН)"
              value={credUsername}
              onChange={e => setCredUsername(e.target.value)}
              className="bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-blue-500/50"
              autoComplete="username"
            />
            <input
              type="password"
              placeholder="Пароль"
              value={credPassword}
              onChange={e => setCredPassword(e.target.value)}
              className="bg-[#13131f] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-blue-500/50"
              autoComplete="current-password"
            />
            <button
              type="button"
              disabled={credSaving || !credUsername || !credPassword}
              onClick={async () => {
                const domain = (() => { try { return new URL(pageUrl || 'https://bilimclass.kz').hostname.replace(/^www\./, ''); } catch { return 'bilimclass.kz'; } })();
                setCredSaving(true);
                try {
                  const res = await fetch('/api/agents/browser-credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain, username: credUsername, password: credPassword }),
                  });
                  if (res.ok) {
                    setCredSaved(true);
                    setTimeout(() => setCredDialog(false), 1500);
                  }
                } finally {
                  setCredSaving(false);
                }
              }}
              className="flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-medium text-sm transition-colors"
            >
              {credSaved ? <><Check className="w-4 h-4" /> Сохранено!</> : credSaving ? 'Сохранение...' : <><KeyRound className="w-4 h-4" /> Сохранить</>}
            </button>
          </div>
        </div>
      )}

      {/* Viewport — реальный скриншот Playwright с прямым вводом мыши и клавиатуры */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label="Рабочая область браузера"
        className="flex-1 overflow-hidden relative bg-[#090b12] outline-none"
        style={{ cursor: 'crosshair' }}
        onClick={() => {
          kbInputRef.current?.focus({ preventScroll: true });
          setCanvasFocused(true);
        }}
        onFocus={() => {
          kbInputRef.current?.focus({ preventScroll: true });
          setCanvasFocused(true);
        }}
      >
        {/*
          Скрытый input: перехватывает ввод с клавиатуры после клика на
          скриншот. Пользователь кликает на поле логина/пароля → Playwright
          фокусирует поле в удалённом браузере → ввод направляется напрямую
          в Playwright через keyboard.type / keyboard.press.
        */}
        <input
          ref={kbInputRef}
          type="text"
          defaultValue=""
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Прямой ввод с клавиатуры в рабочую область браузера"
          onFocus={() => setCanvasFocused(true)}
          onBlur={() => {
            setCanvasFocused(false);
            flushTypedBuffer();
          }}
          onKeyDown={handleCanvasKeyDown}
          onChange={handleCanvasInputChange}
          onPaste={handleCanvasPaste}
          className="absolute left-0 top-0 h-0 w-0 opacity-0 pointer-events-none p-0 m-0 border-0"
          tabIndex={-1}
        />

        {!imgSrc && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#090b12] flex-col gap-3">
            <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/55 text-sm">Загрузка безопасного браузера…</p>
          </div>
        )}

        {imgSrc && (
          <>
            {/*
              Нативный <img> вместо Next.js <Image>.
              С нативным <img> click/wheel работают напрямую на пикселях
              скриншота.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imgSrc}
              alt="Browser viewport"
              draggable={false}
              onClick={handleImageClick}
              onWheel={handleWheel}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                userSelect: 'none',
                cursor: 'crosshair',
              }}
            />
          </>
        )}

        {/* Визуальный пинг в месте клика */}
        {clickPing && (
          <span
            key={clickPing.id}
            style={{ left: clickPing.x - 10, top: clickPing.y - 10 }}
            className="pointer-events-none absolute h-5 w-5 rounded-full border-2 border-blue-400/80 bg-blue-400/20 animate-ping"
          />
        )}

        {/* Баннер авторизации (Логин / Пароль / CAPTCHA / 2FA) */}
        {authBarrier?.requiresUserAction && imgSrc && (
          <div className="absolute left-3 right-3 top-2.5 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-[#141726]/95 px-3.5 py-2 text-xs text-amber-100 shadow-xl backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-2">
              <Lock className="size-3.5 shrink-0 text-amber-300" />
              <span className="truncate">
                {authBarrier.reason || 'Кликните на поле логина или пароля прямо на экране и введите данные с клавиатуры'}
              </span>
            </div>
            <button
              type="button"
              disabled={handingOver}
              onClick={(e) => {
                e.stopPropagation();
                void resumeAiControl();
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              <Play className="size-3 fill-current" />
              {handingOver ? 'Передаю ИИ…' : 'Готово — продолжить с ИИ'}
            </button>
          </div>
        )}

        {/* Интерактивная рамка подсветки активного поля прямо на скриншоте удалённой страницы */}
        {imgSrc && fieldOverlayStyle && (
          <div
            style={fieldOverlayStyle}
            className={`pointer-events-none absolute z-20 rounded border-2 transition-all flex items-center px-2 overflow-hidden ${
              activeField?.isPassword
                ? 'border-amber-400/90 shadow-[0_0_0_2px_rgba(251,191,36,0.3)] bg-black/25 backdrop-blur-[1px]'
                : 'border-sky-400/90 shadow-[0_0_0_2px_rgba(56,189,248,0.3)] bg-black/25 backdrop-blur-[1px]'
            }`}
          >
            {canvasFocused && (
              <div className="flex items-center text-xs font-mono text-white/95 select-none truncate">
                <span>{activeField?.isPassword ? '•'.repeat((liveText || activeField?.value || '').length) : (liveText || activeField?.value || '')}</span>
                <span className="inline-block w-0.5 h-3.5 bg-sky-400 animate-pulse ml-0.5 shrink-0" />
              </div>
            )}
          </div>
        )}

        {isInstalling && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#090b12] gap-4 px-8 text-center z-10">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-[3px] border-blue-500/20" />
              <div className="absolute inset-0 rounded-full border-[3px] border-blue-400 border-t-transparent animate-spin" />
            </div>
            <div>
              <p className="text-white/80 font-semibold text-sm">Устанавливаю браузер…</p>
              <p className="text-white/45 text-xs mt-1.5">Первый запуск занимает ~5 минут. Обновите страницу через минуту.</p>
            </div>
            <button type="button" onClick={() => { setError(''); void fetchFrame(); }}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
              Проверить снова
            </button>
          </div>
        )}
        {!isInstalling && error && (
          <div className={`absolute z-10 flex justify-center px-3 ${imgSrc ? 'left-3 right-3 top-3' : 'inset-0 items-center bg-[#090b12]'}`}>
            <div className={`flex max-w-full items-center gap-3 rounded-lg border border-amber-300/20 bg-[#151722]/95 px-3 py-2 shadow-xl ${imgSrc ? 'w-full' : 'flex-col text-center'}`} role="status" aria-live="polite">
              <p className="min-w-0 flex-1 text-sm text-white/75">
                {retryCountdown !== null
                  ? `Подготовка браузера... Автоматическое подключение через ${retryCountdown} сек.`
                  : error}
              </p>
              {dailyQuotaBlocked ? (
                <>
                  <button type="button" onClick={openExternally} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-300/25 bg-sky-300/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-300/20">
                    <ExternalLink className="size-3.5" /> Открыть сайт отдельно
                  </button>
                  <span className="shrink-0 text-xs text-amber-200/70">Сброс в 00:00 UTC</span>
                </>
              ) : isSessionExpired ? (
                <button
                  type="button"
                  onClick={() => {
                    setRetryCountdown(null);
                    setError('');
                    setImgSrc(null);
                    void navigate(landingUrl);
                  }}
                  className="shrink-0 text-sm text-emerald-300 underline underline-offset-2"
                >
                  Обновить сеанс
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRetryCountdown(null);
                    setError('');
                    void navigate(pageUrl || landingUrl);
                  }}
                  className="shrink-0 text-sm text-blue-300 underline underline-offset-2"
                >
                  {retryCountdown !== null ? 'Подключить сейчас' : 'Повторить'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setRetryCountdown(null);
                  setError('');
                }}
                aria-label="Скрыть сообщение"
                className="shrink-0 text-white/50 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
        {loading && (
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin z-20" />
        )}
      </div>

      {/* Status bar */}
      <div className="h-6 bg-[#252536] border-t border-black/20 flex items-center px-3 shrink-0 gap-2">
        <span className="text-[10px] text-white/35 truncate">{pageUrl}</span>
        <span className="ml-auto shrink-0 pl-2 text-[10px] text-white/40">
          {canvasFocused
            ? '⌨ Клавиатура подключена — печатайте прямо на экране (Tab — следующее поле, Enter — ввод)'
            : 'Кликните на поле логина или пароля на экране и печатайте напрямую'}
          {' · Сессия сохраняется ✓'}
        </span>
      </div>
    </div>
  );
}
