/**
 * Имена файлов рабочей области: чистые функции без БД и песочницы.
 * Вынесены из runtime.ts, чтобы их использовали и облачная, и локальная
 * рабочая среда, и тесты без подключения к Mongo.
 */
export const ROOT = "workspace";
/** Максимальный размер файла рабочей области (в байтах UTF-8). */
export const MAX_FILE_BYTES = 200_000;

/**
 * Разбор имени файла на (путь, имя) с защитой от path traversal.
 *
 * Запрещаем сегменты:
 *  - пустые («//»), "." и ".." — обход каталога;
 *  - начинающиеся с точки (dotfiles) — в песочнице они не нужны, а имена
 *    вида ".", "..", "...", "..hidden" на части ОС трактуются неочевидно;
 *  - заканчивающиеся пробелом/точкой — на Windows такие имена запрещены.
 */
export function splitFileName(input: string): { path: string; name: string } {
  const normalized = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  const invalid = (part: string) =>
    !part ||
    part.length > 200 ||
    part.startsWith(".") ||
    /\.$/.test(part);
  if (!normalized || normalized.length > 1000 || segments.some(invalid)) {
    throw new Error("Некорректный путь файла");
  }
  const name = segments.pop()!;
  return { path: segments.length ? `${ROOT}/${segments.join("/")}` : ROOT, name };
}
