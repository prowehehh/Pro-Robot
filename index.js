const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

// تشغيل السيرفر لضمان بقاء البوت متصلاً
app.get('/', (req, res) => res.send('Pro Robot is Online! 🚀'));
app.listen(3000, () => console.log('Server is ready!'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- إعدادات الأيدي (IDs) ---
const WELCOME_CHANNEL_ID = '1482881348204101768';
const AD_CHANNEL_ID = '1482874761951576228';
const INFO_CHANNEL_ID = '1484639863411183636';
const MEMBER_ROLE_ID = '1482883802186514615';
const XBOX_CHANNEL_ID = '1482937156258496733'; // قناة تغيير الاسم

// متغيرات الأنظمة
let ad1Msg = null, ad2Msg = null, ad3Msg = null;
let originalNames = new Map(); // لحفظ الأسماء الأصلية

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('/help', { type: 3 }); // Watching /help
  
  updateLiveInfo();
  startAds();
});

// --- نظام الاسم المؤقت (Xbox Name) مع مسح الرسالة ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // 1. إذا كتب في قناة الـ Xbox
  if (message.channel.id === XBOX_CHANNEL_ID) {
    try {
      if (!originalNames.has(message.author.id)) {
        originalNames.set(message.author.id, message.member.displayName);
      }

      const newXboxName = message.content;
      await message.member.setNickname(newXboxName);
      
      const reply = await message.reply(`✅ تم تفعيل اسم الـ Xbox: **${newXboxName}** (سيتم مسح رسالتك الآن)`);
      
      // مسح رسالة العضو ورد البوت بعد 5 ثواني
      setTimeout(() => {
        message.delete().catch(() => {});
        reply.delete().catch(() => {});
      }, 5000);
      
    } catch (e) {
      console.log("Error: " + e.message);
    }
    return; 
  }

  // 2. إذا كتب في أي قناة تانية نرجع اسمه لأصله
  if (originalNames.has(message.author.id)) {
    try {
      const oldName = originalNames.get(message.author.id);
      await message.member.setNickname(oldName);
      originalNames.delete(message.author.id);
    } catch (e) {}
  }
});

// --- نظام الترحيب ---
client.on('guildMemberAdd', async (member) => {
  try {
    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
    if (role) await member.roles.add(role);
  } catch (e) {}

  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    const welcomeMsg = `${member}!
Welcome to the **𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂** 👑!
============================
● https://discord.com/channels/1482874760940486699/1482874761951576228 to chat with all in this server.
● https://discord.com/channels/1482874760940486699/1482936392479936645 to see all news about packs.
● https://discord.com/channels/1482874760940486699/1482935928963203142 to download all packs.
● https://discord.com/channels/1482874760940486699/1484268268373020702 to download skin packs.
● https://discord.com/channels/1482874760940486699/1484268542458331356 to download worlds.
● Discover more in this server.
Thank you for joining our server ❤️!
--------------------------------------------
Go to read the rules and information:
● https://discord.com/channels/1482874760940486699/1482901664951304222 ● https://discord.com/channels/1482874760940486699/1484639863411183636
============================
@everyone`;
    welcomeChannel.send(welcomeMsg);
  }
});

// --- نظام الإعلانات الذكي ---
function startAds() {
  const channel = client.channels.cache.get(AD_CHANNEL_ID);
  if (!channel) return;

  // إعلان 1: كل 30 دقيقة
  setInterval(async () => {
    if (ad1Msg) await ad1Msg.delete().catch(() => {});
    const ad1 = `If you want to make totem about onwe skin or picture about onwe skin.
Ask <@1480631975697055754>
https://discord.com/channels/1482874760940486699/1484397891693969601`;
    ad1Msg = await channel.send(ad1);
    setTimeout(() => { if(ad1Msg) ad1Msg.delete().catch(() => {}); ad1Msg = null; }, 15 * 60 * 1000);
  }, 30 * 60 * 1000);

  // إعلان 2: كل ساعتين
  setInterval(async () => {
    if (ad2Msg) await ad2Msg.delete().catch(() => {});
    const ad2 = `All the news about the server is there
https://discord.com/channels/1482874760940486699/1482934834899714048`;
    ad2Msg = await channel.send(ad2);
    setTimeout(() => { if(ad2Msg) ad2Msg.delete().catch(() => {}); ad2Msg = null; }, 15 * 60 * 1000);
  }, 120 * 60 * 1000);

  // إعلان 3: كل ساعة
  setInterval(async () => {
    if (ad3Msg) await ad3Msg.delete().catch(() => {});
    const ad3 = `If you need to edit or make any texture pack.
Click on here
https://discord.com/channels/1482874760940486699/1482936392479936645 to request!`;
    ad3Msg = await channel.send(ad3);
    setTimeout(() => { if(ad3Msg) ad3Msg.delete().catch(() => {}); ad3Msg = null; }, 15 * 60 * 1000);
  }, 60 * 60 * 1000);
}

// --- تحديث معلومات السيرفر المباشرة ---
async function updateLiveInfo(guild) {
  if (!guild) guild = client.guilds.cache.first();
  const channel = client.channels.cache.get(INFO_CHANNEL_ID);
  if (!channel || !guild) return;
  const createdAt = guild.createdAt.toLocaleDateString('en-GB'); 
  const info = `@everyone\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Onwer: <@1134146616857731173>\n• Robot: <@1495419259147386920>\n• Server from: Egypt\n• Date Server: ${createdAt}\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [Member, Ultimate, YouTube, Helper, Vip]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`;
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit(info); else await channel.send(info);
  } catch (e) {}
}

client.login(process.env.TOKEN);
