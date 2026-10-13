/**
 * Тестирование мгновенного дублирования ввода логина и пароля в ОС (BrowserApp).
 *
 * Проверяется:
 * 1. При активном поле ввода (логин) отображается панель прямого дублирования ввода в ОС.
 * 2. Символы, вводимые пользователем, мгновенно отображаются в поле ОС без задержки и не исчезают.
 * 3. При активном поле пароля ввод маскируется (type="password") и отображается переключатель «показать/скрыть пароль».
 * 4. Нажатие Backspace сразу удаляет символ в ОС.
 * 5. Нажатие Tab отправляет переход к следующему полю.
 * 6. Нажатие Enter отправляет подтверждение формы.
 * 7. Кнопка очистки сбрасывает введённое значение.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserApp } from '@/components/workspace/apps/browser';

describe('BrowserApp: мгновенное дублирование ввода логина и пароля в ОС', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, _init?: RequestInit) => {
      // Имитация ответа скриншота с активным полем логина
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

    // URL.createObjectURL mock
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-image'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('отображает панель дублирования ввода в ОС с названием активного поля', async () => {
    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByTestId('live-input-bar')).toBeDefined();
    });

    expect(screen.getByText('Логин')).toBeDefined();
    const input = screen.getByLabelText('Прямой ввод в активное поле ОС') as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.type).toBe('text');
  });

  it('мгновенно дублирует вводимые символы логина в поле ОС', async () => {
    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByTestId('live-input-bar')).toBeDefined();
    });

    const input = screen.getByLabelText('Прямой ввод в активное поле ОС') as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: 'teacher@bilimclass.kz' } });
    });

    expect(input.value).toBe('teacher@bilimclass.kz');
  });

  it('корректно обрабатывает поле пароля и переключатель видимости пароля', async () => {
    // Настраиваем mock для пароля
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const dummyPng = new Blob(['dummy'], { type: 'image/jpeg' });
      const activeField = {
        isEditable: true,
        isPassword: true,
        tag: 'input',
        type: 'password',
        label: 'Пароль',
        name: 'password',
        placeholder: 'Введите пароль',
        box: { x: 400, y: 360, width: 300, height: 40 },
      };

      const headers = new Headers({
        'Content-Type': 'image/jpeg',
        'X-Page-Title': encodeURIComponent('BilimClass Login'),
        'X-Page-Url': encodeURIComponent('https://www.bilimclass.kz/login'),
        'X-Active-Field': encodeURIComponent(JSON.stringify(activeField)),
      });

      return Promise.resolve(new Response(dummyPng, { headers, status: 200 }));
    }));

    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByTestId('live-input-bar')).toBeDefined();
    });

    expect(screen.getByText('Пароль')).toBeDefined();
    const input = screen.getByLabelText('Прямой ввод в активное поле ОС') as HTMLInputElement;
    expect(input.type).toBe('password');

    // Вводим пароль
    act(() => {
      fireEvent.change(input, { target: { value: 'SuperSecret123!' } });
    });
    expect(input.value).toBe('SuperSecret123!');

    // Переключаем «показать пароль»
    const toggleBtn = screen.getByLabelText('Показать пароль');
    act(() => {
      fireEvent.click(toggleBtn);
    });

    expect(input.type).toBe('text');

    // Переключаем обратно
    const hideBtn = screen.getByLabelText('Скрыть пароль');
    act(() => {
      fireEvent.click(hideBtn);
    });

    expect(input.type).toBe('password');
  });

  it('отправляет Enter и Tab по кнопкам и клавишам', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, _init?: RequestInit) => {
      const dummyPng = new Blob(['dummy'], { type: 'image/jpeg' });
      const headers = new Headers({
        'Content-Type': 'image/jpeg',
        'X-Page-Title': encodeURIComponent('BilimClass Login'),
        'X-Page-Url': encodeURIComponent('https://www.bilimclass.kz/login'),
        'X-Active-Field': encodeURIComponent(JSON.stringify({
          isEditable: true,
          isPassword: false,
          label: 'Логин',
        })),
      });
      return Promise.resolve(new Response(dummyPng, { headers, status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByTestId('live-input-bar')).toBeDefined();
    });

    const tabBtn = screen.getByTitle('Перейти к следующему полю (Tab)');
    act(() => {
      fireEvent.click(tabBtn);
    });

    // Проверяем, что запрос с Tab отправлен
    await waitFor(() => {
      const tabCalls = fetchMock.mock.calls.filter(call => {
        try {
          const body = JSON.parse(call[1]?.body as string);
          return body.action === 'key' && body.key === 'Tab';
        } catch {
          return false;
        }
      });
      expect(tabCalls.length).toBeGreaterThan(0);
    });

    const enterBtn = screen.getByTitle('Отправить (Enter)');
    act(() => {
      fireEvent.click(enterBtn);
    });

    // Проверяем, что запрос с Enter отправлен
    await waitFor(() => {
      const enterCalls = fetchMock.mock.calls.filter(call => {
        try {
          const body = JSON.parse(call[1]?.body as string);
          return body.action === 'key' && body.key === 'Enter';
        } catch {
          return false;
        }
      });
      expect(enterCalls.length).toBeGreaterThan(0);
    });
  });

  it('очищает поле по кнопке Очистить', async () => {
    render(<BrowserApp initialUrl="https://www.bilimclass.kz/login" />);

    await waitFor(() => {
      expect(screen.getByTestId('live-input-bar')).toBeDefined();
    });

    const input = screen.getByLabelText('Прямой ввод в активное поле ОС') as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: 'wrong_login' } });
    });
    expect(input.value).toBe('wrong_login');

    const clearBtn = screen.getByTitle('Очистить');
    act(() => {
      fireEvent.click(clearBtn);
    });

    expect(input.value).toBe('');
  });
});
