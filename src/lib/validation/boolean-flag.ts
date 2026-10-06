import { z } from "zod";

/**
 * Безопасный разбор булева флага из тела запроса.
 *
 * `z.coerce.boolean()` использовать нельзя: `z.coerce` полагается на
 * `Boolean(value)`, поэтому строка `"false"` и строка `"0"` превращаются в
 * `true`. Любой клиент, отправляющий данные как форму (`FormData`,
 * `URLSearchParams`, обычная отправка HTML-формы, curl, старый фронтенд),
 * а не как JSON — получал противоположное значение флага.
 *
 * Для `includeAnswers` это означало утечку ключей ответов ученикам, для
 * `withImages` — молчаливое списание квоты изображений, для `refine` —
 * лишний платный проход генерации.
 *
 * Принимаем настоящий boolean, а также строковые/числовые формы, которые
 * реально приходят из форм.
 */
export const booleanFlag = z
  .union([
    z.boolean(),
    z.enum(["true", "false", "1", "0", "on", "off", "yes", "no", ""]).transform(
      (value) => value === "true" || value === "1" || value === "on" || value === "yes",
    ),
    z.literal(1).transform(() => true),
    z.literal(0).transform(() => false),
  ])
  .transform((value) => value === true);

/** То же, но необязательное: `undefined` остаётся `undefined`. */
export const optionalBooleanFlag = booleanFlag.optional();