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

// Improved helper function to extract lead data from conversation
function extractLeadData(history) {
  const leadData = {
    name: null,
    firstName: null,
    lastName: null,
    phone: null,
    service: null,
    location: null,
    city: null,
    zip: null,
    preferredDate: null,
    inServiceArea: false
  };
  
  const userMessages = history.filter(msg => msg.role === "user").map(msg => msg.content);
  
  // IMPROVED: More flexible name pattern (case-insensitive, allows various formats)
  const namePattern = /\b([A-Za-z][\w'-]{1,})\s+([A-Za-z][\w'-]{1,})\b/i;
  
  // Phone pattern (various formats)
  const phonePattern = /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\(\d{3}\)\s?\d{3}[-.\s]?\d{4})\b/;
  
  // ZIP pattern
  const zipPattern = /\b(\d{5})\b/;
  
  // Service keywords
  const serviceKeywords = ['plumb', 'electric', 'paint', 'drywall', 'tile', 'carpentr', 
    'pressure', 'deck', 'door', 'window', 'fan', 'faucet', 'toilet', 'repair', 'install', 
    'fix', 'replace', 'remodel', 'renovation', 'construct', 'build', 'mount', 'hang', 'leak', 'knob'];
  
  // Date keywords for extraction
  const dateKeywords = ['today', 'tomorrow', 'weekend', 'week', 'monday', 'tuesday', 'wednesday', 
    'thursday', 'friday', 'saturday', 'sunday', 'asap', 'soon', 'morning', 'afternoon', 'evening',
    'next', 'this'];
  
  for (const msg of userMessages) {
    // Extract name - IMPROVED: also check service messages for names
    if (!leadData.name) {
      const msgLower = msg.toLowerCase();
      const isServicePhrase = serviceKeywords.some(keyword => msgLower.includes(keyword));
      
      if (isServicePhrase) {
        // Try to find name pattern like "Johny Smith in" or "Johny Smith," in service messages
        const nameInServicePattern = /\b([A-Z][a-z]{1,})\s+([A-Z][a-z]{1,})\b(?=\s+(?:in|from|at|,|\.))/;
        const nameMatch = msg.match(nameInServicePattern);
        if (nameMatch) {
          leadData.firstName = nameMatch[1];
          leadData.lastName = nameMatch[2];
          leadData.name = `${nameMatch[1]} ${nameMatch[2]}`;
        }
      } else {
        // Non-service message - use original logic but exclude common non-name phrases
        const skipPhrases = ['will provide', 'no thanks', 'sounds good', 'looks good', 'not sure'];
        const isSkipPhrase = skipPhrases.some(phrase => msgLower.includes(phrase));
        
        if (!isSkipPhrase) {
          const nameMatch = msg.match(namePattern);
          if (nameMatch) {
            const firstName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
            const lastName = nameMatch[2].charAt(0).toUpperCase() + nameMatch[2].slice(1).toLowerCase();
            leadData.firstName = firstName;
            leadData.lastName = lastName;
            leadData.name = `${firstName} ${lastName}`;
          }
        }
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
    
    // Extract city name
    if (!leadData.city) {
      const cityPattern = /\b(Orlando|Kissimmee|Lakeland|Winter Park|Winter Garden|Clermont|St\.? Cloud|Saint Cloud|Apopka|Ocoee|Davenport|Haines City|Poinciana|Intercession City|Celebration|Windermere|Altamonte Springs|Sanford|Lake Mary|Maitland|Casselberry|Longwood|Cocoa|Melbourne|Titusville|Palm Bay|Rockledge)\b/i;
      const cityMatch = msg.match(cityPattern);
      if (cityMatch) {
        const cityName = cityMatch[1];
        leadData.city = cityName.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        
        if (!leadData.location) {
          leadData.location = leadData.city;
        }
        leadData.inServiceArea = true;
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
    
    // Extract preferred date
    if (!leadData.preferredDate) {
      const lowerMsg = msg.toLowerCase();
      
      // Try to extract date from patterns like "Preferred time: tomorrow at 10:00 AM"
      const datePatterns = [
        /preferred\s*(?:time|date)[:\s]+(.+?)(?:\.|$)/i,
        /schedule[d]?\s*(?:for|at|on)[:\s]+(.+?)(?:\.|$)/i,
        /(?:come|visit|appointment)\s*(?:on|at)[:\s]+(.+?)(?:\.|$)/i
      ];
      
      for (const pattern of datePatterns) {
        const match = msg.match(pattern);
        if (match) {
          leadData.preferredDate = match[1].trim();
          break;
        }
      }
      
      // Fallback: short message with date keywords
      if (!leadData.preferredDate) {
        const hasDateKeyword = dateKeywords.some(keyword => lowerMsg.includes(keyword));
        if (hasDateKeyword && msg.length < 80) {
          leadData.preferredDate = msg;
        }
      }
    }
  }
  
  // Set location from ZIP (and determine city from ZIP if not already found)
  if (leadData.zip) {
    if (!leadData.location) {
      leadData.location = leadData.zip;
    }
    
    const zipToCityMap = {
      '34746': 'Kissimmee', '34741': 'Kissimmee', '34743': 'Kissimmee', '34744': 'Kissimmee',
      '34745': 'Kissimmee', '34747': 'Kissimmee', '34758': 'Davenport', '34759': 'Intercession City',
      '34740': 'Kissimmee', '34742': 'Kissimmee', '34769': 'St. Cloud', '34771': 'St. Cloud',
      '34772': 'St. Cloud', '34773': 'St. Cloud',
      '32801': 'Orlando', '32802': 'Orlando', '32803': 'Orlando', '32804': 'Orlando',
      '32805': 'Orlando', '32806': 'Orlando', '32807': 'Orlando', '32808': 'Orlando',
      '32809': 'Orlando', '32810': 'Orlando', '32811': 'Orlando', '32812': 'Orlando',
      '32814': 'Orlando', '32816': 'Orlando', '32817': 'Orlando', '32818': 'Orlando',
      '32819': 'Orlando', '32820': 'Orlando', '32821': 'Orlando', '32822': 'Orlando',
      '32824': 'Orlando', '32825': 'Orlando', '32826': 'Orlando', '32827': 'Orlando',
      '32828': 'Orlando', '32829': 'Orlando', '32830': 'Orlando', '32831': 'Orlando',
      '32832': 'Orlando', '32833': 'Orlando', '32834': 'Orlando', '32835': 'Orlando',
      '32836': 'Orlando', '32837': 'Orlando', '32839': 'Orlando',
      '32789': 'Winter Park', '32790': 'Winter Park', '32792': 'Winter Park',
      '32793': 'Winter Park', '32794': 'Winter Park',
      '32703': 'Apopka', '32704': 'Apopka', '32712': 'Apopka',
      '34761': 'Ocoee', '34760': 'Ocoee',
      '34777': 'Winter Garden', '34778': 'Winter Garden', '34787': 'Winter Garden',
      '34711': 'Clermont', '34714': 'Clermont', '34715': 'Clermont',
      '33801': 'Lakeland', '33803': 'Lakeland', '33805': 'Lakeland', '33809': 'Lakeland',
      '33810': 'Lakeland', '33811': 'Lakeland', '33813': 'Lakeland',
      '33844': 'Haines City', '33845': 'Haines City', '33846': 'Haines City'
    };
    
    if (!leadData.city) {
      leadData.city = zipToCityMap[leadData.zip] || 'Central Florida';
    }
  }
  
  return leadData;
}

// Check if we have complete lead data
function isLeadComplete(leadData) {
  const hasFullName = leadData.firstName && 
                      leadData.lastName && 
                      leadData.firstName.length >= 2 && 
                      leadData.lastName.length >= 2;
  
  const hasPhone = leadData.phone && leadData.phone.length >= 10;
  const hasService = leadData.service && leadData.service.trim().length > 0;
  const hasLocation = (leadData.zip && leadData.zip.length === 5) || 
                      (leadData.city && leadData.city.length >= 3);
  
  console.log('🔍 Checking completeness:', {
    hasFullName,
    firstName: leadData.firstName,
    lastName: leadData.lastName,
    hasPhone,
    hasService,
    hasLocation,
    city: leadData.city,
    zip: leadData.zip,
    preferredDate: leadData.preferredDate
  });
  
  return hasFullName && hasPhone && hasService && hasLocation;
}

// Convert relative dates to MM/DD/YY format
function normalizeDate(dateStr) {
  if (!dateStr) return 'Not specified';
  
  const now = new Date();
  const lower = dateStr.toLowerCase().trim();
  let target = null;
  
  // Already in MM/DD/YY format?
  const fmtMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (fmtMatch) {
    // Extract time if present
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
    const timePart = timeMatch ? ` ${timeMatch[0]}` : '';
    return `${fmtMatch[0]}${timePart}`;
  }
  
  const dayMap = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 
                   'thursday': 4, 'friday': 5, 'saturday': 6 };
  
  if (lower.includes('today')) {
    target = new Date(now);
  } else if (lower.includes('tomorrow')) {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
  } else if (lower.includes('asap') || lower.includes('soon')) {
    return 'ASAP';
  } else {
    // Check for day names
    for (const [day, num] of Object.entries(dayMap)) {
      if (lower.includes(day)) {
        target = new Date(now);
        let diff = num - now.getDay();
        if (diff <= 0) diff += 7;
        if (lower.includes('next')) diff += 7;
        target.setDate(target.getDate() + diff);
        break;
      }
    }
  }
  
  if (!target) return dateStr; // Return as-is if can't parse
  
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  const yy = String(target.getFullYear()).slice(-2);
  
  // Extract time if present
  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  let timePart = '';
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    timePart = ` ${String(hours).padStart(2, '0')}:${minutes}`;
  }
  
  return `${mm}/${dd}/${yy}${timePart}`;
}

// Track sent leads to prevent duplicates (in-memory, resets on restart)
const sentLeads = new Set();

// Check if this is the final summary message from assistant
function isFinalSummary(assistantMessage, leadData) {
  const msg = assistantMessage.toLowerCase();
  
  // The final message should contain the customer's phone number (as confirmation/summary)
  const hasPhone = leadData.phone && msg.includes(leadData.phone.slice(-4));
  
  // OR the final message contains closing phrases
  const closingPhrases = [
    'reach out', 'contact you', 'will be in touch', 'get back to you',
    'call you', 'confirm the appointment', 'confirm your appointment',
    'we\'ll be', 'someone will', 'our team will', 'shortly',
    'thank you for choosing', 'thanks for choosing',
    'here\'s what i have', 'here is what i have', 'to summarize',
    'to confirm', 'just to recap'
  ];
  
  const hasClosingPhrase = closingPhrases.some(phrase => msg.includes(phrase));
  
  // Must have EITHER phone in summary OR a closing phrase
  // AND the message should be long enough to be a summary (not a quick question)
  const isLongEnough = assistantMessage.length > 100;
  
  return (hasPhone || hasClosingPhrase) && isLongEnough;
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
        first_name: leadData.firstName || leadData.name?.split(' ')[0] || '',
        last_name: leadData.lastName || leadData.name?.split(' ').slice(1).join(' ') || '',
        phone: leadData.phone,
        city: leadData.city || 'Not specified',
        zip: leadData.zip || 'Not specified',
        service_description: leadData.service,
        preferred_date: normalizeDate(leadData.preferredDate),
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
   ✓ Customer FULL name? (BOTH first AND last name - REQUIRED!)
   ✓ Phone number?
   ✓ Location? (city OR ZIP code - at least one REQUIRED)
   ✓ Preferred date/timeframe?

YOUR CONVERSATION FLOW:
Step 1: Greet warmly (only on first message)
Step 2: Ask what service they need
Step 3: Once you know the service, ask for their location. Say: "What city are you in, or what's your ZIP code?" Accept EITHER city name OR ZIP code (or both).
Step 4: Once you know location, ask for their FULL NAME (first and last name)
Step 5: Once you know FULL name, ask for their phone number
Step 6: Once you know phone, ask about preferred date/timeframe
Step 7: When you have ALL information, summarize it back and thank them

DATE FORMAT RULES:
- ALWAYS convert dates to MM/DD/YY format (e.g., 02/18/26, not "tomorrow" or "next Monday")
- ALWAYS convert times to HH:MM 24-hour format (e.g., 10:00, 14:30)
- Use today's date to calculate: "tomorrow" → actual date, "next Monday" → actual date
- In your summary, write dates like: "Preferred time: 02/18/26 at 10:00"
- NEVER use relative words like "tomorrow", "next week", "this Saturday" in your summary

CRITICAL NAME REQUIREMENTS:
- You MUST collect BOTH first name AND last name
- If customer gives only first name (e.g. "John"), respond: "Thank you John! And what's your last name?"
- If customer gives only last name, ask for first name
- Accept names in ANY format: "john smith", "JOHN SMITH", "John Smith" - all are valid
- DO NOT proceed to phone number until you have BOTH names

LOCATION REQUIREMENTS:
- Accept EITHER city name OR ZIP code (or both)
- Examples: "Orlando", "32801", "Orlando 32801", "I'm in Kissimmee"

IMPORTANT:
- Ask ONE question at a time
- Reference information they already gave you to show you remember
- Be conversational and friendly
- Keep responses SHORT (2-3 sentences maximum)

SERVICES WE OFFER:
Plumbing, electrical work, drywall repair, painting, tile installation, carpentry, pressure washing, deck repairs, door/window installation, furniture assembly, general handyman services.

Remember: 
- You have the full conversation history - USE IT!
- NEVER proceed without BOTH first and last name!
- Accept names in any capitalization format!
- Accept EITHER city OR ZIP code for location!`
      },
      ...history,
      { role: "user", content: message }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: messages,
      temperature: 0.3,
      max_completion_tokens: 200
    });

    const assistantMessage = response.choices[0].message.content;
    
    const updatedHistory = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: assistantMessage }
    ];
    
    const leadData = extractLeadData(updatedHistory);
    
    console.log('📊 Extracted lead data:', leadData);
    console.log('✅ Complete?', isLeadComplete(leadData));
    
    // Send lead only once: when complete + final summary + not already sent
    if (isLeadComplete(leadData)) {
      const leadKey = `${leadData.phone}-${leadData.firstName}-${leadData.lastName}`;
      const alreadySent = sentLeads.has(leadKey);
      const finalSummary = isFinalSummary(assistantMessage, leadData);
      
      console.log('🔎 Send check:', { finalSummary, alreadySent, leadKey });
      console.log('🔎 Assistant msg length:', assistantMessage.length);
      console.log('🔎 Assistant msg:', assistantMessage.substring(0, 200));
      
      if (finalSummary && !alreadySent) {
        console.log('🚀 Sending complete lead to n8n...');
        const sent = await sendLeadToN8n(leadData, updatedHistory);
        if (sent) {
          sentLeads.add(leadKey);
          console.log('✅ Lead marked as sent:', leadKey);
        }
      } else if (alreadySent) {
        console.log('⏭️ Skipped: lead already sent for', leadKey);
      } else {
        console.log('⏭️ Skipped: not final summary yet');
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
