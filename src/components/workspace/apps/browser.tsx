'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, X, Home, Shield, LogOut,
  ExternalLink, Lock, Play, User, Eye, EyeOff, CornerDownLeft,
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
  const [clickPing, setClickPing] = useState<{ x: number; y: number; id: number } | null>(null);
  const [handingOver, setHandingOver] = useState(false);

  const [fieldLiveValue, setFieldLiveValue] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [imgLayout, setImgLayout] = useState<{ width: number; height: number } | null>(null);
  const fieldLiveValueRef = useRef('');
  const currentFieldKeyRef = useRef('');
  const fieldHistoryRef = useRef<Record<string, string>>({});
  const liveInputRef = useRef<HTMLInputElement | null>(null);

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

  const landingUrl = initialUrl?.trim() || 'https://www.google.com';
  const dailyQuotaBlocked = /дневн.{0,30}лимит/i.test(error);
  const isInstalling = /устанавливается|запускается.*мин|failed to start/i.test(error);

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
        const newKey = `${parsed.name || ''}_${parsed.type || ''}_${parsed.box ? `${parsed.box.x},${parsed.box.y}` : ''}`;
        if (newKey && newKey !== currentFieldKeyRef.current) {
          if (currentFieldKeyRef.current) {
            fieldHistoryRef.current[currentFieldKeyRef.current] = fieldLiveValueRef.current;
          }
          currentFieldKeyRef.current = newKey;
          const nextVal = fieldHistoryRef.current[newKey] ?? parsed.value ?? '';
          fieldLiveValueRef.current = nextVal;
          setFieldLiveValue(nextVal);
          setShowPassword(false);
        }
      } catch { /* ignore */ }
    } else {
      setActiveField(null);
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
    setLoading(true);
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

  const clearSession = useCallback(async () => {
    if (!window.confirm('Завершить внешний сеанс и удалить сохранённые данные входа?')) return;
    const res = await fetch(BASE, { method: 'DELETE' });
    if (!res.ok) { setError('Не удалось очистить сеанс'); return; }
    setPageTitle(''); setPageUrl(''); setImgSrc(null); setInputUrl(landingUrl);
    setActiveField(null); setAuthBarrier(null);
    fieldHistoryRef.current = {};
    currentFieldKeyRef.current = '';
    fieldLiveValueRef.current = '';
    setFieldLiveValue('');
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
    const img = imgRef.current;
    if (!img) return;

    // Захватываем фокус для прямого ввода с клавиатуры и в строку ОС
    liveInputRef.current?.focus({ preventScroll: true });
    kbInputRef.current?.focus({ preventScroll: true });
    setCanvasFocused(true);

    // Рассчитываем реальные координаты пикселя в удалённом браузере
    const rect = img.getBoundingClientRect();
    // object-contain сохраняет пропорции; вычисляем реальный масштаб
    const scaleX = REMOTE_W / rect.width;
    const scaleY = REMOTE_H / rect.height;
    // Учитываем letterbox (если контейнер шире/выше изображения)
    const scale = Math.max(scaleX, scaleY);
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
    const nextVal = fieldLiveValueRef.current + chars;
    fieldLiveValueRef.current = nextVal;
    setFieldLiveValue(nextVal);
    if (currentFieldKeyRef.current) {
      fieldHistoryRef.current[currentFieldKeyRef.current] = nextVal;
    }
    typeBufferRef.current += chars;
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    typeTimerRef.current = setTimeout(() => {
      flushTypedBuffer();
    }, 180);
  }, [flushTypedBuffer]);

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      // Let onPaste handle clipboard paste
      return;
    }
    const specialKeys = ['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (specialKeys.includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Backspace') {
        const nextVal = fieldLiveValueRef.current.slice(0, -1);
        fieldLiveValueRef.current = nextVal;
        setFieldLiveValue(nextVal);
        if (currentFieldKeyRef.current) {
          fieldHistoryRef.current[currentFieldKeyRef.current] = nextVal;
        }
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

  const handleLiveInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    const oldVal = fieldLiveValueRef.current;
    fieldLiveValueRef.current = newVal;
    setFieldLiveValue(newVal);
    if (currentFieldKeyRef.current) {
      fieldHistoryRef.current[currentFieldKeyRef.current] = newVal;
    }

    if (newVal.startsWith(oldVal)) {
      const added = newVal.slice(oldVal.length);
      typeBufferRef.current += added;
      if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
      typeTimerRef.current = setTimeout(() => {
        flushTypedBuffer();
      }, 180);
    } else {
      flushTypedBuffer();
      void (async () => {
        await enqueueAction({ action: 'key', key: 'Control+A' }).catch(() => {});
        await enqueueAction({ action: 'key', key: 'Backspace' }).catch(() => {});
        if (newVal) {
          await enqueueAction({ action: 'type', text: newVal }).catch(() => {});
        }
      })();
    }
  }, [enqueueAction, flushTypedBuffer]);

  const handleLiveInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      flushTypedBuffer();
      void enqueueAction({ action: 'key', key: 'Enter' });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      flushTypedBuffer();
      void enqueueAction({ action: 'key', key: 'Tab' });
    } else if (e.key === 'Escape') {
      liveInputRef.current?.blur();
    }
  }, [enqueueAction, flushTypedBuffer]);

  const handleClearField = useCallback(() => {
    fieldLiveValueRef.current = '';
    setFieldLiveValue('');
    typeBufferRef.current = '';
    if (currentFieldKeyRef.current) {
      fieldHistoryRef.current[currentFieldKeyRef.current] = '';
    }
    flushTypedBuffer();
    void (async () => {
      await enqueueAction({ action: 'key', key: 'Control+A' }).catch(() => {});
      await enqueueAction({ action: 'key', key: 'Backspace' }).catch(() => {});
    })();
    liveInputRef.current?.focus();
  }, [enqueueAction, flushTypedBuffer]);

  const handleSendTab = useCallback(() => {
    flushTypedBuffer();
    void enqueueAction({ action: 'key', key: 'Tab' });
  }, [enqueueAction, flushTypedBuffer]);

  const handleSendEnter = useCallback(() => {
    flushTypedBuffer();
    void enqueueAction({ action: 'key', key: 'Enter' });
  }, [enqueueAction, flushTypedBuffer]);

  const handleCanvasInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    e.target.value = '';
    queueCharacters(val);
  }, [queueCharacters]);

  const handleCanvasPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    flushTypedBuffer();
    void enqueueAction({ action: 'type', text: pasted });
  }, [enqueueAction, flushTypedBuffer]);

  // Handle scroll on the screenshot
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    void doAction({ action: 'scroll', dy: Math.round(e.deltaY).toString() });
  }, [doAction]);

  // Load on mount
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const restoredUrl = await fetchFrame();
      if (restoredUrl === 'about:blank' || !restoredUrl) await navigate(landingUrl);
    })();
  }, [fetchFrame, landingUrl, navigate]);

  // Sync when parent passes a new initialUrl (e.g., when AI agent or connector navigates)
  useEffect(() => {
    const trimmed = initialUrl?.trim() || '';
    if (!trimmed || trimmed === lastInitialUrlRef.current) return;
    lastInitialUrlRef.current = trimmed;
    void navigate(trimmed);
  }, [navigate, initialUrl]);

  // Periodic frame sync so live agent actions inside OS Workspace are visible immediately
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && pendingCountRef.current === 0 && !typeBufferRef.current) {
        void fetchFrame();
      }
    }, 3500);
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
    const scale = Math.max(scaleX, scaleY);
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
      </div>

      {/* Viewport — реальный скриншот Playwright с прямым вводом мыши и клавиатуры */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-[#090b12]"
        style={{ cursor: 'crosshair' }}
        // Фокус клавиатуры при клике на любое место контейнера
        onClick={() => {
          kbInputRef.current?.focus({ preventScroll: true });
          setCanvasFocused(true);
        }}
      >
        {/*
          Скрытый input: перехватывает все нажатия клавиш после клика на
          скриншот. Пользователь кликает на поле логина/пароля → event
          handleImageClick отправляет клик в Playwright → браузер фокусирует
          поле → пользователь просто печатает прямо в контейнере — ввод
          проксируется через handleCanvasKeyDown / handleCanvasInputChange.
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
          className="pointer-events-none fixed -left-[9999px] top-0 h-1 w-1 opacity-0"
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
              Причина: Next.js <Image> оборачивает <img> в <span> с
              overflow:hidden, что поглощает pointer events и делает
              getBoundingClientRect() неточным для координат клика.
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
                // pointer-events должны быть enabled (по умолчанию)
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
                {authBarrier.reason || 'Кликните на поле логина или пароля прямо на экране — курсор превратится в ✚, затем просто начните печатать'}
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

        {/* Интерактивная рамка и живой текст прямо над полем удалённой страницы */}
        {imgSrc && fieldOverlayStyle && (
          <div
            style={fieldOverlayStyle}
            className={`pointer-events-none absolute z-20 flex items-center overflow-hidden rounded border-2 px-2 text-xs shadow-lg backdrop-blur-[1px] transition-all ${
              activeField?.isPassword
                ? 'border-amber-400 bg-amber-950/40 text-amber-100 shadow-amber-500/20'
                : 'border-sky-400 bg-slate-950/40 text-sky-100 shadow-sky-500/20'
            }`}
          >
            <span className="truncate font-mono font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {fieldLiveValue
                ? (activeField?.isPassword
                    ? (showPassword ? fieldLiveValue : '•'.repeat(fieldLiveValue.length))
                    : fieldLiveValue)
                : (
                  <span className="opacity-40 italic">
                    {activeField?.placeholder || (activeField?.isPassword ? 'Пароль' : 'Логин')}
                  </span>
                )}
            </span>
            <span className="ml-1 inline-block h-3.5 w-[2px] animate-pulse bg-sky-300" />
          </div>
        )}

        {/* Панель прямого дублирования ввода в ОС (Логин / Пароль / Поля) */}
        {imgSrc && (activeField?.isEditable || fieldLiveValue || authBarrier?.requiresUserAction) && (
          <div
            data-testid="live-input-bar"
            className="absolute bottom-3 left-3 right-3 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-white/20 bg-[#121526]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md"
          >
            {/* Иконка и название поля */}
            <div
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                activeField?.isPassword
                  ? 'border border-amber-400/40 bg-amber-500/20 text-amber-200'
                  : 'border border-sky-400/40 bg-sky-500/20 text-sky-200'
              }`}
            >
              {activeField?.isPassword ? (
                <Lock className="size-3.5 text-amber-300" />
              ) : (
                <User className="size-3.5 text-sky-300" />
              )}
              <span>
                {activeField?.isPassword
                  ? 'Пароль'
                  : (activeField?.label || activeField?.placeholder || activeField?.name || 'Логин')}
              </span>
            </div>

            {/* Поле ввода в ОС: мгновенное дублирование с клавиатуры и прямой ввод */}
            <div className="relative flex min-w-[200px] flex-1 items-center">
              <input
                ref={liveInputRef}
                type={activeField?.isPassword && !showPassword ? 'password' : 'text'}
                value={fieldLiveValue}
                onChange={handleLiveInputChange}
                onKeyDown={handleLiveInputKeyDown}
                placeholder={
                  activeField?.isPassword
                    ? 'Печатайте пароль — дублируется в ОС…'
                    : `Печатайте «${activeField?.placeholder || activeField?.name || 'логин'}» — дублируется в ОС…`
                }
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label="Прямой ввод в активное поле ОС"
                className="w-full rounded-lg border border-white/20 bg-black/50 px-3 py-1.5 pr-8 font-mono text-xs text-white placeholder-white/40 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
              />
              {activeField?.isPassword && (
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 text-white/50 hover:text-white"
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              )}
            </div>

            {/* Счётчик символов для пароля */}
            {activeField?.isPassword && fieldLiveValue && (
              <span className="shrink-0 text-[11px] text-amber-300/80 font-mono">
                {fieldLiveValue.length} симв.
              </span>
            )}

            {/* Кнопки действий */}
            <div className="flex shrink-0 items-center gap-1.5">
              {fieldLiveValue && (
                <button
                  type="button"
                  onClick={handleClearField}
                  className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                  title="Очистить"
                  aria-label="Очистить"
                >
                  <X className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleSendTab}
                className="rounded-lg bg-white/10 px-2 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/15 hover:text-white"
                title="Перейти к следующему полю (Tab)"
              >
                Tab ⇥
              </button>
              <button
                type="button"
                onClick={handleSendEnter}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  activeField?.isPassword
                    ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                    : 'bg-sky-400 text-slate-950 hover:bg-sky-300'
                }`}
                title="Отправить (Enter)"
              >
                <CornerDownLeft className="size-3" />
                <span>{activeField?.isPassword ? 'Войти' : 'Ввести'}</span>
              </button>
            </div>
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
              <p className="min-w-0 flex-1 text-sm text-white/75">{error}</p>
              {dailyQuotaBlocked ? (
                <>
                  <button type="button" onClick={openExternally} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-300/25 bg-sky-300/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-300/20">
                    <ExternalLink className="size-3.5" /> Открыть сайт отдельно
                  </button>
                  <span className="shrink-0 text-xs text-amber-200/70">Сброс в 00:00 UTC</span>
                </>
              ) : (
                <button type="button" onClick={() => void navigate(pageUrl || landingUrl)} className="shrink-0 text-sm text-blue-300 underline underline-offset-2">Повторить</button>
              )}
              <button type="button" onClick={() => setError('')} aria-label="Скрыть сообщение" className="shrink-0 text-white/50 hover:text-white"><X className="size-4" /></button>
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
            ? '⌨ Клавиатура подключена — кликни на поле и печатай прямо здесь'
            : 'Кликни на поле логина/пароля прямо на экране, затем печатай'}
          {' · Сессии сохраняются ✓'}
        </span>
      </div>
    </div>
  );
}
