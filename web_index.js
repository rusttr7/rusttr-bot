const express = require('express');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web_ui')));

// Discord Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// AI Setup
if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Hata: .env dosyasında GEMINI_API_KEY bulunamadı!');
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

const systemInstruction = `
Sen bir Discord Sunucu Yöneticisi AI'sın. 
Kullanıcının doğal dilde verdiği komutları anlayıp sadece JSON formatında bir işlem listesi döndürmelisin. 
Döndüreceğin yanıt sadece geçerli bir JSON DİZİSİ (Array) olmalıdır, başında veya sonunda markdown (örnek: \`\`\`json) olmamalıdır!
Aşağıdaki işlem türlerinden (action) bir veya birkaçını döndürebilirsin:

1. {"action": "CREATE_CHANNEL", "name": "kanal-adi", "type": "text" veya "voice"}
2. {"action": "DELETE_CHANNEL", "name": "kanal-adi"}
3. {"action": "CREATE_ROLE", "name": "rol-adi", "color": "#RenkKodu", "permissions": ["Admin", "Mod", "Normal"]}
4. {"action": "GIVE_ROLE", "user": "kullanici-adi", "role": "rol-adi"}
5. {"action": "SEND_MESSAGE", "channel": "kanal-adi", "content": "mesaj icerigi"}

Örnek Yanıt:
[
  {"action": "CREATE_CHANNEL", "name": "sohbet", "type": "text"},
  {"action": "CREATE_ROLE", "name": "VIP", "color": "#ff00ff", "permissions": ["Normal"]}
]

Eğer kullanıcının isteği yukarıdakilerle yapılamıyorsa boş dizi [] döndür.
SADECE JSON DÖNDÜR, BAŞKA METİN YAZMA.
`;

app.post('/api/chat', async (req, res) => {
    const userInput = req.body.message;
    if (!userInput) return res.status(400).json({ success: false, error: "Mesaj boş olamaz." });

    const guild = client.guilds.cache.first();
    if (!guild) return res.status(500).json({ success: false, error: "Bot sunucuda bulunamadı." });

    try {
        const prompt = `${systemInstruction}\n\nKullanıcı İsteği: "${userInput}"`;
        const result = await model.generateContent(prompt);
        let responseText = result.response.text().trim();
        
        if (responseText.startsWith('\`\`\`json')) {
            responseText = responseText.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '');
        } else if (responseText.startsWith('\`\`\`')) {
            responseText = responseText.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
        }

        const actions = JSON.parse(responseText);

        if (!Array.isArray(actions) || actions.length === 0) {
            return res.json({ success: false, error: "Asistan bu işlemi nasıl yapacağını bulamadı." });
        }

        let executedLog = "";

        for (const action of actions) {
            switch (action.action) {
                case 'CREATE_CHANNEL':
                    await guild.channels.create({
                        name: action.name,
                        type: action.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText
                    });
                    executedLog += `📡 ${action.name} adlı ${action.type === 'voice' ? 'ses' : 'metin'} kanalı oluşturuldu.<br>`;
                    break;
                case 'DELETE_CHANNEL':
                    const channelToDelete = guild.channels.cache.find(c => c.name === action.name);
                    if (channelToDelete) {
                        await channelToDelete.delete();
                        executedLog += `🗑️ ${action.name} adlı kanal silindi.<br>`;
                    }
                    break;
                case 'CREATE_ROLE':
                    let perms = [];
                    if (action.permissions && action.permissions.includes("Admin")) {
                        perms.push(PermissionsBitField.Flags.Administrator);
                    }
                    await guild.roles.create({
                        name: action.name,
                        color: action.color || '#000000',
                        permissions: perms
                    });
                    executedLog += `🛡️ ${action.name} adlı rol oluşturuldu.<br>`;
                    break;
                case 'GIVE_ROLE':
                    await guild.members.fetch();
                    const role = guild.roles.cache.find(r => r.name.toLowerCase() === action.role.toLowerCase());
                    const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(action.user.toLowerCase()) || (m.nickname && m.nickname.toLowerCase().includes(action.user.toLowerCase())));
                    if (role && member) {
                        await member.roles.add(role);
                        executedLog += `👤 ${action.user} kullanıcısına ${action.role} rolü verildi.<br>`;
                    }
                    break;
                case 'SEND_MESSAGE':
                    const channelToSend = guild.channels.cache.find(c => c.name === action.channel);
                    if (channelToSend && channelToSend.isTextBased()) {
                        await channelToSend.send(action.content);
                        executedLog += `💬 ${action.channel} kanalına mesaj gönderildi.<br>`;
                    }
                    break;
            }
        }
        
        res.json({ success: true, reply: executedLog });

    } catch (error) {
        console.error("AI/Discord Hatası:", error);
        res.json({ success: false, error: "İşlem sırasında hata oluştu: " + error.message });
    }
});

let globalStats = {};

app.post('/api/update-stats', (req, res) => {
    try {
        globalStats = req.body;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: "Veri islenemedi." });
    }
});

app.get('/api/leaderboard', (req, res) => {
    res.json({ success: true, data: globalStats });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🌐 Web arayüzü başlatıldı: http://localhost:${PORT}`);
});

client.once('ready', () => {
    console.log(`✅ Discord Bot giriş yaptı: ${client.user.tag}`);
    
    // Canlı Tablo Güncelleyici
    setInterval(updateLiveLeaderboard, 15000); // 15 saniyede bir güncelle
});

async function updateLiveLeaderboard() {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    // Kanalı bul veya oluştur
    let channel = guild.channels.cache.find(c => c.name === '📊-canlı-tablo');
    if (!channel) {
        try {
            channel = await guild.channels.create({
                name: '📊-canlı-tablo',
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionsBitField.Flags.SendMessages], // Oyuncular yazamasın
                        allow: [PermissionsBitField.Flags.ViewChannel]
                    }
                ]
            });
        } catch (e) {
            console.error("Kanal oluşturulamadı", e);
            return;
        }
    }

    const players = Object.values(globalStats);
    if (players.length === 0) return;

    // Top 3'leri hesapla
    const topKills = [...players].sort((a,b) => b.Kills - a.Kills).slice(0, 3);
    const topDeaths = [...players].sort((a,b) => b.Deaths - a.Deaths).slice(0, 3);
    const topWood = [...players].sort((a,b) => b.WoodGathered - a.WoodGathered).slice(0, 3);
    const topStone = [...players].sort((a,b) => b.StoneGathered - a.StoneGathered).slice(0, 3);
    const topBarrels = [...players].sort((a,b) => b.BarrelsBroken - a.BarrelsBroken).slice(0, 3);
    const topMetal = [...players].sort((a,b) => (b.MetalGathered || 0) - (a.MetalGathered || 0)).slice(0, 3);
    const topScrap = [...players].sort((a,b) => (b.ScrapGathered || 0) - (a.ScrapGathered || 0)).slice(0, 3);
    const topHeadshots = [...players].sort((a,b) => (b.Headshots || 0) - (a.Headshots || 0)).slice(0, 3);
    const topAnimals = [...players].sort((a,b) => (b.AnimalsKilled || 0) - (a.AnimalsKilled || 0)).slice(0, 3);
    const topSleepers = [...players].sort((a,b) => (b.SleeperKills || 0) - (a.SleeperKills || 0)).slice(0, 3);
    const topSuicides = [...players].sort((a,b) => (b.Suicides || 0) - (a.Suicides || 0)).slice(0, 3);
    const longestKill = [...players].sort((a,b) => b.LongestKillDistance - a.LongestKillDistance)[0];

    const embed = new EmbedBuilder()
        .setTitle('🏆 RUSTTR CANLI İSTATİSTİKLER')
        .setColor('#e67e22') // Rust Turuncusu
        .setDescription('Sunucudaki güncel istatistikler (Her 15 saniyede bir güncellenir)')
        .addFields(
            { name: '⚔️ EN ÇOK ÖLDÜREN', value: topKills.map((p, i) => `${i+1}. ${p.Name} - ${p.Kills || 0} Leş`).join('\n') || 'Veri yok', inline: true },
            { name: '🎯 EN ÇOK KAFADAN VURAN', value: topHeadshots.map((p, i) => `${i+1}. ${p.Name} - ${p.Headshots || 0} HS`).join('\n') || 'Veri yok', inline: true },
            { name: '💀 EN ÇOK ÖLEN', value: topDeaths.map((p, i) => `${i+1}. ${p.Name} - ${p.Deaths || 0} Kez`).join('\n') || 'Veri yok', inline: true },
            
            { name: '🪓 EN ÇOK ODUN TOPLAYAN', value: topWood.map((p, i) => `${i+1}. ${p.Name} - ${p.WoodGathered || 0}`).join('\n') || 'Veri yok', inline: true },
            { name: '🪨 EN ÇOK TAŞ TOPLAYAN', value: topStone.map((p, i) => `${i+1}. ${p.Name} - ${p.StoneGathered || 0}`).join('\n') || 'Veri yok', inline: true },
            { name: '⛏️ EN ÇOK METAL TOPLAYAN', value: topMetal.map((p, i) => `${i+1}. ${p.Name} - ${p.MetalGathered || 0}`).join('\n') || 'Veri yok', inline: true },
            
            { name: '🛢️ EN ÇOK VARİL KIRAN', value: topBarrels.map((p, i) => `${i+1}. ${p.Name} - ${p.BarrelsBroken || 0} Kutu`).join('\n') || 'Veri yok', inline: true },
            { name: '⚙️ EN ÇOK HURDA BULAN', value: topScrap.map((p, i) => `${i+1}. ${p.Name} - ${p.ScrapGathered || 0} Scrap`).join('\n') || 'Veri yok', inline: true },
            { name: '🐻 EN ÇOK HAYVAN AVLAYAN', value: topAnimals.map((p, i) => `${i+1}. ${p.Name} - ${p.AnimalsKilled || 0} Hayvan`).join('\n') || 'Veri yok', inline: true },

            { name: '🩸 EN ACIMASIZ (Uyuyan Katili)', value: topSleepers.map((p, i) => `${i+1}. ${p.Name} - ${p.SleeperKills || 0} Leş`).join('\n') || 'Veri yok', inline: true },
            { name: '💥 EN ÇOK İNTİHAR EDEN', value: topSuicides.map((p, i) => `${i+1}. ${p.Name} - ${p.Suicides || 0} Kez`).join('\n') || 'Veri yok', inline: true },
            { name: '🔭 EN UZUN MESAFE ATIŞI', value: longestKill && longestKill.LongestKillDistance > 0 ? `${longestKill.Name} (${longestKill.LongestKillDistance}m)` : 'Veri yok', inline: true }
        )
        .setFooter({ text: 'Son Güncelleme' })
        .setTimestamp();

    // Kanaldaki son mesajı bul, eğer bizim botun mesajıysa editle, değilse sil yeni at
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id);

    if (botMsg) {
        await botMsg.edit({ embeds: [embed] });
    } else {
        await channel.send({ embeds: [embed] });
    }
}

// Yeni biri katıldığında Hoş Geldin mesajı at
client.on('guildMemberAdd', member => {
    const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === 'hoşgeldiniz' || ch.name === 'hosgeldiniz');
    if (!welcomeChannel) return;

    welcomeChannel.send(`🎉 Hoş geldin <@${member.user.id}>! **RUSTTR** topluluğuna katıldığın için çok mutluyuz. Kuralları okumayı unutma, iyi eğlenceler!`);
});

if (!process.env.BOT_TOKEN) {
    console.error('❌ Hata: .env dosyasında BOT_TOKEN bulunamadı!');
    process.exit(1);
}

console.log('⏳ Sistem başlatılıyor...');
client.login(process.env.BOT_TOKEN).catch(err => {
    console.error("Bağlantı hatası:", err.message);
});
