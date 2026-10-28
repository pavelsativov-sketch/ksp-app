/**
 * Тестирование прямого ввода с клавиатуры и взаимодействия со страницей в BrowserApp.
 *
 * Проверяется:
 * 1. Никаких раздражающих всплывающих панелей (live-input-bar) внизу нет — ввод происходит прямо на экране.
 * 2. Клик по экрану отправляет координаты клика в удалённый браузер и активирует клавиатурный ввод.
 * 3. Набор символов с клавиатуры напрямую отправляет { action: 'type', text } в удалённый браузер.
 * 4. Нажатие Tab отправляет { action: 'key', key: 'Tab' }.
 * 5. Нажатие Enter отправляет { action: 'key', key: 'Enter' }.
 * 6. Нажатие Backspace отправляет { action: 'key', key: 'Backspace' }.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserApp } from '@/components/workspace/apps/browser';

describe('BrowserApp: прямой ввод с клавиатуры прямо на экране', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const dummyPng = new Blob(['dummy'], { type: 'image/jpeg' });
      const activeField = {
        isEditable: true,
        isPassword: false,
        tag: 'input',
        type: 'text',
        label: 'Логин',
        name: 'username',
        placeholder: 'Логин или email',
        box: { x: 400, y: 300, width: 300, height: 40 },
      };

      const headers = new Headers({
        'Content-Type': 'image/jpeg',
        'X-Page-Title': encodeURIComponent('BilimClass Login'),
        'X-Page-Url': encodeURIComponent('https://www.bilimclass.kz/login'),
        'X-Active-Field': encodeURIComponent(JSON.stringify(activeField)),
      });

      return Promise.resolve(new Response(dummyPng, { headers, status: 200 }));
    }));

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-image'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('НЕ отображает отдельную нижнюю панель live-input-bar — пользователь работает прямо с экраном', async () => {
    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByAltText('Экран браузера')).toBeDefined();
    });

    // Отдельная нижняя панель ввода отсутствует
    expect(screen.queryByTestId('live-input-bar')).toBeNull();
  });

  it('клик по экрану отправляет координаты клика в удалённый браузер', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const dummyPng = new Blob(['dummy'], { type: 'image/jpeg' });
      const headers = new Headers({
        'Content-Type': 'image/jpeg',
        'X-Page-Title': encodeURIComponent('BilimClass Login'),
        'X-Page-Url': encodeURIComponent('https://www.bilimclass.kz/login'),
      });
      return Promise.resolve(new Response(dummyPng, { headers, status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByAltText('Экран браузера')).toBeDefined();
    });

    const img = screen.getByAltText('Экран браузера');
    // Мокируем getBoundingClientRect
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1280,
      height: 800,
      right: 1280,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    act(() => {
      fireEvent.click(img, { clientX: 450, clientY: 320 });
    });

    await waitFor(() => {
      const clickCalls = fetchMock.mock.calls.filter((call) => {
        try {
          const body = JSON.parse(call[1]?.body as string);
          return body.action === 'click';
        } catch {
          return false;
        }
      });
      expect(clickCalls.length).toBeGreaterThan(0);
    });
  });

  it('прямой ввод с клавиатуры отправляет введённый текст в удалённый браузер', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const dummyPng = new Blob(['dummy'], { type: 'image/jpeg' });
      const headers = new Headers({
        'Content-Type': 'image/jpeg',
        'X-Page-Title': encodeURIComponent('BilimClass Login'),
        'X-Page-Url': encodeURIComponent('https://www.bilimclass.kz/login'),
      });
      return Promise.resolve(new Response(dummyPng, { headers, status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Прямой ввод с клавиатуры в рабочую область браузера')).toBeDefined();
    });

    const kbInput = screen.getByLabelText('Прямой ввод с клавиатуры в рабочую область браузера');

    act(() => {
      fireEvent.change(kbInput, { target: { value: 'teacher123' } });
    });

    await waitFor(() => {
      const typeCalls = fetchMock.mock.calls.filter((call) => {
        try {
          const body = JSON.parse(call[1]?.body as string);
          return body.action === 'type' && body.text === 'teacher123';
        } catch {
          return false;
        }
      });
      expect(typeCalls.length).toBeGreaterThan(0);
    });
  });

  it('нажатия Tab, Enter и Backspace отправляют клавиши в удалённый браузер', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const dummyPng = new Blob(['dummy'], { type: 'image/jpeg' });
      const headers = new Headers({
        'Content-Type': 'image/jpeg',
        'X-Page-Title': encodeURIComponent('BilimClass Login'),
        'X-Page-Url': encodeURIComponent('https://www.bilimclass.kz/login'),
      });
      return Promise.resolve(new Response(dummyPng, { headers, status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Прямой ввод с клавиатуры в рабочую область браузера')).toBeDefined();
    });

    const kbInput = screen.getByLabelText('Прямой ввод с клавиатуры в рабочую область браузера');

    // Нажатие Tab
    act(() => {
      fireEvent.keyDown(kbInput, { key: 'Tab' });
    });

    await waitFor(() => {
      const tabCalls = fetchMock.mock.calls.filter((call) => {
        try {
          const body = JSON.parse(call[1]?.body as string);
          return body.action === 'key' && body.key === 'Tab';
        } catch {
          return false;
        }
      });
      expect(tabCalls.length).toBeGreaterThan(0);
    });

    // Нажатие Enter
    act(() => {
      fireEvent.keyDown(kbInput, { key: 'Enter' });
    });

    await waitFor(() => {
      const enterCalls = fetchMock.mock.calls.filter((call) => {
        try {
          const body = JSON.parse(call[1]?.body as string);
          return body.action === 'key' && body.key === 'Enter';
        } catch {
          return false;
        }
      });
      expect(enterCalls.length).toBeGreaterThan(0);
    });

    // Нажатие Backspace
    act(() => {
      fireEvent.keyDown(kbInput, { key: 'Backspace' });
    });

    await waitFor(() => {
      const backspaceCalls = fetchMock.mock.calls.filter((call) => {
        try {
          const body = JSON.parse(call[1]?.body as string);
          return body.action === 'key' && body.key === 'Backspace';
        } catch {
          return false;
        }
      });
      expect(backspaceCalls.length).toBeGreaterThan(0);
    });
  });
});
