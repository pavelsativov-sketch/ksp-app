/**
 * Генерация изображений к уроку через несколько провайдеров.
 *
 * Поддерживаемые модели (по приоритету качества):
 * - Gemini 2.5 Flash (основная — лучшее качество, яркие цвета, понимает контекст)
 * - FLUX.2 [dev] через Cloudflare (вторая — фотореалистичное качество)
 * - DALL-E 3 (если доступен OpenAI ключ)
 * - FLUX.1-schnell (быстрый фолбэк)
 *
 * Особенности:
 * - Автоматический выбор лучшей доступной модели
 * - Улучшенные промпты с стилями и композицией
 * - Валидация качества изображения
 * - Логика повторных попыток
 * - Кэширование для избежания повторной генерации
 */

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

// ── Кэш изображений ──────────────────────────────────────────────

const imageCache = new Map<string, GenerateImageResult>();
const CACHE_MAX_SIZE = 50;

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
  return imageCache.get(key);
}

function setInCache(key: string, result: GenerateImageResult): void {
  if (imageCache.size >= CACHE_MAX_SIZE) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) imageCache.delete(firstKey);
  }
  imageCache.set(key, result);
}

/** Сброс кеша — для тестов, чтобы результат прошлого прогона не маскировал новый вызов. */
export function resetImageCache(): void {
  imageCache.clear();
}

// ── Основная функция генерации ──────────────────────────────────

/**
 * Генерирует иллюстрацию к уроку.
 *
 * Автоматически выбирает лучшую доступную модель:
 * 1. Gemini 2.5 Flash (если есть GEMINI_API_KEY) — лучшее качество, яркие цвета
 * 2. FLUX.2 [dev] через Cloudflare — фотореалистичное качество
 * 3. DALL-E 3 (если есть OpenAI ключ)
 * 4. FLUX.1-schnell (быстрый фолбэк)
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const cacheKey = getCacheKey(input);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;

  const configured = Boolean(geminiKey || (accountId && token) || openaiKey);
  if (!configured) {
    throw new Error(
      "Не настроены ключи для генерации изображений (GEMINI_API_KEY, OPENAI_API_KEY или CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN)",
    );
  }

  // Каждого провайдера пробуем по очереди. Ошибки копим: если все упали,
  // показываем последнюю причину, а не «ключи не настроены» — иначе
  // просроченный токен или 401 от провайдера выглядели бы как «ничего не
  // настроено» и сбивали с толку.
  const failures: string[] = [];
  const attempt = async (label: string, run: () => Promise<GenerateImageResult>) => {
    try {
      const result = await run();
      setInCache(cacheKey, result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${label} failed: ${message}`);
      failures.push(`${label}: ${message}`);
      return null;
    }
  };

  // 1. Gemini 3.8 Flash — основная модель, лучшее качество и яркие цвета.
  if (geminiKey) {
    const result = await attempt("Gemini 3.8 Flash", () => generateWithGemini(input, geminiKey));
    if (result) return result;
  }

  // 2. FLUX.2 [dev] через Cloudflare — второе по качеству.
  if (accountId && token) {
    const result = await attempt("FLUX.2", () => generateWithFlux(input, accountId, token));
    if (result) return result;
  }

  // 3. DALL-E 3 — последний резерв.
  if (openaiKey) {
    const result = await attempt("DALL-E 3", () => generateWithDallE(input, openaiKey));
    if (result) return result;
  }

  throw new Error(
    `Не удалось создать изображение: ни один провайдер не сработал. ${failures.join("; ")}`,
  );
}

// ── Gemini 2.5 Flash (лучшее качество) ──────────────────────────

async function generateWithGemini(
  input: GenerateImageInput,
  apiKey: string,
): Promise<GenerateImageResult> {
  const prompt = buildImagePrompt(input);
  // Gemini 3.8 Flash — актуальная модель с генерацией изображений.
  // (gemini-2.5-flash с 2026 года недоступна новым ключам и отдаёт 404.)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      responseModalities: ["TEXT", "image"],
      temperature: 1.2, // выше температура = более креативные и яркие изображения
    }
  };

  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000), // 2 минуты — качество важнее скорости
    });

    if (response.ok) break;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const retryAfter = Number(response.headers.get("retry-after")) || 10;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  }

  if (!response) throw new Error("Gemini не вернул изображение");

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          text?: string;
        }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini не вернул изображение в ожидаемом формате");
  }

  const base64 = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || "image/png";

  if (!validateImageQuality(base64)) {
    throw new Error("Сгенерированное изображение не прошло валидацию качества");
  }

  return {
    base64,
    mimeType,
    provider: "Google",
    model: "gemini-3.8-flash",
  };
}

// ── FLUX.2 [dev] через Cloudflare ───────────────────────────────

async function generateWithFlux(
  input: GenerateImageInput,
  accountId: string,
  token: string,
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

  let response: Response | undefined;
  // Ровно одна повторная попытка: окно лимита FLUX длинное, учитель не
  // должен ждать три минуты впустую.
  for (let attempt = 0; attempt < 2; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        // Content-Type намеренно не задаём — boundary проставит fetch.
      },
      body: buildBody(),
      signal: AbortSignal.timeout(120_000), // 2 минуты — качество важнее скорости
    });
    if (response.ok) break;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 1) {
      throw new Error(`Cloudflare API error ${response.status}${await describeCloudflareError(response)}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, Math.min(70_000, Math.max(60_000, retryAfter * 1000))));
  }
  if (!response) throw new Error("Cloudflare не вернул изображение");

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

// ── DALL-E 3 ────────────────────────────────────────────────────

async function generateWithDallE(
  input: GenerateImageInput,
  apiKey: string,
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

  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (response.ok) break;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2) {
      const errorText = await response.text();
      throw new Error(`OpenAI DALL-E error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const retryAfter = Number(response.headers.get("retry-after")) || 10;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  }

  if (!response) throw new Error("OpenAI не вернул изображение");

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
  parts.push("Vibrant, colorful, eye-catching educational illustration for a children's textbook.");
  parts.push("The image should be engaging, visually striking, and suitable for young students.");

  if (input.subject) parts.push(`Subject: ${input.subject}.`);
  if (input.grade) parts.push(`Grade: ${input.grade} (age ${input.grade + 5}-${input.grade + 6} years old).`);
  if (input.topic) parts.push(`Topic: "${input.topic}".`);

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
    "No text, words, letters, or numbers in the image. " +
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
