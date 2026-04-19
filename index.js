const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const express = require('express');
const app = express();

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
const AD_CHANNEL_ID = '1482874761951576228';
const INFO_CHANNEL_ID = '1484639863411183636';
const WELCOME_CHANNEL_ID = '1482874761951576228';
const MEMBER_ROLE_ID = '1482883802186514615'; // أيدي رتبة Member اللي بعته

// --- قوائم الحماية ---
const bannedWords = ['free nitro', 'discord.gift', 'steam community', 'gift for you']; 
const swearWords = ['شتمه1', 'شتمه2']; // ضيف الشتايم هنا

const warningCount = new Map();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  updateLiveInfo();
  startAds();
});

// --- 1. خاصية الـ Auto Role + الترحيب ---
client.on('guildMemberAdd', async (member) => {
  // إضافة الرتبة تلقائياً
  try {
    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
    if (role) await member.roles.add(role);
    console.log(`تم إعطاء رتبة member لـ ${member.user.tag}`);
  } catch (err) {
    console.error('فشل في إضافة الرتبة، تأكد أن رتبة البوت أعلى من رتبة Member');
  }

  // إرسال رسالة الترحيب
  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    welcomeChannel.send(`${member}!
Welcome to the ****𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂**** 👑!
تم إعطاؤك رتبة <@&${MEMBER_ROLE_ID}> تلقائياً.
============================
● <#1482874761951576228> الدردشة
● <#1482935928963203142> تحميل الباكات
● <#1484639863411183636> القوانين والمعلومات
============================
@everyone`);
  }
  updateLiveInfo();
});

client.on('guildMemberRemove', () => updateLiveInfo());

// --- 2. نظام الحماية والأوامر ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.toLowerCase();

  // منع الشتائم (Timeout ثم Kick)
  if (swearWords.some(word => content.includes(word))) {
    await message.delete().catch(() => {});
    const userId = message.author.id;
    const warnings = (warningCount.get(userId) || 0) + 1;
    warningCount.set(userId, warnings);

    if (warnings === 1) {
      await message.member.timeout(5 * 60 * 1000, 'السب والقذف').catch(() => {});
      return message.channel.send(`⚠️ ${message.author}، ممنوع الشتائم! (ميوت 5 دقايق)`);
    } else {
      await message.member.kick('تكرار الشتائم').catch(() => {});
      warningCount.delete(userId);
      return message.channel.send(`🚫 تم طرد ${message.author} بسبب التكرار.`);
    }
  }

  // منع الروابط
  const linkRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b/;
  if (linkRegExp.test(message.content) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.delete().catch(() => {});
    return message.channel.send(`⚠️ ممنوع الروابط!`).then(m => setTimeout(() => m.delete(), 3000));
  }

  // أوامر الإدارة
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'clear') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[0]);
    if (!isNaN(amount)) await message.channel.bulkDelete(amount + 1).catch(() => {});
  }
});

// --- وظائف مساعدة (إعلانات ومعلومات) ---
function startAds() {
  const channel = client.channels.cache.get(AD_CHANNEL_ID);
  if (!channel) return;
  setInterval(() => { channel.send("Advertisement 1: Custom Totems/Skins! Ask <@1480631975697055754>"); }, 30 * 60 * 1000);
}

async function updateLiveInfo() {
  const guild = client.guilds.cache.first();
  const channel = client.channels.cache.get(INFO_CHANNEL_ID);
  if (!channel || !guild) return;
  const info = `**╭───〔 📊 SERVER LIVE INFO 〕───╮**\n\n**🏠 Name:** \`${guild.name}\`\n**👑 Owner:** <@${guild.ownerId}>\n**👥 Members:** \`${guild.memberCount}\`\n\n**╰───────────────────────╯**`;
  const messages = await channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id);
  if (botMsg) await botMsg.edit(info); else await channel.send(info);
}

client.login(process.env.TOKEN);
