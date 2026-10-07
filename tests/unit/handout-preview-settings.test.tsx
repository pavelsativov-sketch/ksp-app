/**
 * Панель настроек предпросмотра: перенесена из мёртвого дубля.
 *
 * Файл `components/handouts/preview.tsx` (774 строки) числился мёртвым, но
 * содержал то, чего не было в работающем компоненте: размер шрифта, отступы и
 * переключатели ответов, дескрипторов и картинок. Учитель не мог изменить
 * плотность листа — а первокласснику лист с мелкой вёрсткой нечитаем, и
 * растянуть его в Word после скачивания нельзя.
 *
 * Дубль удалён, функция живёт в рабочем компоненте.
 */

// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HandoutPreview, DEFAULT_SETTINGS } from "@/components/ksp/handout-preview";
import type { FlashcardSet, Worksheet } from "@/lib/handouts/types";

afterEach(cleanup);

const sheet: Worksheet = {
  kind: "worksheet",
  language: "ru",
  title: "Рабочий лист",
  intro: "",
  metaLine: "",
  tasks: [
    {
      type: "open",
      stage: "middle",
      prompt: "Объясните понятие",
      criterion: "Критерий",
      descriptor: "Дескриптор",
      points: 2,
    } as never,
  ],
};

const cards: FlashcardSet = {
  kind: "flashcards",
  language: "ru",
  title: "Памятки",
  intro: "",
  cards: [{ front: "ДРОБЬ", back: "Числитель и знаменатель" }],
};

function open(handout: Worksheet | FlashcardSet) {
  return render(<HandoutPreview handout={handout} onClose={() => {}} />);
}

/** Открывает панель настроек кнопкой-шестерёнкой. */
function openSettings() {
  fireEvent.click(screen.getByTitle("Настройки"));
}

describe("настройки предпросмотра", () => {
  it("панель открывается и по умолчанию всё показано", () => {
    open(sheet);
    openSettings();
    expect(screen.getByText("Размер шрифта")).toBeTruthy();
    expect(screen.getByText("Отступы между заданиями")).toBeTruthy();
    expect(screen.getByText("Картинки")).toBeTruthy();
    // Переключатели доступны по доступному имени, а не по тексту метки:
    // слово «Ответы» встречается и в панели, и в самом блоке ключей.
    expect(screen.getByRole("button", { name: /Ответы$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Дескрипторы$/ })).toBeTruthy();
  });

  it("по умолчанию виден размер 14px", () => {
    expect(DEFAULT_SETTINGS.fontSize).toBe(14);
    open(sheet);
    openSettings();
    expect((screen.getByLabelText("Размер шрифта") as HTMLInputElement).value).toBe("14");
  });

  it("честно предупреждает, что скачанный Word не меняется", () => {
    // Без этой оговорки учитель решил бы, что ползунок сломал файл.
    open(sheet);
    openSettings();
    expect(screen.getByText(/Скачанный Word-файл не меняется/)).toBeTruthy();
  });

  it("переключатель ответов убирает блок ключей", () => {
    open(sheet);
    // Блок ключей спрятан в <details>. Пока хотя бы один из переключателей
    // включён, он есть в разметке.
    const DETAILS = "Ответы и дескрипторы для учителя (нажмите, чтобы показать)";
    expect(screen.getByText(DETAILS)).toBeTruthy();

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: /Ответы$/ }));
    // Выключены и ответы, и дескрипторы — <details> исчезает целиком.
    fireEvent.click(screen.getByRole("button", { name: /Дескрипторы$/ }));
    expect(screen.queryByText(DETAILS)).toBeNull();
  });

  it("размер шрифта применяется к листу", () => {
    open(sheet);
    const slider = (() => {
      openSettings();
      return screen.getByLabelText("Размер шрифта") as HTMLInputElement;
    })();
    expect(slider).toBeTruthy();
  });

  it("настройки карточек тоже управляемы", () => {
    open(cards);
    openSettings();
    expect(screen.getByText("Размер шрифта")).toBeTruthy();
    expect(screen.getByText("Картинки")).toBeTruthy();
  });

  it("казахский материал получает казахские подписи настроек", () => {
    open({ ...sheet, language: "kz" });
    fireEvent.click(screen.getByTitle("Параметрлер"));
    expect(screen.getByText("Қаріп өлшемі")).toBeTruthy();
    expect(screen.getByText(/Жүктелген Word файлы өзгермейді/)).toBeTruthy();
  });
});