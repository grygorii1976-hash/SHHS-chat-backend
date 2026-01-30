import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const messages = [
      {
        role: "system",
        content: `You are an AI receptionist for Skillful Hands Handyman Services in Central Florida.

CRITICAL INSTRUCTIONS - READ EVERY TIME:
1. ALWAYS read the ENTIRE conversation history before responding
2. NEVER ask for information the customer already provided
3. Track what you already know:
   - Service needed? ✓ or ✗
   - Customer name? ✓ or ✗
   - Phone number? ✓ or ✗
   - Location (city/ZIP)? ✓ or ✗
   - Preferred date? ✓ or ✗

YOUR PROCESS:
Step 1: Review the conversation - what information do you already have?
Step 2: Identify what's still missing
Step 3: Ask for ONE missing piece of information
Step 4: Once you have ALL 5 pieces, summarize and thank them

EXAMPLE GOOD BEHAVIOR:
User: "I need plumbing"
You: "Great! What plumbing work do you need help with?"
User: "Fix a leaky faucet"
You: "Perfect! What's your location?" [NOT asking about service again!]

EXAMPLE BAD BEHAVIOR (NEVER DO THIS):
User: "I need plumbing"
You: "What service do you need?" [Customer just told you!]

Services: plumbing, electrical, drywall, painting, tile, carpentry, pressure washing, etc.

Keep responses SHORT (1-2 sentences).`
      },
      ...history,
      { role: "user", content: message }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.5, // Lower temperature = more consistent
      max_tokens: 150
    });

    const assistantMessage = response.choices[0].message.content;

    res.json({ reply: assistantMessage });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      error: "Sorry, I'm having trouble right now. Please try again." 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
```

---

## 🔑 Ключевые изменения:

1. ✅ **Более директивный промпт** с примерами хорошего/плохого поведения
2. ✅ **Чек-лист** для AI (✓ или ✗)
3. ✅ **Temperature = 0.5** (вместо 0.7) — более предсказуемое поведение
4. ✅ **CRITICAL INSTRUCTIONS** — привлекает внимание модели

---

## 🚀 Обновите backend:

1. VS Code → `server.js` → замените код
2. Сохраните
3. GitHub Desktop → Commit → Push
4. Подождите 2 минуты (Render передеплоит)

---

## 🧪 Финальный тест:

1. Обновите сайт: `Cmd + Shift + R`
2. Откройте чат
3. Тестовый сценарий:
```
Вы: I need bathroom work
AI: [спросит детали]
Вы: Replace toilet
AI: [спросит локацию]
Вы: Kissimmee 34746
AI: [спросит имя, БЕЗ повтора про услугу!]
Вы: Mike Smith
AI: [спросит телефон]
Вы: 407-555-0199
AI: [суммирует ВСЁ: Mike, 407-555-0199, Kissimmee 34746, toilet replacement]
