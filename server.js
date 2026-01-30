import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🛡 Защита от спама
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 25
}));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// ================= HEALTH =================
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ================= AI LEAD EXTRACTION =================
async function extractLeadWithAI(conversation) {
  const prompt = `
Extract customer lead data from this conversation.

Return ONLY valid JSON:
{
  "first_name": "",
  "last_name": "",
  "phone": "",
  "service": "",
  "zip": "",
  "preferred_date": ""
}

Conversation:
${JSON.stringify(conversation)}
`;

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: prompt,
    temperature: 0
  });

  try {
    return JSON.parse(response.output_text);
  } catch {
    return {};
  }
}

function isLeadComplete(lead) {
  return (
    lead.first_name &&
    lead.phone &&
    lead.service &&
    lead.zip &&
    lead.phone.length >= 10
  );
}

// ================= SEND TO N8N =================
async function sendLeadToN8n(lead, conversation) {
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "chat",
        ...lead,
        conversation
      })
    });

    if (!res.ok) throw new Error("n8n failed");
    console.log("✅ Lead sent to n8n");
  } catch (e) {
    console.error("❌ n8n error:", e.message);
  }
}

// ================= CHAT ENDPOINT =================
app.post("/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const messages = [
      {
        role: "system",
        content: `You are an AI receptionist for Skillful Hands Handyman Services in Central Florida.

RULES:
• Ask ONE question at a time
• Never ask twice for the same info
• Collect: service, location (ZIP), name, phone, preferred date
• Be friendly and short (2-3 sentences)
• When all info collected, confirm summary and say we will contact them`
      },
      ...history,
      { role: "user", content: message }
    ];

    // 🤖 Chat response
    const ai = await openai.responses.create({
      model: "gpt-5-mini",
      input: messages,
      temperature: 0.3,
      max_output_tokens: 200
    });

    const reply = ai.output_text;

    const updatedHistory = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: reply }
    ];

    // 🧠 Extract lead with AI
    const lead = await extractLeadWithAI(updatedHistory);
    console.log("📊 Lead extracted:", lead);

    if (isLeadComplete(lead)) {
      console.log("🚀 Complete lead detected");
      await sendLeadToN8n(lead, updatedHistory);
    }

    res.json({ reply });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "AI is busy, try again." });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});