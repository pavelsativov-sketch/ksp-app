'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";

/**
 * Терминал рабочей области.
 *
 * Раньше вспомогательные функции (`writePrompt`, `clearLine`, `runCommand`)
 * были объявлены через `const` ПОСЛЕ эффекта, который их вызывает, —
 * линтер react-hooks/immutability справедливо считал это обращением к
 * переменной до инициализации. Теперь это обычные функции (хостинг) и
 * `useCallback`, а тип терминала взят из пакета вместо `any`.
 *
 * Обращения к серверу ограничены allowlist-ом в
 * `src/app/api/agents/terminal/route.ts`: без авторизации там был exec
 * произвольной команды в процессе Next.js.
 */

const THEME = {
  background: "#0c0c14",
  foreground: "#cccccc",
  cursor: "#4ade80",
  cursorAccent: "#0c0c14",
  selectionBackground: "#264f78",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#4ade80",
  yellow: "#ffcc02",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#9cdcfe",
  white: "#cccccc",
  brightBlack: "#808080",
  brightGreen: "#89d185",
  brightYellow: "#d7ba7d",
  brightCyan: "#4ec9b0",
} as const;

interface TerminalApiResponse {
  success?: boolean;
  output?: string;
  error?: string;
}

export function TerminalApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const [ready, setReady] = useState(false);
  const inputBufRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);
  const cwdRef = useRef("agent@mektep-os");
  const esRef = useRef<EventSource | null>(null);

  const writePrompt = useCallback((term: XTerm) => {
    term.write(
      `\x1b[1;32magent\x1b[0m@\x1b[1;34mmektep-os\x1b[0m:\x1b[1;33m~\x1b[0m\x1b[1;37m$\x1b[0m `,
    );
  }, []);

  const clearLine = useCallback((term: XTerm, len: number) => {
    for (let i = 0; i < len; i += 1) term.write("\b \b");
  }, []);

  const runCommand = useCallback(
    async (term: XTerm, cmd: string) => {
      const lowered = cmd.toLowerCase();

      if (lowered === "clear" || lowered === "cls") {
        term.clear();
        return;
      }

      try {
        // Настоящая постоянная оболочка: состояние (cd, переменные) сохраняется
        // между командами; агент работает в той же сессии.
        const res = await fetch("/api/agents/shell", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd }),
        });

        if (res.status === 401) {
          term.write("\x1b[31mНужно войти в аккаунт, чтобы выполнять команды.\x1b[0m\r\n");
          return;
        }

        const data = (await res.json()) as TerminalApiResponse;
        if (data.output) {
          const output = data.output.replace(/\r?\n/g, "\r\n");
          term.write(output);
          if (!output.endsWith("\n")) term.write("\r\n");
        } else if (data.error) {
          term.write(`\x1b[31m${data.error.replace(/\r?\n/g, "\r\n")}\x1b[0m\r\n`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        term.write(`\x1b[31mОшибка сети: ${message}\x1b[0m\r\n`);
      }
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let term: XTerm | null = null;
    let fitAddon: { fit: () => void; dispose: () => void } | null = null;
    let observer: ResizeObserver | null = null;

    const init = async () => {
      const container = containerRef.current;
      if (!container) return;

      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);
      if (disposed) return;

      // CSS xterm подключаем локально, а не с CDN: внешний запрос был
      // единственной причиной «медленной» отрисовки терминала.
      if (!document.getElementById("xterm-css")) {
        const link = document.createElement("link");
        link.id = "xterm-css";
        link.rel = "stylesheet";
        link.href = "/xterm.css";
        document.head.appendChild(link);
      }

      const instance = new Terminal({
        theme: THEME,
        fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        cursorStyle: "block",
        allowTransparency: true,
        scrollback: 2000,
      });

      const fit = new FitAddon();
      instance.loadAddon(fit);
      instance.loadAddon(new WebLinksAddon());
      instance.open(container);
      fit.fit();

      term = instance;
      fitAddon = fit;
      termRef.current = instance;

      instance.writeln("\x1b[1;34m╔═══════════════════════════════════════════╗\x1b[0m");
      instance.writeln("\x1b[1;34m║\x1b[0m  \x1b[1;32mMektep OS Terminal\x1b[0m\x1b[0m              \x1b[1;34m║\x1b[0m");
      instance.writeln("\x1b[1;34m╚═══════════════════════════════════════════╝\x1b[0m");
      instance.writeln("Введите \x1b[1;33mhelp\x1b[0m для списка команд.\r\n");
      writePrompt(instance);
      setReady(true);

      instance.onKey(async ({ key, domEvent }: { key: string; domEvent: KeyboardEvent }) => {
        const buf = inputBufRef.current;

        if (domEvent.keyCode === 13) {
          instance.write("\r\n");
          const cmd = buf.trim();
          inputBufRef.current = "";
          if (cmd) {
            historyRef.current = [...historyRef.current, cmd];
            histIdxRef.current = -1;
            await runCommand(instance, cmd);
          }
          writePrompt(instance);
          return;
        }

        if (domEvent.keyCode === 8) {
          if (!buf) return;
          inputBufRef.current = buf.slice(0, -1);
          clearLine(instance, 1);
          instance.write("\b");
          return;
        }

        if (domEvent.keyCode === 38 || domEvent.keyCode === 40) {
          const history = historyRef.current;
          if (history.length === 0) return;
          const nextIdx =
            domEvent.keyCode === 38
              ? Math.min(histIdxRef.current + 1, history.length - 1)
              : Math.max(histIdxRef.current - 1, -1);
          histIdxRef.current = nextIdx;
          clearLine(instance, buf.length);
          const value = nextIdx >= 0 ? history[history.length - 1 - nextIdx]! : "";
          inputBufRef.current = value;
          instance.write(value);
          return;
        }

        if (key.length === 1 && !domEvent.ctrlKey && !domEvent.metaKey) {
          inputBufRef.current = buf + key;
        }
      });

      observer = new ResizeObserver(() => fitAddon?.fit());
      observer.observe(container);

      // Живой поток оболочки: сюда же падает вывод команд агента —
      // человек и агент работают в одной среде в реальном времени.
      const es = new EventSource("/api/agents/shell");
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as { snapshot?: string; text?: string };
          const text = data.text ?? data.snapshot ?? "";
          if (text) term!.write(text.replace(/\r?\n/g, "\r\n"));
        } catch { /* некорректный кадр */ }
      };
      esRef.current = es;
    };

    void init();

    return () => {
      disposed = true;
      esRef.current?.close();
      esRef.current = null;
      observer?.disconnect();
      fitAddon?.dispose();
      term?.dispose();
      termRef.current = null;
    };
    // Инициализация один раз: обработчики ниже стабильны через useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0c0c14]">
      <div className="h-8 bg-[#16162a] border-b border-white/[0.04] flex items-center px-3 gap-3 shrink-0">
        <span className="text-[11px] text-white/30 font-mono">shell — mektep-os</span>
        <div className="ml-auto flex items-center gap-2" aria-live="polite">
          <div className={`w-1.5 h-1.5 rounded-full ${ready ? "bg-green-500" : "bg-amber-500"}`} />
          <span className="text-[10px] text-white/25">{ready ? "готово" : "запуск…"}</span>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 p-1 overflow-hidden" />
    </div>
  );
}