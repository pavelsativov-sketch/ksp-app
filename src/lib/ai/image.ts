/**
 * Генерация изображений к уроку через несколько провайдеров.
 *
 * Каскад (по очереди, до первого успеха):
 * - FLUX.1 schnell через Cloudflare (основной: дешёвый и быстрый)
 * - FLUX.2 [dev] через Cloudflare (резерв, выше качество, дороже)
 * - DALL-E 3 (каждый ключ из OPENAI_API_KEY)
 * - Pollinations Flux (POLLINATIONS_ENABLED=1, бесплатный, без ключа)
 *
 * Gemini из каскада убран: gemini-3.8-flash текстовая модель, запрос с
 * responseModalities IMAGE тратил вызов впустую.
 *
 * Состав проверен живыми запросами: `node scripts/probe-image-providers.mjs`.
 *
 * Время: весь каскад укладывается в CASCADE_DEADLINE_MS, чтобы маршрут
 * с maxDuration 60 с успел ответить. Повторов внутри провайдера нет —
 * повтором служит следующий провайдер.
 */

import { freeProvidersDisabled, parseApiKeys } from "./providers";

export interface GenerateImageInput {
  /** Промпт для генерации. */
  prompt: string;
  /** Тема урока — добавляется в контекст. */
  topic?: string;
  /** Предмет — для стилизации. */
  subject?: string;
  /** Класс — для возрастного соответствия. */
  grade?: number;
  /** Стиль иллюстрации. */
  style?: ImageStyle;
  /** Цветовая палитра. */
  colorPalette?: ColorPalette;
}

export type ImageStyle =
  | "flat-illustration"
  | "watercolor"
  | "infographic"
  | "realistic"
  | "cartoon"
  | "sketch";

export type ColorPalette =
  | "bright"
  | "pastel"
  | "natural"
  | "monochrome"
  | "vibrant";

export interface GenerateImageResult {
  /** Base64-строка изображения (image/jpeg). */
  base64: string;
  /** MIME-тип. */
  mimeType: string;
  /** Провайдер, который использован. */
  provider: string;
  /** Модель, которая использована. */
  model: string;
}

/** Общий бюджет каскада: меньше maxDuration маршрута (60 с) с запасом на ответ. */
const CASCADE_DEADLINE_MS = 50_000;
/** Таймаут одного провайдера. */
const PROVIDER_TIMEOUT_MS = 20_000;
/** С меньшим остатком провайдер не запускается: ответ всё равно не успеет. */
const MIN_PROVIDER_MS = 5_000;

/** Pollinations — сторонний бесплатный сервис: включается флагом и гасится AI_DISABLE_FREE_PROVIDERS. */
function pollinationsEnabled(): boolean {
  return process.env.POLLINATIONS_ENABLED === "1" && !freeProvidersDisabled();
}

/** Есть ли хоть один провайдер картинок (Cloudflare, OpenAI или Pollinations). */
export function isImageProviderConfigured(): boolean {
  return Boolean(
    (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) ||
      parseApiKeys(process.env.OPENAI_API_KEY).length ||
      pollinationsEnabled(),
  );
}

// ── Кэш изображений ──────────────────────────────────────────────

/**
 * Маленький LRU: на serverless экземпляр живёт недолго, а каждая запись —
 * сотни КБ base64. Держим только последние картинки для повторного запроса.
 */
const imageCache = new Map<string, GenerateImageResult>();
const CACHE_MAX_SIZE = 8;

function getCacheKey(input: GenerateImageInput): string {
  return JSON.stringify({
    prompt: input.prompt,
    topic: input.topic,
    subject: input.subject,
    grade: input.grade,
    style: input.style,
    colorPalette: input.colorPalette,
  });
}

function getFromCache(key: string): GenerateImageResult | undefined {
  const hit = imageCache.get(key);
  if (hit) {
    // Перестановка в конец: вытесняется давно не запрошенная запись.
    imageCache.delete(key);
    imageCache.set(key, hit);
  }
  return hit;
}

function setInCache(key: string, result: GenerateImageResult): void {
  imageCache.delete(key);
  if (imageCache.size >= CACHE_MAX_SIZE) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
  imageCache.set(key, result);
}

/** Сброс кеша — для тестов, чтобы результат прошлого прогона не маскировал новый вызов. */
export function resetImageCache(): void {
  imageCache.clear();
}

// ── Защита от мёртвого провайдера ───────────────────────────────

/**
 * Провайдер, дважды подряд не ответивший, выводится из ротации на 10 минут,
 * чтобы каждая картинка не тратила его таймаут из общего бюджета каскада.
 *
 * Порог 2 отказа: одиночный сбой у провайдера — это норма, регулярный — нет.
 */
const FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 10 * 60 * 1000;

interface FailureRecord {
  fails: number;
  until: number;
}

const failures = new Map<string, FailureRecord>();

/** Провайдер сейчас не оправдывает ожиданий. */
function isCoolingDown(label: string, now = Date.now()): boolean {
  const record = failures.get(label);
  if (!record) return false;
  if (record.until > now) return true;
  // Пауза истекла — возвращаем провайдера в ротацию и забываем историю.
  //
  // Важно: запись удаляется только здесь и только при истёкшей паузе. Раньше
  // проверка была устроена так, что любой не охлаждённый провайдер терял
  // счётчик отказов, порог в 2 никогда не достигался, и защита не работала.
  if (record.until > 0) failures.delete(label);
  return false;
}

function noteFailure(label: string, now = Date.now()): void {
  const previous = failures.get(label);
  const fails = (previous?.fails ?? 0) + 1;
  failures.set(label, { fails, until: fails >= FAILURE_THRESHOLD ? now + COOLDOWN_MS : 0 });
}

function noteSuccess(label: string): void {
  failures.delete(label);
}

/** Сброс состояния отказов — для тестов. */
export function resetImageFailures(): void {
  failures.clear();
}

/** Список провайдеров, временно выведенных из ротации (для диагностики). */
export function cooledDownProviders(now = Date.now()): string[] {
  return [...failures.entries()].filter(([, record]) => record.until > now).map(([label]) => label);
}

// ── Основная функция генерации ──────────────────────────────────

/**
 * Генерирует иллюстрацию к уроку: FLUX.1 schnell → FLUX.2 [dev] → DALL-E 3 → Pollinations.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const cacheKey = getCacheKey(input);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  if (!isImageProviderConfigured()) {
    throw new Error(
      "Не настроены ключи для генерации изображений (CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN, OPENAI_API_KEY или POLLINATIONS_ENABLED=1)",
    );
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const openaiKeys = parseApiKeys(process.env.OPENAI_API_KEY);
  const deadline = Date.now() + CASCADE_DEADLINE_MS;

  // Ошибки копим: если все упали, показываем причины, а не «ключи не настроены».
  const failures: string[] = [];
  const attempt = async (label: string, run: (signal: AbortSignal) => Promise<GenerateImageResult>) => {
    if (isCoolingDown(label)) {
      failures.push(`${label}: пропущен, провайдер не отвечает (пауза 10 мин)`);
      return null;
    }
    const remaining = deadline - Date.now();
    if (remaining < MIN_PROVIDER_MS) {
      failures.push(`${label}: пропущен, не осталось времени`);
      return null;
    }
    try {
      const result = await run(AbortSignal.timeout(Math.min(PROVIDER_TIMEOUT_MS, remaining)));
      noteSuccess(label);
      setInCache(cacheKey, result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${label} failed: ${message}`);
      noteFailure(label);
      failures.push(`${label}: ${message}`);
      return null;
    }
  };

  if (accountId && token) {
    // 1. FLUX.1 schnell первым: бесплатных 10 000 «нейронов» в сутки FLUX.2 [dev]
    //    съедал за несколько десятков картинок, а schnell в разы дешевле.
    const fast = await attempt("FLUX.1 schnell", (signal) => generateWithFluxFast(input, accountId, token, signal));
    if (fast) return fast;

    // 2. FLUX.2 [dev] — резерв, если schnell не ответил.
    const result = await attempt("FLUX.2", (signal) => generateWithFlux(input, accountId, token, signal));
    if (result) return result;
  }

  // 3. DALL-E 3 — резерв OpenAI (перебираем все ключи из OPENAI_API_KEY).
  for (const [idx, oKey] of openaiKeys.entries()) {
    const label = openaiKeys.length > 1 ? `DALL-E 3 #${idx + 1}` : "DALL-E 3";
    const result = await attempt(label, (signal) => generateWithDallE(input, oKey, signal));
    if (result) return result;
  }

  // 4. Pollinations Flux — бесплатный резерв без API-ключа (когда дневные 10 000 нейронов Cloudflare исчерпаны).
  if (pollinationsEnabled()) {
    const result = await attempt("Pollinations Flux", (signal) => generateWithPollinations(input, signal));
    if (result) return result;
  }

  throw new Error(
    `Не удалось создать изображение: ни один провайдер не сработал. ${failures.join("; ")}`,
  );
}

// ── FLUX.2 [dev] через Cloudflare ───────────────────────────────

async function generateWithFlux(
  input: GenerateImageInput,
  accountId: string,
  token: string,
  signal: AbortSignal,
): Promise<GenerateImageResult> {
  const educationalPrompt = buildImagePrompt(input);
  if (educationalPrompt.length > 4000) {
    throw new Error("Промпт изображения слишком длинный");
  }

  // FLUX.2 [dev] — лучшее качество из Cloudflare.
  // Важно: эта модель принимает ТОЛЬКО multipart/form-data. С JSON-телом
  // Cloudflare отвечает 400 «required properties at '/' are 'multipart'».
  const model = "@cf/black-forest-labs/flux-2-dev";
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const buildBody = () => {
    const form = new FormData();
    form.append("prompt", educationalPrompt);
    form.append("steps", "30"); // больше шагов = выше качество
    form.append("width", "1024");
    form.append("height", "1024");
    return form;
  };

  // Без повтора: окно лимита FLUX — около минуты, это больше всего бюджета маршрута.
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      // Content-Type намеренно не задаём — boundary проставит fetch.
    },
    body: buildBody(),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Cloudflare API error ${response.status}${await describeCloudflareError(response)}`);
  }

  const contentType = response.headers.get("content-type") || "";

  let base64: string;
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as { result?: { image?: string } };
    if (data.result?.image) {
      base64 = data.result.image;
    } else {
      throw new Error(`Unexpected JSON response from Cloudflare: ${JSON.stringify(data).slice(0, 200)}`);
    }
  } else {
    const buffer = await response.arrayBuffer();
    base64 = Buffer.from(buffer).toString("base64");
  }

  if (!validateImageQuality(base64)) {
    throw new Error("Сгенерированное изображение не прошло валидацию качества");
  }

  return {
    base64,
    mimeType: contentType.includes("image/") ? contentType : "image/jpeg",
    provider: "Cloudflare",
    model: "FLUX.2 [dev]",
  };
}

// ── FLUX.1 schnell через Cloudflare (основной) ──────────────────

/**
 * Основной провайдер: дешевле и быстрее FLUX.2.
 *
 * Отличия от FLUX.2 проверены живым запросом и неочевидны:
 *  * принимает JSON-тело, а не multipart (с multipart отдаёт 6003
 *    «Request body is not valid json»);
 *  * не принимает поля width и height (5006 «Additional or unevaluated
 *    properties '/width, /height'»).
 *
 * Качество ниже, скорость выше — для иллюстраций к заданиям это подходит.
 */
async function generateWithFluxFast(
  input: GenerateImageInput,
  accountId: string,
  token: string,
  signal: AbortSignal,
): Promise<GenerateImageResult> {
  const prompt = buildImagePrompt(input);
  if (prompt.length > 4000) throw new Error("Промпт изображения слишком длинный");

  const model = "@cf/black-forest-labs/flux-1-schnell";
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // width/height здесь не передаются: модель их не принимает.
    // Только steps: поле num_steps модель отвергает (5006 «unevaluated properties '/num_steps'»).
    body: JSON.stringify({ prompt, steps: 4 }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Cloudflare FLUX.1 schnell error ${response.status}${await describeCloudflareError(response)}`);
  }

  const data = (await response.json()) as { result?: { image?: string } };
  const base64 = data.result?.image;
  if (!base64) throw new Error("FLUX.1 schnell не вернул изображение");

  if (!validateImageQuality(base64)) {
    throw new Error("Сгенерированное изображение не прошло валидацию качества");
  }

  return { base64, mimeType: "image/png", provider: "Cloudflare", model: "FLUX.1 schnell" };
}

// ── DALL-E 3 ────────────────────────────────────────────────────

async function generateWithDallE(
  input: GenerateImageInput,
  apiKey: string,
  signal: AbortSignal,
): Promise<GenerateImageResult> {
  const prompt = buildImagePrompt(input);
  const url = "https://api.openai.com/v1/images/generations";

  const body = {
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "hd", // HD качество
    response_format: "b64_json",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI DALL-E error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as { data?: Array<{ b64_json?: string }> };
  const base64 = data.data?.[0]?.b64_json;
  if (!base64) throw new Error("OpenAI не вернул изображение в ожидаемом формате");

  if (!validateImageQuality(base64)) {
    throw new Error("Сгенерированное изображение не прошло валидацию качества");
  }

  return {
    base64,
    mimeType: "image/png",
    provider: "OpenAI",
    model: "dall-e-3",
  };
}

// ── Pollinations Flux (бесплатный резерв без ключа) ─────────────

async function generateWithPollinations(
  input: GenerateImageInput,
  signal: AbortSignal,
): Promise<GenerateImageResult> {
  const concisePrompt = [
    "Colorful educational flat vector illustration for school students, pure visual scene without any text, letters, or numbers:",
    input.prompt.slice(0, 350),
  ].join(" ");
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(concisePrompt)}?width=896&height=576&nologo=true&model=flux`;
  const response = await fetch(url, {
    method: "GET",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Pollinations error ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await response.arrayBuffer());
  const base64 = buf.toString("base64");
  if (!validateImageQuality(base64)) {
    throw new Error("Pollinations вернул некорректное изображение");
  }
  return {
    base64,
    mimeType: contentType.includes("png") ? "image/png" : "image/jpeg",
    provider: "Pollinations",
    model: "flux",
  };
}

// ── Валидация качества изображения ──────────────────────────────

function validateImageQuality(base64: string): boolean {
  if (base64.length < 1000) return false;

  try {
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length < 500) return false;

    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;

    return isJpeg || isPng;
  } catch {
    return false;
  }
}

// ── Построение промпта ────────────────────────────────────────

function buildImagePrompt(input: GenerateImageInput): string {
  const parts: string[] = [];

  // Базовый контекст — яркие, красочные изображения для учебника
  parts.push("Wordless, vibrant, colorful educational illustration for a children's textbook.");
  parts.push("The image should be engaging, visually striking, and suitable for young students.");

  // Тему и предмет в промпт не пишем: FLUX рисует текст в кавычках и кириллицу буквами
  // на картинке («Topic: "Строение клетки"» превращался в надпись). Сцену задаёт описание.
  if (input.grade) parts.push(`Audience: children aged ${input.grade + 5}-${input.grade + 6}.`);

  // Стиль
  const style = input.style ?? "flat-illustration";
  const stylePrompt = getStylePrompt(style);
  parts.push(`Style: ${stylePrompt}.`);

  // Цветовая палитра
  const palette = input.colorPalette ?? "vibrant";
  const palettePrompt = getColorPalettePrompt(palette);
  parts.push(`Color palette: ${palettePrompt} — high contrast, saturated colors.`);

  // Описание
  parts.push(`Description: ${input.prompt}`);

  // Общие требования
  parts.push(
    "Composition: clear, uncluttered, focused on the main subject. " +
    "Pure picture only: blank surfaces, unlabeled, no captions, no lettering, no numbers, no logos, no signage. " +
    "Child friendly, safe for work, educational. " +
    "High quality, detailed, visually appealing, rich in color and detail. " +
    "Suitable for children's textbook — bright, engaging, and memorable.",
  );

  return parts.join("\n");
}

function getStylePrompt(style: ImageStyle): string {
  switch (style) {
    case "flat-illustration":
      return "clean flat illustration style, modern, simple shapes, bold vibrant colors, eye-catching, suitable for children's textbook";
    case "watercolor":
      return "soft watercolor painting style, gentle yet vibrant colors, artistic, hand-painted look, rich in color";
    case "infographic":
      return "clear infographic style, diagrams, icons, educational, easy to understand, colorful and engaging";
    case "realistic":
      return "realistic illustration style, detailed, accurate, photographic quality, vibrant colors";
    case "cartoon":
      return "friendly cartoon style, very colorful, highly engaging, appealing to children, bright and cheerful";
    case "sketch":
      return "pencil sketch style, hand-drawn, artistic, educational, with colorful accents";
  }
}

function getColorPalettePrompt(palette: ColorPalette): string {
  switch (palette) {
    case "bright":
      return "bright, vibrant, saturated colors, high contrast, eye-catching";
    case "pastel":
      return "soft pastel colors, gentle, calming, yet colorful";
    case "natural":
      return "natural, earthy tones, greens and browns, warm and inviting";
    case "monochrome":
      return "monochrome, single color scheme, elegant, with vibrant accents";
    case "vibrant":
      return "vibrant, high contrast, eye-catching colors, rich and saturated";
  }
}

// ── Санированное описание ошибки ──────────────────────────────

async function describeCloudflareError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { errors?: Array<{ code?: number; message?: string }> };
    const codes = (data.errors ?? [])
      .map((e) => `${e.code ?? "?"}: ${e.message ?? ""}`.trim())
      .join("; ");
    return codes ? ` [${codes.slice(0, 200)}]` : "";
  } catch {
    return "";
  }
}
