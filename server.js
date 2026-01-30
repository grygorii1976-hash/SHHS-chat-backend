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

// Service area ZIP codes - Central Florida
const SERVICE_AREA_ZIPS = new Set([
  '34746', '33848', '34758', '34742', '34745', '34741', '33858', '34743', '34744', '33896',
  '34769', '32837', '34747', '34770', '32821', '34759', '33836', '33837', '32830', '32824',
  '32836', '34772', '33845', '32899', '33844', '32827', '32819', '32809', '33897', '32839',
  '33851', '34786', '32812', '32811', '32806', '33838', '32832', '32835', '33850', '32805',
  '34787', '32822', '33881', '34771', '33877', '32896', '32853', '32854', '32855', '32856',
  '32857', '32858', '32859', '32860', '32861', '32862', '32867', '32868', '32869', '32872',
  '32877', '32878', '32885', '32886', '32887', '32891', '32897', '32802', '34734', '32801',
  '32829', '33888', '33868', '32803', '33885', '32807', '33884', '33882', '33883', '34761',
  '32808', '32804', '32814', '33898', '32825', '34777', '34778', '34714', '32818', '34760',
  '32831', '34740', '33853', '33856', '32789', '34773', '32790', '32793', '33823', '32828',
  '32710', '32733', '32794', '33839', '32810', '34711', '33854', '33880', '32792', '32817',
  '32799', '32751', '33859', '34756', '32834', '32833', '32826', '32816', '33827', '32730',
  '34712', '34713', '32714', '32715', '32716', '34755', '32703', '32701', '32707', '33820',
  '32704', '34729', '32718', '32719', '33855', '32820', '33801', '32768', '34715', '33809',
  '32708', '33805', '32709', '32752', '32791', '33812', '33840', '33846', '32750', '34736',
  '32762', '33831', '32765', '34739', '33803', '33830', '32712', '32779', '33802', '33806',
  '33804', '32798', '33813', '32757', '33843', '33810', '33807', '33867', '34753', '32746',
  '32766', '32745', '34705', '32795', '33815', '32773', '33849', '32777', '34737', '33847',
  '33811', '32926', '32772', '32776', '33841', '32756', '32732', '32778', '32747', '32927',
  '32955', '34797', '32780', '32771', '33540', '33863', '32922', '33564', '32904', '33514',
  '33524', '32959', '32923', '32924', '33565', '33826', '32956', '33860', '33542', '32727',
  '32713', '32940', '33539', '33563', '32753', '32934', '32754', '32726', '34748', '34762',
  '33825', '33597', '32725', '32954', '32781', '32783', '33526', '32736', '32728', '33537',
  '33567', '33541', '32739', '33566', '34749', '34789', '33835', '32952', '33593', '32953',
  '32908', '32796', '33525', '32738', '32907', '32763', '32784', '33574', '32735', '32764',
  '34788', '32935', '32774', '33523', '33587', '32936', '32919'
]);

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
    preferredDate: null,
    inServiceArea: false
  };
  
  const userMessages = history.filter(msg => msg.role === "user").map(msg => msg.content);
  
  // More flexible name pattern (case-insensitive, allows one or two words)
  const namePattern = /\b([A-Z][a-z]{1,})\s+([A-Z][a-z]{1,})\b/;
  
  // Phone pattern (various formats)
  const phonePattern = /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s?\d{3}[-.\s]?\d{4})\b/;
  
  // ZIP pattern
  const zipPattern = /\b(\d{5})\b/;
  
  // Service keywords
  const serviceKeywords = ['plumb', 'electric', 'paint', 'drywall', 'tile', 'carpentr', 
    'pressure', 'deck', 'door', 'window', 'fan', 'faucet', 'toilet', 'repair', 'install', 
    'fix', 'replace', 'remodel', 'renovation', 'construct', 'build', 'mount', 'hang'];
  
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
        leadData.inServiceArea = SERVICE_AREA_ZIPS.has(zipMatch[1]);
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
  
  // Set location from ZIP
  if (leadData.zip) {
    leadData.location = leadData.zip;
    
    // Major cities in service area
    const zipToCityMap = {
      // Kissimmee area
      '34746': 'Kissimmee', '34741': 'Kissimmee', '34743': 'Kissimmee', '34744': 'Kissimmee',
      '34745': 'Kissimmee', '34747': 'Kissimmee', '34758': 'Davenport', '34759': 'Intercession City',
      '34740': 'Kissimmee', '34742': 'Kissimmee', '34769': 'St. Cloud', '34771': 'St. Cloud',
      '34772': 'St. Cloud', '34773': 'St. Cloud',
      
      // Orlando area
      '32801': 'Orlando', '32802': 'Orlando', '32803': 'Orlando', '32804': 'Orlando',
      '32805': 'Orlando', '32806': 'Orlando', '32807': 'Orlando', '32808': 'Orlando',
      '32809': 'Orlando', '32810': 'Orlando', '32811': 'Orlando', '32812': 'Orlando',
      '32814': 'Orlando', '32816': 'Orlando', '32817': 'Orlando', '32818': 'Orlando',
      '32819': 'Orlando', '32820': 'Orlando', '32821': 'Orlando', '32822': 'Orlando',
      '32824': 'Orlando', '32825': 'Orlando', '32826': 'Orlando', '32827': 'Orlando',
      '32828': 'Orlando', '32829': 'Orlando', '32830': 'Orlando', '32831': 'Orlando',
      '32832': 'Orlando', '32833': 'Orlando', '32834': 'Orlando', '32835': 'Orlando',
      '32836': 'Orlando', '32837': 'Orlando', '32839': 'Orlando',
      
      // Winter Park area
      '32789': 'Winter Park', '32790': 'Winter Park', '32792': 'Winter Park',
      '32793': 'Winter Park', '32794': 'Winter Park',
      
      // Apopka area
      '32703': 'Apopka', '32704': 'Apopka', '32712': 'Apopka',
      
      // Ocoee area
      '34761': 'Ocoee', '34760': 'Ocoee',
      
      // Winter Garden area
      '34777': 'Winter Garden', '34778': 'Winter Garden', '34787': 'Winter Garden',
      
      // Clermont area
      '34711': 'Clermont', '34714': 'Clermont', '34715': 'Clermont',
      
      // Lakeland area
      '33801': 'Lakeland', '33803': 'Lakeland', '33805': 'Lakeland', '33809': 'Lakeland',
      '33810': 'Lakeland', '33811': 'Lakeland', '33813': 'Lakeland',
      
      // Haines City area
      '33844': 'Haines City', '33845': 'Haines City', '33846': 'Haines City',
      
      // Poinciana area
      '34758': 'Poinciana', '34759': 'Poinciana'
    };
    
    leadData.city = zipToCityMap[leadData.zip] || 'Central Florida';
  }
  
  return leadData;
}

// Check if we have complete lead data
function isLeadComplete(leadData) {
  const hasName = leadData.name && leadData.name.trim().length > 0;
  const hasPhone = leadData.phone && leadData.phone.length >= 10;
  const hasService = leadData.service && leadData.service.trim().length > 0;
  const hasZip = leadData.zip && leadData.zip.length === 5;
  
  console.log('🔍 Checking completeness:', {
    hasName,
    hasPhone,
    hasService,
    hasZip
  });
  
  return hasName && hasPhone && hasService && hasZip;
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
        in_service_area: leadData.inServiceArea,
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
      model: "gpt-5-mini",
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