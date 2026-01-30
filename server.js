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

// n8n webhook URL for chat leads
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://skillfulhands.app.n8n.cloud/webhook/chat-lead";

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Helper function to extract lead data from conversation
function extractLeadData(history) {
  const leadData = {
    name: null,
    phone: null,
    service: null,
    location: null,
    city: null,
    zip: null,
    preferredDate: null
  };
  
  // Simple extraction - look for patterns in user messages
  const userMessages = history.filter(msg => msg.role === "user").map(msg => msg.content);
  
  // Name pattern (firstname lastname)
  const namePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/;
  
  // Phone pattern (various formats)
  const phonePattern = /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s?\d{3}[-.\s]?\d{4})\b/;
  
  // ZIP pattern
  const zipPattern = /\b(\d{5})\b/;
  
  // Service keywords
  const serviceKeywords = ['plumb', 'electric', 'paint', 'drywall', 'tile', 'carpentr', 'pressure', 'deck', 'door', 'window', 'fan', 'faucet', 'toilet', 'repair', 'install', 'fix', 'replace'];
  
  for (const msg of userMessages) {
    // Extract name
    if (!leadData.name) {
      const nameMatch = msg.match(namePattern);
      if (nameMatch) {
        leadData.name = `${nameMatch[1]} ${nameMatch[2]}`;
      }
    }
    
    // Extract phone
    if (!leadData.phone) {
      const phoneMatch = msg.match(phonePattern);
      if (phoneMatch) {
        leadData.phone = phoneMatch[1].replace(/[-.\s()]/g, '');
      }
    }
    
    // Extract ZIP
    if (!leadData.zip) {
      const zipMatch = msg.match(zipPattern);
      if (zipMatch) {
        leadData.zip = zipMatch[1];
      }
    }
    
    // Extract service
    if (!leadData.service) {
      const lowerMsg = msg.toLowerCase();
      for (const keyword of serviceKeywords) {
        if (lowerMsg.includes(keyword)) {
          leadData.service = msg;
          break;
        }
      }
    }
  }
  
  // Set location from ZIP if available
  if (leadData.zip) {
    leadData.location = leadData.zip;
    
    // Common Central Florida cities by ZIP
    const zipToCityMap = {
      '34746': 'Kissimmee',
      '34747': 'Kissimmee',
      '32801': 'Orlando',
      '32803': 'Orlando',
      '32804': 'Orlando',
      '32805': 'Orlando',
      '32806': 'Orlando',
      '32807': 'Orlando',
      '32808': 'Orlando',
      '32809': 'Orlando',
      '32810': 'Orlando',
      '32811': 'Orlando',
      '32812': 'Orlando',
      '34741': 'Kissimmee',
      '34743': 'Kissimmee',
      '34744': 'Kissimmee',
      '34758': 'Davenport'
    };
    
    leadData.city = zipToCityMap[leadData.zip] || 'Central Florida';
  }
  
  return leadData;
}

// Check if we have complete lead data
function isLeadComplete(leadData) {
  return leadData.name && leadData.phone && leadData.service && leadData.zip;
}

// Send lead to n8n webhook
async function sendLeadToN8n(leadData, conversationHistory) {
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'chat',
        first_name: leadData.name ? leadData.name.split(' ')[0] : '',
        last_name: leadData.name ? leadData.name.split(' ').slice(1).join(' ') : '',
        phone: leadData.phone,
        city: leadData.city,
        zip: leadData.zip,
        service_description: leadData.service,
        preferred_date: leadData.preferredDate || 'Not specified',
        lead_status: 'New',
        conversation: conversationHistory
      })
    });
    
    if (response.ok) {
      console.log('✅ Lead sent to n8n successfully');
      return true;
    } else {
      console.error('❌ Failed to send lead to n8n:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending lead to n8n:', error);
    return false;
  }
}

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

CRITICAL MEMORY RULES - YOU MUST FOLLOW THESE:
1. ALWAYS review the ENTIRE conversation history before each response
2. NEVER ask for information the customer has already provided
3. Keep a mental checklist of what you know:
   ✓ Service needed? (what type of work)
   ✓ Customer name? (first and last)
   ✓ Phone number?
   ✓ Location? (city and ZIP code)
   ✓ Preferred date/timeframe?

YOUR CONVERSATION FLOW:
Step 1: Greet warmly (only on first message)
Step 2: Ask what service they need
Step 3: Once you know the service, ask for their location (city/ZIP)
Step 4: Once you know location, ask for their name
Step 5: Once you know name, ask for their phone number
Step 6: Once you know phone, ask about preferred date/timeframe
Step 7: When you have ALL information, summarize it back and thank them

IMPORTANT:
- Ask ONE question at a time
- Reference information they already gave you to show you remember
- Be conversational and friendly
- Keep responses SHORT (2-3 sentences maximum)

EXAMPLE OF GOOD CONVERSATION:
User: "I need plumbing help"
Assistant: "I'd be happy to help with your plumbing needs! What specific plumbing work do you need assistance with?"
User: "Fix a leaky faucet in the bathroom"
Assistant: "Got it - leaky bathroom faucet repair. What city are you located in, and what's your ZIP code?"
User: "Orlando, 32801"
Assistant: "Perfect, Orlando 32801. May I have your name please?"
User: "John Smith"
Assistant: "Thank you, John! What's the best phone number to reach you at?"
User: "407-555-0123"
Assistant: "Great! And when would you like us to come out for the faucet repair?"
User: "This weekend if possible"
Assistant: "Perfect! Let me confirm: John Smith at 407-555-0123 in Orlando 32801, needs a leaky bathroom faucet repaired, preferably this weekend. We'll have someone contact you shortly to schedule. Thank you for choosing Skillful Hands!"

SERVICES WE OFFER:
Plumbing, electrical work, drywall repair, painting, tile installation, carpentry, pressure washing, deck repairs, door/window installation, furniture assembly, general handyman services.

Remember: You have the full conversation history - USE IT!`
      },
      ...history,
      { role: "user", content: message }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      temperature: 0.3,
      max_tokens: 200
    });

    const assistantMessage = response.choices[0].message.content;
    
    // Build updated conversation history
    const updatedHistory = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: assistantMessage }
    ];
    
    // Check if we have complete lead data
    const leadData = extractLeadData(updatedHistory);
    
    console.log('📊 Extracted lead data:', leadData);
    console.log('✅ Complete?', isLeadComplete(leadData));
    
    // If lead is complete and we haven't sent it yet, send to n8n
    if (isLeadComplete(leadData)) {
      // Check if this is the summary message (contains "confirm" or "contact you")
      if (assistantMessage.toLowerCase().includes('confirm') || 
          assistantMessage.toLowerCase().includes('contact you')) {
        console.log('🚀 Sending complete lead to n8n...');
        await sendLeadToN8n(leadData, updatedHistory);
      }
    }

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

## 🔧 ШАГ 2: Добавляем переменную окружения в Render

1. Откройте https://render.com
2. Ваш сервис **shhs-chat-backend**
3. **Environment** (слева в меню)
4. **Add Environment Variable**
5. Добавьте:
```
   Key: N8N_WEBHOOK_URL
   Value: https://skillfulhands.app.n8n.cloud/webhook/chat-lead
```
6. **Save Changes**

Render автоматически передеплоит сервис (2-3 минуты).

---

## 🔧 ШАГ 3: Создаём новый webhook в n8n

1. Откройте https://skillfulhands.app.n8n.cloud
2. Создайте **New Workflow** или откройте существующий
3. Назовите: "Chat Lead to HubSpot"

### Добавьте ноды:

**1. Webhook (Trigger)**
- Path: `/chat-lead`
- Method: POST

**2. Set Node (форматирование данных)**
- Name: Format Lead Data
- Values:
```
  first_name = {{ $json.first_name }}
  last_name = {{ $json.last_name }}
  phone = {{ $json.phone }}
  city = {{ $json.city }}
  zip = {{ $json.zip }}
  service = {{ $json.service_description }}
  source = chat
  lead_status = New
```

**3. HubSpot Node (Create/Update Contact)**
- Operation: Create or Update Contact
- Email: (оставьте пустым или используйте placeholder)
- Properties:
  - First Name: `{{ $json.first_name }}`
  - Last Name: `{{ $json.last_name }}`
  - Phone: `{{ $json.phone }}`
  - City: `{{ $json.city }}`
  - ZIP: `{{ $json.zip }}`
  - Service Description: `{{ $json.service }}`
  - Lead Source: "Chat Widget"

**4. Telegram Node (Send Message)**
- Chat ID: ваш Telegram ID
- Message:
```
  🆕 Новый лид из ЧАТА!
  
  👤 {{ $json.first_name }} {{ $json.last_name }}
  📞 {{ $json.phone }}
  📍 {{ $json.city }}, {{ $json.zip }}
  🔧 {{ $json.service }}
  
  Источник: AI Chat Widget
```

**5. Активируйте workflow!**

---

## 🧪 ШАГ 4: Тестирование

Подождите пока Render передеплоится (2-3 минуты после добавления переменной).

Затем протестируйте **полный цикл**:

1. Откройте чат на сайте
2. Пройдите весь диалог до конца:
```
   - Услуга
   - ZIP
   - Имя
   - Телефон
   - Дата