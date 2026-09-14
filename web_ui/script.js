const input = document.getElementById('command-input');
const sendBtn = document.getElementById('send-btn');
const chatHistory = document.getElementById('chat-history');

function addMessage(text, isUser = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isUser ? 'user' : 'ai'}`;
    
    msgDiv.innerHTML = `
        <div class="avatar">${isUser ? '👤' : '🤖'}</div>
        <div class="bubble">${text}</div>
    `;
    
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function addTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai typing';
    msgDiv.id = 'typing-indicator';
    
    msgDiv.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="bubble">
            <div class="typing-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        </div>
    `;
    
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addMessage(text, true);
    addTypingIndicator();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: text })
        });

        const data = await response.json();
        removeTypingIndicator();

        if (data.success) {
            addMessage(`✅ **İşlem Başarılı!**<br>${data.reply}`);
        } else {
            addMessage(`❌ **Hata:** ${data.error}`);
        }
    } catch (error) {
        removeTypingIndicator();
        addMessage(`❌ Sunucuya bağlanılamadı. Lütfen arka plandaki siyah ekranın (sunucu) açık olduğundan emin olun.`);
    }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
