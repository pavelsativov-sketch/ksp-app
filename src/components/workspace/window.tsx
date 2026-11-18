'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/lib/store/workspace';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { APP_ICONS } from './app-icons';

interface WindowProps {
  id: string;
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}

/**
 * Каскадное смещение окон. Раньше стартовая позиция бралась из
 * `Math.random()` прямо в useState, поэтому окно прыгало при каждом
 * ремонте и расходилось между сервером и клиентом.
 */
function cascadeOffset(index: number): { x: number; y: number } {
  const safeIndex = Math.max(0, index);
  const step = 28;
  const col = safeIndex % 6;
  const row = Math.floor(safeIndex / 6) % 4;
  return { x: 48 + col * step, y: 32 + row * step };
}

export function Window({ id, title, children, onClose }: WindowProps) {
  const windowState = useWorkspaceStore((s) => s.windows.find((w) => w.id === id));
  const initialIndex = useWorkspaceStore((s) => s.windows.findIndex((w) => w.id === id));
  const isActive = useWorkspaceStore((s) => s.activeWindowId === id);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);
  const minimizeWindow = useWorkspaceStore((s) => s.minimizeWindow);
  const maximizeWindow = useWorkspaceStore((s) => s.maximizeWindow);
  const focusWindow = useWorkspaceStore((s) => s.focusWindow);

  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  // null — размер по умолчанию, зависящий от рабочей области (до 960×640);
  // числа появляются, когда учитель сам меняет размер окна.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Индекс окна в порядке открытия задаёт каскад, а не случайное число.
  const [pos, setPos] = useState(() => cascadeOffset(initialIndex));
  const [interacting, setInteracting] = useState(false);

  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    maxX: Number.POSITIVE_INFINITY,
    maxY: Number.POSITIVE_INFINITY,
    liveX: 0,
    liveY: 0,
  });
  const resizeRef = useRef({
    resizing: false,
    edge: '',
    startX: 0,
    startY: 0,
    origW: 0,
    origH: 0,
    origX: 0,
    origY: 0,
    parentW: Number.POSITIVE_INFINITY,
    parentH: Number.POSITIVE_INFINITY,
    liveW: 0,
    liveH: 0,
    liveX: 0,
    liveY: 0,
  });

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  if (!windowState) return null;

  // Свернутое окно скрываем CSS, а не размонтированием: иначе приложение
  // (терминал, редактор, файлы) теряло бы своё состояние при сворачивании.
  const minimized = Boolean(windowState.isMinimized);
  const isMax = windowState.isMaximized;
  const AppIcon = APP_ICONS[windowState.type];

  const close = () => {
    closeWindow(id);
    onClose?.();
  };

  // --- Drag (RAF + translate3d without per-frame React renders or layout reads) ---
  const onTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMax || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    if (!isActive) focusWindow(id);
    const el = containerRef.current;
    const parent = el?.parentElement;
    const maxX = parent && el ? Math.max(0, parent.clientWidth - el.offsetWidth) : Number.POSITIVE_INFINITY;
    const maxY = parent && el ? Math.max(0, parent.clientHeight - el.offsetHeight) : Number.POSITIVE_INFINITY;
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      maxX,
      maxY,
      liveX: pos.x,
      liveY: pos.y,
    };
    setInteracting(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* jsdom */ }
  };

  const onTitlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    d.liveX = Math.max(0, Math.min(d.maxX, d.origX + (e.clientX - d.startX)));
    d.liveY = Math.max(0, Math.min(d.maxY, d.origY + (e.clientY - d.startY)));
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = containerRef.current;
      if (el && dragRef.current.dragging) {
        el.style.transform = `translate3d(${dragRef.current.liveX - pos.x}px, ${dragRef.current.liveY - pos.y}px, 0)`;
      }
    });
  };

  const finishDrag = (e?: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    d.dragging = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const el = containerRef.current;
    if (el) el.style.transform = '';
    setPos({ x: d.liveX, y: d.liveY });
    setInteracting(false);
    if (e) {
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch { /* jsdom */ }
    }
  };

  // --- Resize (RAF + direct style preview without per-frame React renders) ---
  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>, edge: string) => {
    if (isMax || e.button !== 0) return;
    e.stopPropagation();
    if (!isActive) focusWindow(id);
    const el = containerRef.current;
    const parent = el?.parentElement;
    const origW = size?.w ?? el?.offsetWidth ?? 960;
    const origH = size?.h ?? el?.offsetHeight ?? 640;
    resizeRef.current = {
      resizing: true,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      origW,
      origH,
      origX: pos.x,
      origY: pos.y,
      parentW: parent ? parent.clientWidth : Number.POSITIVE_INFINITY,
      parentH: parent ? parent.clientHeight : Number.POSITIVE_INFINITY,
      liveW: origW,
      liveH: origH,
      liveX: pos.x,
      liveY: pos.y,
    };
    setInteracting(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* jsdom */ }
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r.resizing) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    let newW = r.origW, newH = r.origH, newX = r.origX, newY = r.origY;

    if (r.edge.includes('e')) newW = Math.max(420, r.origW + dx);
    if (r.edge.includes('s')) newH = Math.max(280, r.origH + dy);
    if (r.edge.includes('w')) { newW = Math.max(420, r.origW - dx); newX = r.origX + (r.origW - newW); }
    if (r.edge.includes('n')) { newH = Math.max(280, r.origH - dy); newY = r.origY + (r.origH - newH); }

    if (Number.isFinite(r.parentW) && Number.isFinite(r.parentH)) {
      newX = Math.max(0, Math.min(newX, r.parentW));
      newY = Math.max(0, Math.min(newY, r.parentH));
      const maxW = Math.max(280, r.parentW - newX);
      const maxH = Math.max(160, r.parentH - newY);
      newW = Math.min(newW, maxW);
      newH = Math.min(newH, maxH);
      newX = Math.min(newX, Math.max(0, r.parentW - newW));
      newY = Math.min(newY, Math.max(0, r.parentH - newH));
    }

    r.liveW = newW;
    r.liveH = newH;
    r.liveX = newX;
    r.liveY = newY;

    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = containerRef.current;
      const curr = resizeRef.current;
      if (el && curr.resizing) {
        el.style.width = `${curr.liveW}px`;
        el.style.height = `${curr.liveH}px`;
        el.style.maxWidth = 'none';
        el.style.maxHeight = 'none';
        el.style.transform = `translate3d(${curr.liveX - pos.x}px, ${curr.liveY - pos.y}px, 0)`;
      }
    });
  };

  const finishResize = (e?: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r.resizing) return;
    r.resizing = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const el = containerRef.current;
    if (el) el.style.transform = '';
    setSize({ w: r.liveW, h: r.liveH });
    setPos({ x: r.liveX, y: r.liveY });
    setInteracting(false);
    if (e) {
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch { /* jsdom */ }
    }
  };

  const style: React.CSSProperties = isMax
    ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: windowState.zIndex, borderRadius: 0, display: minimized ? 'none' : undefined }
    // max-* удерживает окно внутри рабочей области: в двухпанельной раскладке
    // колонка уже, чем размер окна по умолчанию (960×640).
    : {
        position: 'absolute', top: pos.y, left: pos.x,
        width: size ? size.w : 'min(960px, 92%)',
        height: size ? size.h : 'min(640px, 88%)',
        maxWidth: `calc(100% - ${Math.max(0, pos.x)}px)`,
        maxHeight: `calc(100% - ${Math.max(0, pos.y)}px)`,
        zIndex: windowState.zIndex,
        display: minimized ? 'none' : undefined,
        willChange: interacting ? 'transform' : undefined,
      };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col overflow-hidden transition-[border-radius,box-shadow] duration-150 animate-in fade-in zoom-in-95 ${isMax ? '' : 'rounded-xl'} border ${isActive ? 'border-white/20 shadow-2xl shadow-black/60' : 'border-white/[0.08] shadow-lg shadow-black/30'}`}
      style={style}
      onPointerDown={() => {
        if (!isActive) focusWindow(id);
      }}
    >
      {/* Title Bar */}
      <div
        className={`h-9 flex items-center justify-between px-3 select-none shrink-0 transition-colors ${isActive ? 'bg-[#332b68]' : 'bg-[#241d52]'}`}
        style={{ cursor: isMax ? 'default' : 'move' }}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={() => finishDrag()}
        onDoubleClick={() => maximizeWindow(id)}
      >
        <span className={`flex min-w-0 items-center gap-2 text-[12px] font-medium pointer-events-none ${isActive ? 'text-white/90' : 'text-white/50'}`}>
          <AppIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{title}</span>
        </span>
        <div className="flex items-center gap-0.5 -mr-1" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); minimizeWindow(id); }}
            aria-label={`Свернуть окно «${title}»`}
            className="w-8 h-7 flex items-center justify-center hover:bg-white/[0.08] rounded-md transition-colors"
          >
            <Minus className="w-3.5 h-3.5 text-white/50" />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); maximizeWindow(id); }}
            aria-label={isMax ? `Восстановить окно «${title}»` : `Развернуть окно «${title}»`}
            className="w-8 h-7 flex items-center justify-center hover:bg-white/[0.08] rounded-md transition-colors"
          >
            {isMax ? <Maximize2 className="w-3 h-3 text-white/50" /> : <Square className="w-3 h-3 text-white/50" />}
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); close(); }}
            aria-label={`Закрыть окно «${title}»`}
            className="w-8 h-7 flex items-center justify-center hover:bg-red-500/80 rounded-md transition-colors group"
          >
            <X className="w-3.5 h-3.5 text-white/50 group-hover:text-white" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden bg-[#1b1640] flex flex-col min-h-0">
        {children}
        {(interacting || (windowState.type === 'iframe' && !isActive)) && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-20"
            onPointerDown={() => {
              if (!isActive) focusWindow(id);
            }}
          />
        )}
      </div>

      {/* Resize handles (only when not maximized) */}
      {!isMax && (
        <>
          <div className="absolute top-0 left-0 right-0 h-1 cursor-n-resize" onPointerDown={(ev) => onResizePointerDown(ev, 'n')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
          <div className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize" onPointerDown={(ev) => onResizePointerDown(ev, 's')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
          <div className="absolute top-0 left-0 bottom-0 w-1 cursor-w-resize" onPointerDown={(ev) => onResizePointerDown(ev, 'w')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
          <div className="absolute top-0 right-0 bottom-0 w-1 cursor-e-resize" onPointerDown={(ev) => onResizePointerDown(ev, 'e')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
          <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" onPointerDown={(e) => onResizePointerDown(e, 'se')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
          <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" onPointerDown={(e) => onResizePointerDown(e, 'sw')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
          <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" onPointerDown={(e) => onResizePointerDown(e, 'ne')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
          <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" onPointerDown={(e) => onResizePointerDown(e, 'nw')} onPointerMove={onResizePointerMove} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => finishResize()} />
        </>
      )}
    </div>
  );
}
