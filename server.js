if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat);
} else {
  initChat();
}

function initChat() {
  const API_URL = "https://shhs-chat-backend.onrender.com/chat";
  
  let sessionId = localStorage.getItem("shhs_chat_session");
  if (!sessionId) {
    sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("shhs_chat_session", sessionId);
  }
  
  let conversationHistory = [];
  try {
    const saved = localStorage.getItem("shhs_chat_history");
    if (saved) {
      conversationHistory = JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load history:", e);
  }
  
  const btn = document.createElement("button");
  btn.innerText = "💬 Chat";
  btn.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:999999;padding:12px 20px;background:#6366f1;color:#fff;border:none;border-radius:50px;font-size:16px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-weight:600;transition:transform 0.2s;";
  
  btn.onmouseenter = function() { btn.style.transform = "scale(1.05)"; };
  btn.onmouseleave = function() { btn.style.transform = "scale(1)"; };
  
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;right:20px;bottom:80px;z-index:999999;width:380px;max-width:calc(100vw - 40px);height:550px;background:#fff;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,0.15);display:none;flex-direction:column;";
  
  box.innerHTML = '<div style="padding:16px;background:#6366f1;color:#fff;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-weight:600;font-size:16px;">Skillful Hands</div><div style="font-size:12px;opacity:0.9;">Usually replies instantly</div></div><div style="display:flex;gap:8px;align-items:center;"><button id="shhsReset" title="Start new conversation" style="border:none;background:transparent;color:#fff;font-size:18px;cursor:pointer;padding:4px;opacity:0.8;">🔄</button><button id="shhsClose" style="border:none;background:transparent;color:#fff;font-size:24px;cursor:pointer;padding:0;width:28px;height:28px;">×</button></div></div><div id="shhsMsgs" style="padding:16px;flex:1;overflow:auto;background:#f9fafb;"></div><form id="shhsForm" style="display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff;"><input id="shhsInput" placeholder="Type your message..." style="flex:1;padding:10px 14px;border:1px solid #e5e7eb;border-radius:20px;outline:none;font-size:14px;" /><button type="submit" style="padding:10px 16px;border:none;border-radius:20px;background:#6366f1;color:#fff;cursor:pointer;font-weight:600;">Send</button></form>';
  
  document.body.appendChild(btn);
  document.body.appendChild(box);
  
  const msgs = box.querySelector("#shhsMsgs");
  const form = box.querySelector("#shhsForm");
  const input = box.querySelector("#shhsInput");
  const closeBtn = box.querySelector("#shhsClose");
  const resetBtn = box.querySelector("#shhsReset");
  const sendBtn = form.querySelector('button[type="submit"]');
  
  function restoreHistory() {
    msgs.innerHTML = "";
    if (conversationHistory.length === 0) {
      addMsg("Hi! 👋 I'm here to help with any handyman services. What can we help you with today?", "bot");
    } else {
      conversationHistory.forEach(function(msg) {
        addMsg(msg.content, msg.role === "user" ? "user" : "bot");
      });
    }
  }
  
  function addMsg(text, who) {
    const p = document.createElement("div");
    p.style.cssText = "margin:12px 0;display:flex;" + (who === "user" ? "justify-content:flex-end;" : "");
    
    const bubble = document.createElement("div");
    bubble.innerText = text;
    bubble.style.cssText = "max-width:75%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;" + (who === "user" ? "background:#6366f1;color:#fff;border-bottom-right-radius:4px;" : "background:#fff;color:#111;border:1px solid #e5e7eb;border-bottom-left-radius:4px;");
    
    p.appendChild(bubble);
    msgs.appendChild(p);
    msgs.scrollTop = msgs.scrollHeight;
  }
  
  function saveHistory() {
    try {
      localStorage.setItem("shhs_chat_history", JSON.stringify(conversationHistory));
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  }
  
  async function send(text) {
    addMsg(text, "user");
    
    conversationHistory.push({ role: "user", content: text });
    saveHistory();
    
    input.value = "";
    input.disabled = true;
    sendBtn.disabled = true;
    
    const typingDiv = document.createElement("div");
    typingDiv.id = "typing";
    typingDiv.style.cssText = "margin:12px 0;";
    typingDiv.innerHTML = '<div style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;display:inline-block;"><span>●●●</span></div>';
    msgs.appendChild(typingDiv);
    msgs.scrollTop = msgs.scrollHeight;
    
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text,
          history: conversationHistory.slice(-10)
        })
      });
      
      const data = await res.json();
      
      const typing = document.getElementById("typing");
      if (typing) typing.remove();
      
      if (!res.ok) throw new Error(data.error || "Request failed");
      
      const reply = data.reply || "Sorry, I didn't get that.";
      
      addMsg(reply, "bot");
      
      conversationHistory.push({ role: "assistant", content: reply });
      
      if (conversationHistory.length > 30) {
        conversationHistory = conversationHistory.slice(-30);
      }
      
      saveHistory();
      
    } catch (e) {
      const typing = document.getElementById("typing");
      if (typing) typing.remove();
      addMsg("Sorry, I'm having trouble. Please try again or call us directly.", "bot");
      console.error("Chat error:", e);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }
  
  btn.onclick = function() {
    const isHidden = box.style.display === "none";
    box.style.display = isHidden ? "flex" : "none";
    if (isHidden) {
      restoreHistory();
      input.focus();
    }
  };
  
  closeBtn.onclick = function() {
    box.style.display = "none";
  };
  
  resetBtn.onclick = function() {
    if (confirm("Start a new conversation? This will clear the current chat.")) {
      conversationHistory = [];
      localStorage.removeItem("shhs_chat_history");
      restoreHistory();
    }
  };
  
  form.onsubmit = function(e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    send(text);
  };
}