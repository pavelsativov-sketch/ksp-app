'use client';

import React, { useRef, useState } from 'react';
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
  const step = 28;
  const col = index % 6;
  const row = Math.floor(index / 6) % 4;
  return { x: 48 + col * step, y: 32 + row * step };
}

export function Window({ id, title, children, onClose }: WindowProps) {
  const { windows, activeWindowId, closeWindow, minimizeWindow, maximizeWindow, focusWindow } = useWorkspaceStore();
  const windowState = windows.find(w => w.id === id);
  const containerRef = useRef<HTMLDivElement>(null);
  // null — размер по умолчанию, зависящий от рабочей области (до 960×640);
  // числа появляются, когда учитель сам меняет размер окна.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Индекс окна в порядке открытия задаёт каскад, а не случайное число.
  const [pos, setPos] = useState(() => cascadeOffset(windows.findIndex(w => w.id === id)));
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const resizeRef = useRef({ resizing: false, edge: '', startX: 0, startY: 0, origW: 0, origH: 0, origX: 0, origY: 0 });

  if (!windowState) return null;

  // Свернутое окно скрываем CSS, а не размонтированием: иначе приложение
  // (терминал, редактор, файлы) теряло бы своё состояние при сворачивании.
  const minimized = Boolean(windowState.isMinimized);
  const isMax = windowState.isMaximized;
  const isActive = activeWindowId === id;
  const AppIcon = APP_ICONS[windowState.type];

  const close = () => {
    closeWindow(id);
    onClose?.();
  };

  // --- Drag ---
  const onTitlePointerDown = (e: React.PointerEvent) => {
    if (isMax) return;
    focusWindow(id);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onTitlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const parent = containerRef.current?.parentElement;
    const windowElement = containerRef.current;
    const maxX = parent && windowElement ? Math.max(0, parent.clientWidth - windowElement.offsetWidth) : Number.POSITIVE_INFINITY;
    const maxY = parent && windowElement ? Math.max(0, parent.clientHeight - windowElement.offsetHeight) : Number.POSITIVE_INFINITY;
    setPos({
      x: Math.max(0, Math.min(maxX, dragRef.current.origX + (e.clientX - dragRef.current.startX))),
      y: Math.max(0, Math.min(maxY, dragRef.current.origY + (e.clientY - dragRef.current.startY))),
    });
  };
  const onTitlePointerUp = (e: React.PointerEvent) => {
    dragRef.current.dragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // --- Resize ---
  const onResizePointerDown = (e: React.PointerEvent, edge: string) => {
    if (isMax) return;
    e.stopPropagation();
    focusWindow(id);
    // Обработчик объявлен обычной функцией, а не каррированной фабрикой:
    // иначе линтер react-hooks/refs считал запись в ref «доступом во время рендера».
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const el = containerRef.current;
    resizeRef.current = { resizing: true, edge, startX: e.clientX, startY: e.clientY, origW: size?.w ?? el?.offsetWidth ?? 960, origH: size?.h ?? el?.offsetHeight ?? 640, origX: pos.x, origY: pos.y };
  };
  const onResizePointerMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r.resizing) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    let newW = r.origW, newH = r.origH, newX = r.origX, newY = r.origY;

    if (r.edge.includes('e')) newW = Math.max(420, r.origW + dx);
    if (r.edge.includes('s')) newH = Math.max(280, r.origH + dy);
    if (r.edge.includes('w')) { newW = Math.max(420, r.origW - dx); newX = r.origX + (r.origW - newW); }
    if (r.edge.includes('n')) { newH = Math.max(280, r.origH - dy); newY = r.origY + (r.origH - newH); }

    const parent = containerRef.current?.parentElement;
    if (parent) {
      newX = Math.max(0, Math.min(newX, parent.clientWidth));
      newY = Math.max(0, Math.min(newY, parent.clientHeight));
      const maxW = Math.max(280, parent.clientWidth - newX);
      const maxH = Math.max(160, parent.clientHeight - newY);
      newW = Math.min(newW, maxW);
      newH = Math.min(newH, maxH);
      newX = Math.min(newX, Math.max(0, parent.clientWidth - newW));
      newY = Math.min(newY, Math.max(0, parent.clientHeight - newH));
    }

    setSize({ w: newW, h: newH });
    setPos({ x: newX, y: newY });
  };
  const onResizePointerUp = (e: React.PointerEvent) => {
    resizeRef.current.resizing = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
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
      };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col overflow-hidden transition-[border-radius,box-shadow] duration-150 animate-in fade-in zoom-in-95 ${isMax ? '' : 'rounded-xl'} border ${isActive ? 'border-white/20 shadow-2xl shadow-black/60' : 'border-white/[0.08] shadow-lg shadow-black/30'}`}
      style={style}
      onMouseDown={() => focusWindow(id)}
    >
      {/* Title Bar */}
      <div
        className={`h-9 flex items-center justify-between px-3 select-none shrink-0 transition-colors ${isActive ? 'bg-[#34344b]' : 'bg-[#25253a]'}`}
        style={{ cursor: isMax ? 'default' : 'move' }}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onDoubleClick={() => maximizeWindow(id)}
      >
        <span className={`flex min-w-0 items-center gap-2 text-[12px] font-medium pointer-events-none ${isActive ? 'text-white/90' : 'text-white/50'}`}>
          <AppIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{title}</span>
        </span>
        <div className="flex items-center gap-0.5 -mr-1">
          <button
            onClick={e => { e.stopPropagation(); minimizeWindow(id); }}
            aria-label={`Свернуть окно «${title}»`}
            className="w-8 h-7 flex items-center justify-center hover:bg-white/[0.08] rounded-md transition-colors"
          >
            <Minus className="w-3.5 h-3.5 text-white/50" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); maximizeWindow(id); }}
            aria-label={isMax ? `Восстановить окно «${title}»` : `Развернуть окно «${title}»`}
            className="w-8 h-7 flex items-center justify-center hover:bg-white/[0.08] rounded-md transition-colors"
          >
            {isMax ? <Maximize2 className="w-3 h-3 text-white/50" /> : <Square className="w-3 h-3 text-white/50" />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); close(); }}
            aria-label={`Закрыть окно «${title}»`}
            className="w-8 h-7 flex items-center justify-center hover:bg-red-500/80 rounded-md transition-colors group"
          >
            <X className="w-3.5 h-3.5 text-white/50 group-hover:text-white" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-[#1e1e2e] flex flex-col min-h-0">
        {children}
      </div>

      {/* Resize handles (only when not maximized) */}
      {!isMax && (
        <>
          <div className="absolute top-0 left-0 right-0 h-1 cursor-n-resize" onPointerDown={(ev) => onResizePointerDown(ev, 'n')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize" onPointerDown={(ev) => onResizePointerDown(ev, 's')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute top-0 left-0 bottom-0 w-1 cursor-w-resize" onPointerDown={(ev) => onResizePointerDown(ev, 'w')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute top-0 right-0 bottom-0 w-1 cursor-e-resize" onPointerDown={(ev) => onResizePointerDown(ev, 'e')} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" onPointerDown={((e) => onResizePointerDown(e, 'se'))} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" onPointerDown={((e) => onResizePointerDown(e, 'sw'))} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" onPointerDown={((e) => onResizePointerDown(e, 'ne'))} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" onPointerDown={((e) => onResizePointerDown(e, 'nw'))} onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
        </>
      )}
    </div>
  );
}
