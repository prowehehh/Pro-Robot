const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Pro Robot Ultra Security Online! 🛡️'));
app.listen(3000);

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

// قائمة الحماية (الكلمات الممنوعة)
const badWords = ['شتيمة1', 'شتيمة2', 'كس', 'شرموط', 'fuck', 'ass', 'bitch']; 

let ad1Msg = null, ad2Msg = null, ad3Msg = null;

client.on('ready', async () => {
  console.log(`🛡️ ${client.user.tag} Is Ready!`);
  client.user.setActivity('/help', { type: 3 }); 

  // تسجيل الأوامر الأساسية
  const commands = [
    new SlashCommandBuilder().setName('clear').setDescription('مسح الرسائل').addIntegerOption(o => o.setName('amount').setDescription('العدد').setRequired(true)),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) {}

  updateLiveInfo();
  startAds();
});

// --- نظام الحماية (الشتائم والروابط) ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.toLowerCase();
  const hasLink = /(https?:\/\/[^\s]+)/g.test(content);
  const hasBadWord = badWords.some(word => content.includes(word));

  if ((hasLink || hasBadWord) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    if (message.channel.id !== AD_CHANNEL_ID) { // استثناء قناة الإعلانات من منع الروابط
        await message.delete().catch(() => {});
        const warning = await message.channel.send(`⚠️ ممنوع الروابط أو الكلمات السيئة يا ${message.author}!`);
        setTimeout(() => warning.delete().catch(() => {}), 3000);
    }
  }
});

// --- نظام الترحيب و الرتب التلقائية ---
client.on('guildMemberAdd', async (member) => {
  try {
    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
    if (role) await member.roles.add(role);
  } catch (e) {}

  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    welcomeChannel.send(`${member}!\nWelcome to the **𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂** 👑!\nEnjoy your stay! @everyone`);
  }
  updateLiveInfo(member.guild);
});

// --- نظام الإعلانات المحدث (نصوصك الخاصة) ---
function startAds() {
  const channel = client.channels.cache.get(AD_CHANNEL_ID);
  if (!channel) return;

  // الإعلان الأول (كل 30 دقيقة - يمسح بعد 15 دقيقة)
  setInterval(async () => {
    if (ad1Msg) await ad1Msg.delete().catch(() => {});
    const text1 = `If you want to make totem about onwe skin or picture about onwe skin.
Ask <@1480631975697055754>

You will receive your request in there
https://discord.com/channels/1482874760940486699/1484397891693969601`;
    ad1Msg = await channel.send(text1);
    setTimeout(() => { if (ad1Msg) ad1Msg.delete().catch(() => {}); ad1Msg = null; }, 15 * 60 * 1000);
  }, 30 * 60 * 1000);

  // الإعلان الثاني (كل ساعتين - يمسح بعد 15 دقيقة)
  setInterval(async () => {
    if (ad2Msg) await ad2Msg.delete().catch(() => {});
    const text2 = `All the news about the server is there
https://discord.com/channels/1482874760940486699/1482934834899714048`;
    ad2Msg = await channel.send(text2);
    setTimeout(() => { if (ad2Msg) ad2Msg.delete().catch(() => {}); ad2Msg = null; }, 15 * 60 * 1000);
  }, 120 * 60 * 1000);

  // الإعلان الثالث (كل ساعة - يمسح بعد 15 دقيقة)
  setInterval(async () => {
    if (ad3Msg) await ad3Msg.delete().catch(() => {});
    const text3 = `If you need to edit or make any texture pack.
You can click on here
https://discord.com/channels/1482874760940486699/1482936392479936645 to request!`;
    ad3Msg = await channel.send(text3);
    setTimeout(() => { if (ad3Msg) ad3Msg.delete().catch(() => {}); ad3Msg = null; }, 15 * 60 * 1000);
  }, 60 * 60 * 1000);
}

// --- Live Info ---
async function updateLiveInfo(guild) {
  if (!guild) guild = client.guilds.cache.first();
  const channel = client.channels.cache.get(INFO_CHANNEL_ID);
  if (!channel || !guild) return;
  const info = `🛡️ **Server Status**\n• Members: ${guild.memberCount}\n• Owner: <@${guild.ownerId}>\n• Status: Protected 🔒`;
  try {
    const msgs = await channel.messages.fetch({ limit: 5 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit(info); else await channel.send(info);
  } catch (e) {}
}

client.login(process.env.TOKEN);
