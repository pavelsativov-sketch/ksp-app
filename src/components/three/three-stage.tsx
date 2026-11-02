"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneHandle, SceneName } from "./scenes";

/** Запасной робот, если WebGL недоступен: экран не остаётся с дырой. */
function RobotFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <circle cx="60" cy="14" r="5" fill="#a98bff" />
      <rect x="58" y="16" width="4" height="12" fill="#7c4dff" />
      <rect x="20" y="28" width="80" height="56" rx="26" fill="#fff" stroke="#e3dcff" />
      <rect x="30" y="40" width="60" height="32" rx="15" fill="#15103c" />
      <rect x="42" y="49" width="8" height="13" rx="4" fill="#6ff2ff" />
      <rect x="70" y="49" width="8" height="13" rx="4" fill="#6ff2ff" />
      <rect x="36" y="88" width="48" height="26" rx="13" fill="#fff" stroke="#e3dcff" />
    </svg>
  );
}

/**
 * Настоящая 3D-сцена. three.js подгружается отдельно, чтобы не утяжелять первый экран;
 * рисование останавливается вне экрана и в скрытой вкладке, при «меньше движения» кадр один.
 */
export function ThreeStage({ scene, className }: { scene: SceneName; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handle: SceneHandle | undefined;
    let raf = 0;
    let onScreen = true;
    let disposed = false;
    const pointer = { x: 0, y: 0 };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();

    const draw = () => {
      handle?.frame((performance.now() - started) / 1000, pointer);
    };
    const loop = () => {
      draw();
      raf = onScreen && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!still && handle && onScreen && !document.hidden && raf === 0) raf = requestAnimationFrame(loop);
    };
    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      pointer.x = clamp((event.clientX - (box.left + box.width / 2)) / 520);
      pointer.y = clamp(-(event.clientY - (box.top + box.height / 2)) / 420);
    };
    const resize = new ResizeObserver(() => {
      handle?.resize(canvas.clientWidth, canvas.clientHeight);
      if (still) draw();
    });
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = Boolean(entry?.isIntersecting);
      wake();
    });

    void import("./scenes")
      .then(({ mountScene }) => {
        if (disposed) return;
        handle = mountScene(canvas, scene);
        handle.resize(canvas.clientWidth, canvas.clientHeight);
        resize.observe(canvas);
        visibility.observe(canvas);
        if (still) draw();
        else wake();
      })
      .catch(() => setFailed(true));

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      visibility.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", wake);
      handle?.dispose();
    };
  }, [scene]);

  if (failed) return scene === "robot" ? <RobotFallback className={className} /> : null;
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
