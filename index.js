const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Game Server with Smart Matchmaking & Bots is Running!\n');
});

const wss = new WebSocketServer({ server });

// قائمة انتظار غرف اللعب حسب قيمة النقاط (مثل: 2 نقطة، 5 نقاط... إلخ)
const matchmakingQueues = {}; 

// أسماء وهمية للبوتات لتبدو كلاعبين حقيقيين
const botNames = ['أحمد_VIP', 'سارة_99', 'الأسد_2026', 'الملك_طرنيب', 'فارس_الجنوب', 'نور_الهدى'];

wss.on('connection', (ws) => {
  let currentPlayer = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // 1. طلب البحث عن مباراة (مثلاً بـ 2 نقطة)
      if (message.type === 'FIND_MATCH') {
        const entryFee = message.entryFee || 2; // قيمة الرهان (مثلاً 2 نقطة)
        currentPlayer = {
          ws: ws,
          id: message.playerId,
          name: message.playerName,
          entryFee: entryFee
        };

        if (!matchmakingQueues[entryFee]) {
          matchmakingQueues[entryFee] = [];
        }

        matchmakingQueues[entryFee].push(currentPlayer);

        // محاولة جمع 4 لاعبين حقيقيين أو إكمالهم بـ "بوتات" بعد 3 ثوانٍ
        setTimeout(() => {
          checkAndStartGame(entryFee);
        }, 3000);
      }

      // 2. استقبال حركات اللعب والنقاط ومشاركتها
      if (message.type === 'GAME_ACTION' || message.type === 'UPDATE_POINTS') {
        broadcastToRoom(message);
      }

    } catch (e) {
      console.error('Error parsing message', e);
    }
  });

  ws.on('close', () => {
    // في حال خرج اللاعب أثناء اللعب، يتحول تلقائياً إلى بوت ليستكمل الدور
    if (currentPlayer) {
      broadcastToRoom({
        type: 'PLAYER_BECOME_BOT',
        playerId: currentPlayer.id,
        playerName: currentPlayer.name
      });
    }
  });
});

// دالة فحص الغرفة وإكمالها ببوتات
function checkAndStartGame(entryFee) {
  const queue = matchmakingQueues[entryFee];
  if (!queue || queue.length === 0) return;

  // أخذ اللاعبين الموجودين في قائمة الانتظار
  const roomPlayers = queue.splice(0, 4);

  // إذا كان عدد اللاعبين أقل من 4 (مثلاً لاعب واحد فقط بـ 2 نقطة)، نكمل الباقي ببوتات
  while (roomPlayers.length < 4) {
    const randomName = botNames[Math.floor(Math.random() * botNames.length)];
    roomPlayers.push({
      id: 'bot_' + Math.floor(Math.random() * 10000),
      name: randomName,
      isBot: true,
      entryFee: entryFee
    });
  }

  // إرسال تنبيه لبدء اللعبة بجميع اللاعبين والبوتات
  const gameRoomData = {
    type: 'START_GAME',
    entryFee: entryFee,
    players: roomPlayers.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot || false
    }))
  };

  roomPlayers.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(gameRoomData));
    }
  });
}

function broadcastToRoom(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

const PORT = process.env.PORT || 8089;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
