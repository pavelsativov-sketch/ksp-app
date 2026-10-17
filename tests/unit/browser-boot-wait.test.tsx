/**
 * Ожидание первого кадра вкладки «Браузер» должно быть объяснимым.
 *
 * Сценарий из жалобы учителя: нажал «BilimClass — Дэшборд учителя» — минуту
 * висит голый спиннер «Загрузка безопасного браузера…», неясно, работает ли
 * система. Теперь на время подъёма песочницы вкладка объясняет, что происходит,
 * показывает, сколько секунд ждём, и оставляет кнопку «Проверить снова».
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserApp } from '@/components/workspace/apps/browser';

/** Ответ сервера, который висит дольше обычного: кадра ещё нет. */
function hangingScreenshot() {
  return new Promise<Response>(() => {
    /* намеренно не резолвим: simulates подъём песочницы */
  });
}

describe('BrowserApp: ожидание первого кадра объяснимо', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        String(url).includes('browser-stream')
          ? hangingScreenshot()
          : Promise.resolve(new Response('{}', { status: 200 })),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('показывает, что идёт подготовка, вместо немого спиннера', async () => {
    render(<BrowserApp />);

    await waitFor(() => {
      expect(screen.getByText(/Запускаю браузер/)).toBeTruthy();
    });
    // Пояснение про минуту ожидания и ручная кнопка повтора — на месте
    expect(screen.getByText(/около минуты/i)).toBeTruthy();
    expect(screen.getByText(/Повтор произойдёт автоматически/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Проверить снова/ })).toBeTruthy();
    // Старый немой текст больше не показывается
    expect(screen.queryByText(/Загрузка безопасного браузера/)).toBeNull();
  });
});