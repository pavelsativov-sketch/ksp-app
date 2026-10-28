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

describe('BrowserApp: ожидание первого кадра объяснимо', () => {
  beforeEach(() => {
    // Sandbox сообщает, что браузер ещё запускается — компонент обязан
    // объяснить это, а не показывать немой спиннер.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        String(url).includes('browser-stream')
          ? Promise.resolve(new Response(JSON.stringify({ error: 'Браузер запускается, подождите' }), { status: 503, headers: { 'content-type': 'application/json' } }))
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