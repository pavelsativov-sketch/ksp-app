/**
 * Ошибка исчерпания тарифной квоты вспомогательными AI-операциями.
 *
 * Живёт отдельным модулем, а не в `handouts/generate`, потому что
 * `quota-bridge` должен ловить её через `instanceof`, а `generate` в тестах
 * и в некоторых слоях мокается целиком.
 */
export class HandoutQuotaError extends Error {
  readonly kind = "quota" as const;

  constructor(message = "Квота генерации исчерпана") {
    super(message);
    this.name = "HandoutQuotaError";
  }
}
