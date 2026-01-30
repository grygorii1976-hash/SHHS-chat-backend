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

// Store conversations in memory (for production, use Redis or database)
const conversations = new Map();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    // Generate session ID if not provided
    const session = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get or create conversation history
    if (!conversations.has(session)) {
      conversations.set(session, []);
    }
    
    const history = conversations.get(session);
    
    // Add user message to history
    history.push({ role: "user", content: message });
    
    // Keep only last 20 messages to avoid token limits
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful AI receptionist for Skillful Hands Handyman Services in Central Florida.

Your job:
1. Greet the customer warmly (only once at the start)
2. Ask what service they need
3. Collect required information:
   - Name (first and last)
   - Phone number
   - City and ZIP code
   - Brief description of the work needed
   - Preferred date/timeframe

Important rules:
- Ask ONE question at a time
- Remember what the customer already told you
- Don't repeat questions you already asked
- Be conversational and friendly
- Once you have all information, confirm it and thank them
- If customer asks about services, mention: plumbing, electrical, drywall, painting, tile work, carpentry, pressure washing, etc.

Keep responses short (2-3 sentences max).`
        },
        ...history
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    const assistantMessage = response.choices[0].message.content;
    
    // Add assistant response to history
    history.push({ role: "assistant", content: assistantMessage });
    
    // Update conversation
    conversations.set(session, history);
    
    // Clean up old conversations (older than 1 hour)
    cleanupOldConversations();

    res.json({ 
      reply: assistantMessage,
      sessionId: session
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ 
      error: "Sorry, I'm having trouble right now. Please try again." 
    });
  }
});

// Cleanup function to prevent memory leaks
function cleanupOldConversations() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [sessionId, history] of conversations.entries()) {
    // Extract timestamp from sessionId
    const timestamp = parseInt(sessionId.split('_')[1]);
    if (timestamp < oneHourAgo) {
      conversations.delete(sessionId);
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
