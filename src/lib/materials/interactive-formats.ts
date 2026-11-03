/** Форматы интерактива, из которых выбирает учитель. Общие для формы и сервера. */
export const INTERACTIVE_FORMATS = ["live", "mcq", "truefalse", "fill", "match", "order"] as const;
export type InteractiveFormat = (typeof INTERACTIVE_FORMATS)[number];

export const FORMAT_COUNTS: Record<InteractiveFormat, number[]> = {
  live: [5, 7, 10],
  mcq: [5, 7, 10],
  truefalse: [5, 7, 10],
  fill: [3, 5, 7],
  match: [1, 2, 3],
  order: [1, 2, 3],
};
