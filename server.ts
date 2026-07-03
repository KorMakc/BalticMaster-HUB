import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { execSync, exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Enable CORS for local file:// protocol and desktop application update checks
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Lazy-initialize GoogleGenAI client to avoid crashes if GEMINI_API_KEY is not set immediately.
let aiClient: GoogleGenAI | null = null;

function getAIClient(clientApiKey?: string): GoogleGenAI {
  const apiKey = (clientApiKey || process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Please configure it in the Secrets panel in AI Studio.");
  }

  // Check if key is a restricted/unsupported sandbox token (starts with AQ. or does not start with standard AIzaSy)
  if (apiKey.startsWith("AQ.") || !apiKey.startsWith("AIzaSy")) {
    throw new Error("Встроенный ключ сервера имеет неподходящий тип или заблокирован (ACCESS_TOKEN_TYPE_UNSUPPORTED). Пожалуйста, укажите ваш собственный рабочий API-ключ Gemini (начинающийся с AIzaSy) в настройках приложения.");
  }

  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API endpoint for article generation
app.post("/api/generate-article", async (req, res) => {
  try {
    const { topic, keywords, style, length, wishes, customApiKey } = req.body;

    if (!topic) {
      return res.status(400).json({ error: "Тема статьи обязательна для заполнения." });
    }

    const ai = getAIClient(customApiKey);

    // Build highly optimized prompt for Gemini
    const lengthPrompt =
      length === "short"
        ? "короткий (около 300-400 слов, лаконичный)"
        : length === "long"
        ? "подробный лонгрид (около 900-1200 слов, глубокий разбор)"
        : "средний (около 500-700 слов, сбалансированный)";

    const stylePrompt =
      style === "creative"
        ? "креативный, увлекательный, с яркими метафорами и живым языком"
        : style === "practical"
        ? "практичный, с фокусом на личный опыт, лайфхаки и конкретные советы (стиль 'своими руками')"
        : style === "informative"
        ? "информационный, энциклопедический, точный, со статистикой и структурированными фактами"
        : style === "simple"
        ? "простой, понятный каждому, без сложной терминологии, дружелюбный"
        : "экспертный, авторитетный, профессиональный, вызывающий максимальное доверие владельцев бизнеса (стиль 'Балтик Мастер')";

    const keywordsSection = keywords
      ? `Обязательно естественно впиши следующие ключевые слова: ${keywords}. Ключевые слова должны органично вплетаться в текст, не выглядеть искусственно.`
      : "";

    const wishesSection = wishes
      ? `Дополнительные пожелания по содержанию от пользователя: ${wishes}. Учти их при написании.`
      : "";

    const prompt = `Ты — профессиональный копирайтер и эксперт по контенту для Яндекс.Дзен, пишущий от лица компании "Балтик Мастер" (Санкт-Петербург, с 1994 года лидер в сфере ремонта и обслуживания профессионального кухонного оборудования HoReCa).

Твоя задача — написать идеальную вовлекающую статью для Яндекс.Дзен на тему: "${topic}".

Параметры статьи:
- Длина текста: ${lengthPrompt}
- Стиль изложения: ${stylePrompt}
${keywordsSection}
${wishesSection}

Рекомендации по структуре для Яндекс.Дзен:
1. Заголовок (в первой строке): должен быть интригующим, кликабельным, но не кликбейтным (например, содержать цифры, полезный вопрос, обещание выгоды).
2. Вводный абзац: цепляющий лид-абзац, объясняющий актуальность проблемы и почему читателю нужно дочитать статью до конца.
3. Основная часть: разбей текст на логические разделы с подзаголовками (используй теги <h4> или просто текст с новой строки). Сделай списки (нумерованные или маркированные) для лучшей читаемости.
4. Полезные детали: добавь конкретные рекомендации, цифры, сроки окупаемости или стоимости, где это уместно (например, выезд мастера в СПб, стоимость ТЭНов, уплотнителей или компрессоров).
5. Заключение и CTA (призыв к действию): в конце обязательно добавь ненавязчивый призыв обратиться в "Балтик Мастер" по вопросам ремонта, запчастей или оснащения. Укажи контактные телефоны: запчасти — +7 (981) 117-90-33, сервис — +7 (921) 957-27-65, сайт — bm-service24.ru.

Напиши готовую статью на русском языке. Ответ должен содержать только заголовок и сам текст статьи. Не пиши никаких пояснений от себя ("Вот статья...", "Конечно, я напишу..." и т.д.).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const generatedText = response.text;
    if (!generatedText) {
      throw new Error("Gemini вернул пустой ответ.");
    }

    res.json({ text: generatedText });
  } catch (error: any) {
    console.warn("Gemini Generation Error:", error.message || error);
    let userMsg = error.message || "Произошла ошибка при генерации статьи.";
    if (
      userMsg.includes("UNAUTHENTICATED") ||
      userMsg.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED") ||
      userMsg.includes("API_KEY_SERVICE_BLOCKED") ||
      userMsg.includes("authentication credentials") ||
      userMsg.includes("API key")
    ) {
      userMsg = "Ошибка авторизации или блокировки ключа Gemini на сервере. Пожалуйста, откройте вкладку 'Настройки API-ключа' в верхней части приложения и вставьте свой собственный рабочий API-ключ Gemini.";
    }
    res.status(500).json({ error: userMsg });
  }
});

// API endpoint for deep intelligent text quality check and spelling corrections
app.post("/api/check-text-quality", async (req, res) => {
  try {
    const { text, customApiKey } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Текст обязателен для заполнения." });
    }

    // 1. Run spelling check via Yandex Speller on the server
    const cleanText = text.replace(/<[^>]*>/g, " ");
    let spellErrors: any[] = [];
    try {
      const spellerUrl = "https://speller.yandex.net/services/spellservice.json/checkText";
      const spellerRes = await fetch(spellerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `text=${encodeURIComponent(cleanText)}&lang=ru,en`
      });
      if (spellerRes.ok) {
        spellErrors = await spellerRes.json();
      } else {
        console.error("Yandex Speller Server Fetch failed with status:", spellerRes.status);
      }
    } catch (spellerErr) {
      console.error("Yandex Speller Server Fetch Failed:", spellerErr);
    }

    // 2. Perform style, spelling and AI clichés analysis via Gemini
    let aiClichés: any[] = [];
    let humanScore = 80;
    let waterPercent = 30;

    const clichésDb = [
      { key: "в современном мире", explain: "Типичное клише ИИ для начала абзаца. Делает текст общим, банальным и неэкспертным.", reps: ["Сейчас", "Сегодня", "На ресторанном рынке", "В сфере HoReCa"] },
      { key: "важно отметить", explain: "Вводное клише, размывающее фокус читателя. Опытные копирайтеры избегают таких конструкций.", reps: ["Заметьте,", "По опыту,", "Обратите внимание:", "Важный нюанс:"] },
      { key: "несомненно", explain: "Избыточное вводное слово, характерное для академического или роботизированного стиля ИИ.", reps: ["Конечно,", "Действительно,", "Практика показывает, что"] },
      { key: "в заключение стоит отметить", explain: "Шаблонная фраза завершения статьи, типичная для школьных сочинений и ИИ.", reps: ["Итог:", "Подведем итоги:", "Короткий вывод:"] },
      { key: "безусловно", explain: "Слишком сильное ИИ-утверждение без реальных доказательств.", reps: ["Конечно,", "Разумеется,", "Как показывает практика,"] },
      { key: "давайте рассмотрим подробно", explain: "Разговорный штамп ИИ при переходе к спискам или описанию.", reps: ["Посмотрим на", "Разберем", "Основные моменты:"] },
      { key: "широкий спектр", explain: "Размытая ИИ-фраза вместо конкретики. Читатель любит цифры и факты.", reps: ["Большой выбор", "Различные модели", "Полный перечень"] },
      { key: "ключевой аспект", explain: "Канцеляризм ИИ, усложняющий восприятие текста.", reps: ["Главное", "Важная деталь", "Основа"] },
      { key: "уникальное сочетание", explain: "Рекламный штамп, лишенный технической ценности и вызывающий недоверие.", reps: ["Сочетание", "Эффективная комбинация"] },
      { key: "подводя итог", explain: "Шаблонное резюме ИИ.", reps: ["Итог:", "В результате", "Главный вывод:"] },
      { key: "стоит подчеркнуть", explain: "Канцелярский оборот ИИ, создающий ощущение лекции.", reps: ["Важно:", "Запомните:", "Обратите внимание:"] }
    ];

    const finalClichés: any[] = [];
    const lowerText = text.toLowerCase();

    // 1. First, always run deterministic local cliché database matches to ensure high-accuracy baseline
    clichésDb.forEach(item => {
      let pos = lowerText.indexOf(item.key);
      while (pos !== -1) {
        const foundCliche = text.substring(pos, pos + item.key.length);
        const exists = finalClichés.some(c => c.cliché.toLowerCase() === foundCliche.toLowerCase());
        if (!exists) {
          finalClichés.push({
            cliché: foundCliche,
            explanation: item.explain,
            replacements: item.reps
          });
        }
        pos = lowerText.indexOf(item.key, pos + 1);
      }
    });

    try {
      const ai = getAIClient(customApiKey);
      const prompt = `Ты — профессиональный редактор, эксперт по копирайтингу, качеству текстов и стилистике (особенно для Яндекс.Дзен, рекламы и сферы HoReCa).
Тебе нужно провести глубокий аудит следующего текста:
1. Выявить все роботизированные штампы ИИ, канцеляризмы, пустые фразы, которые часто генерирует ChatGPT.
2. Найти орфографические, грамматические ошибки и опечатки в словах (особенно специфичные для ресторанной и кухонной тематики, например: пароконвектомат, шоковая заморозка, льдогенератор, холодильный стол, Rational и др.).
3. Оценить естественность текста (humanScore от 10 до 100, где 100 - идеальный живой текст эксперта, а 10 - абсолютно сухой ИИ) и водность текста (waterPercent от 0 до 100, процент пустых слов и клише).

Вот текст для анализа:
"""
${text}
"""

Убедись, что:
1. Каждое найденное "cliché" и "word" действительно присутствуют в исходном тексте (даже в другом падеже или регистре).
2. Объяснения и варианты замены написаны профессиональным, живым языком опытного копирайтера.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          humanScore: {
            type: Type.INTEGER,
            description: "Оценка естественности текста от 10 до 100"
          },
          waterPercent: {
            type: Type.INTEGER,
            description: "Процент водности текста от 0 до 100"
          },
          aiClichés: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cliché: {
                  type: Type.STRING,
                  description: "Фраза-клише ИИ или канцеляризм из исходного текста"
                },
                explanation: {
                  type: Type.STRING,
                  description: "Почему это ИИ-клише/канцеляризм и как оно ухудшает текст"
                },
                replacements: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Список живых вариантов замены (минимум 2-3 варианта)"
                }
              },
              required: ["cliché", "explanation", "replacements"]
            },
            description: "Список найденных клише ИИ и сухих канцеляризмов"
          },
          spellErrors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: {
                  type: Type.STRING,
                  description: "Слово с орфографической ошибкой или опечаткой из текста"
                },
                s: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Список правильных вариантов исправления"
                }
              },
              required: ["word", "s"]
            },
            description: "Список найденных орфографических ошибок"
          }
        },
        required: ["humanScore", "waterPercent", "aiClichés", "spellErrors"]
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        }
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText.trim());

      if (typeof parsed.humanScore === "number") humanScore = parsed.humanScore;
      if (typeof parsed.waterPercent === "number") waterPercent = parsed.waterPercent;
      
      // Merge Gemini spelling errors with Yandex Speller
      if (Array.isArray(parsed.spellErrors)) {
        parsed.spellErrors.forEach((geminiErr: any) => {
          if (geminiErr && geminiErr.word) {
            const cleanWord = geminiErr.word.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
            if (!cleanWord) return;
            const alreadyExists = spellErrors.some(
              (e: any) => e.word.toLowerCase() === cleanWord
            );
            
            // Check if cleanWord exists as a separate word or part of text
            if (!alreadyExists && lowerText.includes(cleanWord)) {
              spellErrors.push({
                word: geminiErr.word,
                s: geminiErr.s || [],
                pos: lowerText.indexOf(cleanWord),
                len: cleanWord.length
              });
            }
          }
        });
      }

      // Merge Gemini-detected clichés into finalClichés
      if (Array.isArray(parsed.aiClichés)) {
        parsed.aiClichés.forEach((item: any) => {
          if (!item || !item.cliché) return;
          const cLower = item.cliché.trim().toLowerCase();
          
          // Locate exact matches or fuzzy variations in text
          let exactMatch = "";
          if (lowerText.includes(cLower)) {
            const idx = lowerText.indexOf(cLower);
            exactMatch = text.substring(idx, idx + cLower.length);
          } else {
            // Fuzzy search by cleaning punctuation and spaces
            const cleanCliche = cLower.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s+/g, " ").trim();
            const cleanText = lowerText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ");
            const matchIdx = cleanText.indexOf(cleanCliche);
            if (matchIdx !== -1) {
              exactMatch = item.cliché;
            }
          }

          if (exactMatch) {
            const alreadyExists = finalClichés.some(c => c.cliché.toLowerCase() === exactMatch.toLowerCase());
            if (!alreadyExists) {
              finalClichés.push({
                cliché: exactMatch,
                explanation: item.explanation || "Речевой штамп или клише ИИ.",
                replacements: item.replacements || []
              });
            }
          }
        });
      }

    } catch (geminiErr: any) {
      console.warn("Gemini Text Quality Analysis not available (using local algorithm fallback). Info:", geminiErr.message || geminiErr);
      
      const clichésCount = finalClichés.length;
      const errorsCount = spellErrors.length;
      humanScore = Math.max(10, 100 - (clichésCount * 8) - Math.min(20, errorsCount * 3));
      
      const textWords = text.split(/\s+/).filter(Boolean).length || 1;
      const shortWords = text.split(/,| |\n/).filter((w: string) => w.length < 4).length;
      waterPercent = Math.min(100, Math.round((clichésCount * 6 + (shortWords / textWords) * 35)));
    }

    res.json({
      spellErrors,
      aiClichés: finalClichés,
      humanScore,
      waterPercent
    });
  } catch (error: any) {
    console.error("Text Quality Check Endpoint Error:", error);
    res.status(500).json({ error: error.message || "Ошибка при проверке текста." });
  }
});

// API endpoint for deep AI-powered humanization / rewriting of text
app.post("/api/humanize-text", async (req, res) => {
  try {
    const { text, customApiKey } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Текст обязателен для заполнения." });
    }

    const ai = getAIClient(customApiKey);
    const prompt = `Ты — элитный редактор и копирайтер, непревзойденный мастер 'очеловечивания' текстов.
Твоя цель — полностью переписать предоставленный текст, сделав его живым, естественным, увлекательным и легким для чтения, ориентированным на аудиторию Яндекс.Дзен.

При переписывании СТРОГО соблюдай правила:
1. Полностью избавься от ЛЮБЫХ роботизированных ИИ-штампов и канцеляризмов (таких как "в современном мире", "важно отметить", "несомненно", "безусловно", "таким образом", "широкий спектр", "эффективное решение" и т.д.).
2. Перепиши сухие фразы в живой, разговорный, но экспертный язык от первого или третьего лица (стиль опытного инженера или директора компании "Балтик Мастер", которая занимается ремонтом кухонь HoReCa).
3. Исправь все орфографические, пунктуационные и грамматические ошибки. Сделай текст грамотным и профессиональным.
4. Сохрани все важные факты, цифры, технические характеристики, названия моделей и контактные данные.
5. Текст должен быть структурирован красивыми абзацами и иметь заголовок, если он был.
6. СТРОГО ЗАПРЕЩЕНО использовать Markdown разметку! Не используй символы жирности (**), курсива (*), а также заголовки типа #, ##, ###. Все заголовки пиши просто отдельной строкой, используя красивый литературный русский язык. Списки оформляй с использованием обычных цифр (1, 2, 3) или простых дефисов (-). Текст должен быть абсолютно чистым, грамотным и готовым к публикации без мусорных спецсимволов.

Вот исходный текст:
"""
${text}
"""

Напиши переписанный, полностью очеловеченный текст. Твой ответ должен содержать ТОЛЬКО готовый текст и ничего больше (без пояснений "Вот переписанный текст", "Конечно, я сделал" и т.д.).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    let humanizedText = response.text || "";
    if (!humanizedText) {
      throw new Error("Gemini вернул пустой ответ при очеловечивании.");
    }

    // Double security check: strip any remaining Markdown formatting that Gemini might have still outputted
    humanizedText = humanizedText
      .replace(/\*\*\s*/g, "")  // Remove bold markdown start/end
      .replace(/\*\s*/g, "• ")   // Convert bullet points to clean unicode bullet points
      .replace(/#{1,6}\s+/g, "") // Remove header markers (###, ##, #) entirely
      .trim();

    res.json({ text: humanizedText });
  } catch (error: any) {
    console.warn("AI Humanization Error:", error.message || error);
    res.status(500).json({ error: error.message || "Ошибка при очеловечивании текста." });
  }
});

// API endpoint for deep AI-powered SEO analysis, Title, Meta, and Suggestions
app.post("/api/seo-analyze", async (req, res) => {
  try {
    const { text, customApiKey } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Текст обязателен для анализа." });
    }

    let recommendedTitle = "";
    let recommendedMeta = "";
    let seoKeywords: string[] = [];
    let improvements: string[] = [];
    let readabilityScore = 80;
    let spamPercent = 20;
    let waterPercent = 25;

    try {
      const ai = getAIClient(customApiKey);
      const prompt = `Ты — ведущий SEO-оптимизатор и контент-стратег для коммерческих сайтов и Яндекс.Дзен.
Тебе нужно провести глубокий SEO-анализ следующего текста, составить идеальный Заголовок (Title, до 60 символов, интригующий и полезный), продающее Мета-описание (Meta Description, до 160 символов, с призывом к действию), выделить 5-7 ключевых слов для продвижения и предложить 3 конкретные профессиональные рекомендации по улучшению статьи.

Вот текст статьи:
"""
${text}
"""

Верни ответ СТРОГО в формате JSON без какого-либо форматирования markdown (без \`\`\`json ... \`\`\`), только чистый объект JSON с такой структурой:
{
  "recommendedTitle": "оптимальный кликабельный SEO-заголовок",
  "recommendedMeta": "продающий мета-описание с выгодой и телефоном, если телефон есть",
  "seoKeywords": ["ключ1", "ключ2", "ключ3", "ключ4", "ключ5"],
  "improvements": ["первая рекомендация по стилю или оптимизации", "вторая рекомендация", "третья рекомендация"],
  "readabilityScore": <число от 10 до 100, оценка простоты восприятия текста>,
  "spamPercent": <число от 5 до 100, процент заспамленности ключевиками>,
  "waterPercent": <число от 5 до 100, процент воды и лишних фраз>
}

Убедись, что:
1. Заголовок и Мета-описание написаны на идеальном, чистом русском языке, БЕЗ спецсимволов и markdown-разметки (никаких **, *, #, ###).
2. Рекомендации по улучшению носят экспертный характер, специфичный для ремонта кухонного оборудования HoReCa и Baltic Master.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      let responseText = response.text || "{}";
      responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(responseText);

      recommendedTitle = parsed.recommendedTitle || "";
      recommendedMeta = parsed.recommendedMeta || "";
      seoKeywords = parsed.seoKeywords || [];
      improvements = parsed.improvements || [];
      if (typeof parsed.readabilityScore === "number") readabilityScore = parsed.readabilityScore;
      if (typeof parsed.spamPercent === "number") spamPercent = parsed.spamPercent;
      if (typeof parsed.waterPercent === "number") waterPercent = parsed.waterPercent;
    } catch (geminiErr: any) {
      console.warn("Gemini SEO Analysis not available (using local heuristic fallback). Info:", geminiErr.message || geminiErr);
      
      // Local Heuristic Fallback
      const wordsCount = text.split(/\s+/).filter(Boolean).length || 1;
      const charsCount = text.length;

      recommendedTitle = text.split(/[.!?\n]/)[0]?.substring(0, 60) || "Ремонт оборудования Baltic Master";
      recommendedMeta = text.substring(0, 150) + "... Звоните!";
      seoKeywords = ["ремонт оборудования", "Baltic Master", "сервис HoReCa", "кухонная техника"];
      
      improvements = [];
      if (!text.includes("Балтик Мастер")) {
        improvements.push("Добавьте упоминание бренда 'Балтик Мастер' для укрепления SEO-авторитета.");
      }
      if (charsCount < 1500) {
        improvements.push("Увеличьте объем текста до 1500+ символов для лучшего ранжирования поисковиками.");
      } else {
        improvements.push("Объем текста оптимален. Рекомендуем разбить длинные абзацы списками.");
      }
      if (!text.includes("+7")) {
        improvements.push("Добавьте контактный номер телефона в конце статьи для повышения конверсии.");
      } else {
        improvements.push("Контактные данные найдены. Это отлично мотивирует клиентов на звонок.");
      }

      readabilityScore = Math.min(100, Math.max(40, 100 - Math.round(wordsCount / 30)));
      spamPercent = text.includes("ремонт") ? 35 : 15;
      waterPercent = Math.min(80, Math.max(15, Math.round((charsCount / wordsCount) * 4)));
    }

    res.json({
      recommendedTitle,
      recommendedMeta,
      seoKeywords,
      improvements,
      readabilityScore,
      spamPercent,
      waterPercent
    });
  } catch (error: any) {
    console.error("SEO Analyze Endpoint Error:", error);
    res.status(500).json({ error: error.message || "Ошибка при SEO-анализе текста." });
  }
});

// Helper to get external secure server URL in cloud platforms
function getSecureServerUrl(req: express.Request): string {
  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] as string || req.protocol || "http";
  // If hosted on a cloud domain (like Cloud Run), always upgrade to secure https to bypass proxy gateway auth issues
  if (host.includes("run.app") || host.includes("aistudio") || proto === "https") {
    return `https://${host}`;
  }
  return `${proto}://${host}`;
}

// Helper to regenerate offline HTML asynchronously
async function regenerateOfflineHtml(serverUrl?: string): Promise<void> {
  console.log("Regenerating offline HTML file asynchronously with serverUrl:", serverUrl);
  const envPrefix = serverUrl ? `APP_URL="${serverUrl}" ` : "";
  await execPromise(`${envPrefix}npx tsx generate-single-html.js`);
}

// Global promise to prevent duplicate concurrent builds
let macBuildPromise: Promise<void> | null = null;

function runMacBuild(serverUrl?: string): Promise<void> {
  if (macBuildPromise) {
    return macBuildPromise;
  }
  
  macBuildPromise = (async () => {
    console.log("Starting macOS App build asynchronously with serverUrl:", serverUrl);
    const envPrefix = serverUrl ? `APP_URL="${serverUrl}" ` : "";
    await execPromise(`${envPrefix}npx tsx build-mac-app.js`);
  })().then(
    () => {
      macBuildPromise = null; // Clear so it can be rebuilt in the future if requested/needed
    },
    (err) => {
      macBuildPromise = null; // Reset on failure so it can be retried
      throw err;
    }
  );
  
  return macBuildPromise;
}

// API endpoint for offline HTML download
app.get("/api/download-offline-html", async (req, res) => {
  try {
    const serverUrl = getSecureServerUrl(req);
    // Dynamically regenerate the offline HTML on-the-fly so it is always completely fresh and up-to-date!
    await regenerateOfflineHtml(serverUrl);
  } catch (genErr) {
    console.error("Error regenerating offline HTML:", genErr);
    // If generation fails, we still try to serve the existing file as fallback
  }

  const filePath = path.join(process.cwd(), "baltic_master_zen.html");
  res.download(filePath, "baltic_master_zen.html", (err) => {
    if (err) {
      const errCode = (err as any).code;
      if (
        req.aborted ||
        err.message?.includes("aborted") ||
        err.message?.includes("EPIPE") ||
        errCode === "ECONNABORTED" ||
        errCode === "EPIPE" ||
        errCode === "ECONNRESET"
      ) {
        console.log("Offline HTML download was aborted or interrupted by the client.");
        return;
      }
      console.error("Error sending file:", err);
      if (!res.headersSent) {
        res.status(500).send("Офлайн-файл не найден на сервере. Пожалуйста, обратитесь к администратору.");
      }
    }
  });
});

// API endpoint for downloading macOS native application (arm64 Apple Silicon)
app.get("/api/download-mac-zip", async (req, res) => {
  const filePath = path.join(process.cwd(), "dist-mac", "Baltic_Master_Zen_macOS_M4.zip");
  
  if (!fs.existsSync(filePath)) {
    try {
      console.log("macOS ZIP not found, building on-demand asynchronously...");
      const serverUrl = getSecureServerUrl(req);
      await runMacBuild(serverUrl);
    } catch (buildErr) {
      console.error("Error packaging macOS app on-the-fly:", buildErr);
      if (!res.headersSent) {
        res.status(500).send("Не удалось скомпилировать macOS приложение на сервере. Пожалуйста, попробуйте позже.");
      }
      return;
    }
  }

  res.download(filePath, "Baltic_Master_Zen_macOS_M4.zip", (err) => {
    if (err) {
      const errCode = (err as any).code;
      if (
        req.aborted ||
        err.message?.includes("aborted") ||
        err.message?.includes("EPIPE") ||
        errCode === "ECONNABORTED" ||
        errCode === "EPIPE" ||
        errCode === "ECONNRESET"
      ) {
        console.log("macOS app ZIP download was aborted or interrupted by the client.");
        return;
      }
      console.error("Error sending macOS app ZIP:", err);
      if (!res.headersSent) {
        res.status(500).send("Не удалось скачать файл. Пожалуйста, обратитесь к администратору.");
      }
    }
  });
});

// API endpoint to retrieve info about the split macOS app ZIP chunks
app.get("/api/mac-app-parts-info", async (req, res) => {
  const distPublicDir = path.join(process.cwd(), "dist-mac");
  
  // Build on-demand if the directory or ZIP doesn't exist yet
  const mainZipPath = path.join(distPublicDir, "Baltic_Master_Zen_macOS_M4.zip");
  if (!fs.existsSync(mainZipPath)) {
    try {
      console.log("macOS app files not found. Building parts on-demand...");
      const serverUrl = getSecureServerUrl(req);
      await runMacBuild(serverUrl);
    } catch (buildErr) {
      console.error("Error packaging macOS app on-the-fly for parts info:", buildErr);
      return res.status(500).json({ error: "Не удалось скомпилировать macOS приложение на сервере." });
    }
  }

  if (!fs.existsSync(distPublicDir)) {
    return res.json({ totalParts: 0, parts: [], totalSizeMB: "0.00" });
  }

  const files = fs.readdirSync(distPublicDir)
    .filter(f => f.startsWith("Baltic_Master_Zen_macOS_M4.zip.part"))
    .sort(); // ensures aa, ab, ac, ad... order

  const parts = files.map(file => {
    const stats = fs.statSync(path.join(distPublicDir, file));
    const suffix = file.substring("Baltic_Master_Zen_macOS_M4.zip.part".length);
    return {
      name: file,
      suffix,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2)
    };
  });

  res.json({
    totalParts: parts.length,
    parts,
    totalSizeMB: parts.reduce((acc, p) => acc + parseFloat(p.sizeMB), 0).toFixed(2),
    mergeCommand: "cat Baltic_Master_Zen_macOS_M4.zip.part* > Baltic_Master_Zen_macOS_M4.zip"
  });
});

// API endpoint to download a specific chunk of the macOS app ZIP
app.get("/api/download-mac-zip-part/:suffix", async (req, res) => {
  const suffix = req.params.suffix;
  
  // Basic suffix format validation (2 letters like aa, ab, ac...)
  if (!/^[a-z]{2}$/.test(suffix)) {
    return res.status(400).send("Некорректный суффикс части.");
  }

  const fileName = `Baltic_Master_Zen_macOS_M4.zip.part${suffix}`;
  const filePath = path.join(process.cwd(), "dist-mac", fileName);

  if (!fs.existsSync(filePath)) {
    try {
      console.log(`Part ${suffix} not found. Building on-demand asynchronously...`);
      const serverUrl = getSecureServerUrl(req);
      await runMacBuild(serverUrl);
    } catch (buildErr) {
      console.error("Error packaging macOS app on-the-fly for part download:", buildErr);
      if (!res.headersSent) {
        res.status(500).send("Не удалось скомпилировать macOS приложение на сервере.");
      }
      return;
    }
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Запрошенная часть файла не найдена.");
  }

  res.download(filePath, fileName, (err) => {
    if (err) {
      const errCode = (err as any).code;
      if (
        req.aborted ||
        err.message?.includes("aborted") ||
        err.message?.includes("EPIPE") ||
        errCode === "ECONNABORTED" ||
        errCode === "EPIPE" ||
        errCode === "ECONNRESET"
      ) {
        console.log(`Part ${suffix} download was aborted or interrupted by the client.`);
        return;
      }
      console.error(`Error sending part ${suffix}:`, err);
      if (!res.headersSent) {
        res.status(500).send("Не удалось скачать часть файла. Пожалуйста, обратитесь к администратору.");
      }
    }
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Baltic Master Zen API is running smoothly." });
});

app.get("/api/check-update", (req, res) => {
  res.json({
    latestVersion: "2.8.1",
    minCompatibleVersion: "2.0.0",
    releaseDate: "2026-07-03",
    changelog: [
      "Глубокий ИИ-анализ орфографии, водности, стиля и выявление роботизированного почерка (клише) через Google Gemini API",
      "Интеллектуальное очеловечивание (Humanizer) текстов статей с автоматической очисткой от лишнего форматирования (*, **, ###) для безупречной публикации в Дзене",
      "Прямая поддержка OTA-обновлений для macOS: новые версии записываются напрямую в файл baltic_master_zen.html на жестком диске",
      "Оптимизированный серверный сборщик macOS-приложений на лету с очисткой устаревшего кэша и поддержкой Apple Silicon"
    ],
    downloadUrl: "/api/download-offline-html"
  });
});

async function startServer() {
  // Clear stale macOS app zip on server startup to guarantee fresh builds when requested
  const distPublicDir = path.join(process.cwd(), "dist-mac");
  if (fs.existsSync(distPublicDir)) {
    console.log("Clearing stale macOS app zip on startup to guarantee fresh builds...");
    try {
      fs.rmSync(distPublicDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to clean dist-mac directory:", e);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
