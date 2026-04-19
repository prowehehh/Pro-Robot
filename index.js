const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

// تشغيل سيرفر ويب لضمان بقاء البوت متصلاً 24 ساعة
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
const MEMBER_ROLE_ID = '1482883802186514615';

let lastAdMessage = null;
const swearWords = ['شتمه1', 'شتمه2']; // ضيف الشتايم هنا
const warningCount = new Map();

// --- 1. تعريف أوامر السلاش (/) ---
const commands = [
  new SlashCommandBuilder()
    .setName('vote')
    .setDescription('عمل تصويت جديد')
    .addStringOption(option => option.setName('question').setDescription('سؤال التصويت').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('مسح الرسائل')
    .addIntegerOption(option => option.setName('amount').setDescription('عدد الرسائل').setRequired(true)),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('تحديث معلومات السيرفر يدوياً'),
].map(command => command.toJSON());

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // تسجيل أوامر السلاش في ديسكورد
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Successfully reloaded slash commands.');
  } catch (error) {
    console.error(error);
  }

  updateLiveInfo();
  startAds();
});

// --- 2. نظام الـ Auto Role والتحديث اللحظي للـ Live Info ---
client.on('guildMemberAdd', async (member) => {
  // إضافة الرتبة تلقائياً
  try {
    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
    if (role) await member.roles.add(role);
  } catch (e) {
    console.log("خطأ في إضافة الرتبة: تأكد أن رتبة البوت أعلى من رتبة Member");
  }

  // رسالة ترحيب سريعة
  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    welcomeChannel.send(`${member}! Welcome to **𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂** 👑!`);
  }
  
  updateLiveInfo(member.guild); // تحديث العدد فوراً
});

client.on('guildMemberRemove', (member) => {
  updateLiveInfo(member.guild); // تحديث العدد فوراً عند الخروج
});

// --- 3. دالة الـ Live Info بالشكل والزخرفة المطلوبة ---
async function updateLiveInfo(guild) {
  if (!guild) guild = client.guilds.cache.first();
  const channel = client.channels.cache.get(INFO_CHANNEL_ID);
  if (!channel || !guild) return;

  const createdAt = guild.createdAt.toLocaleDateString('en-GB'); 

  const infoContent = `@everyone
[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]
Information about server:-
• Onwer: <@1134146616857731173>
• Robot: <@1495419259147386920>
• Server from: Egypt
• Date Server: ${createdAt}
• Total Members: ${guild.memberCount}
• Ranks:
→ [Member, Ultimate, YouTube, Helper, Vip]
[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`;

  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id);

    if (botMsg) {
      await botMsg.edit(infoContent);
    } else {
      await channel.send(infoContent);
    }
  } catch (error) {
    console.error("Error updating live info:", error);
  }
}

// --- 4. التعامل مع أوامر السلاش (/) ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'vote') {
    const question = interaction.options.getString('question');
    const msg = await interaction.reply({ content: `**📊 تصويت جديد:**\n${question}`, fetchReply: true });
    await msg.react('✅'); await msg.react('❌');
  }

  if (interaction.commandName === 'clear') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({ content: 'لا تملك صلاحية مسح الرسائل!', ephemeral: true });
    }
    const amount = interaction.options.getInteger('amount');
    await interaction.channel.bulkDelete(amount);
    await interaction.reply({ content: `تم مسح ${amount} رسالة بنجاح.`, ephemeral: true });
  }

  if (interaction.commandName === 'info') {
    updateLiveInfo(interaction.guild);
    await interaction.reply({ content: 'تم تحديث المعلومات لحظياً!', ephemeral: true });
  }
});

// --- 5. حماية السيرفر (منع الشتائم والروابط) ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.toLowerCase();

  // منع الشتائم
  if (swearWords.some(word => content.includes(word))) {
    await message.delete().catch(() => {});
    const userId = message.author.id;
    const warnings = (warningCount.get(userId) || 0) + 1;
    warningCount.set(userId, warnings);

    if (warnings === 1) {
      await message.member.timeout(5 * 60 * 1000, 'السب والقذف').catch(() => {});
      return message.channel.send(`⚠️ ${message.author}، ممنوع الشتائم! (تم عمل ميوت 5 دقائق)`);
    } else {
      await message.member.kick('تكرار السب والقذف').catch(() => {});
      warningCount.delete(userId);
      return message.channel.send(`🚫 تم طرد ${message.author} لتكرار الشتائم.`);
    }
  }

  // منع الروابط لغير الإدارة
  const linkRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b/;
  if (linkRegExp.test(message.content) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.delete().catch(() => {});
    return message.channel.send(`⚠️ الروابط ممنوعة هنا يا ${message.author}!`).then(m => setTimeout(() => m.delete(), 3000));
  }
});

// --- 6. نظام الإعلانات الذكي ---
function startAds() {
  setInterval(async () => {
    const channel = client.channels.cache.get(AD_CHANNEL_ID);
    if (!channel) return;
    if (lastAdMessage) try { await lastAdMessage.delete(); } catch(e){}
    lastAdMessage = await channel.send("Advertisement: Check out our Minecraft Packs! 🎮\nhttps://discord.com/channels/1482874760940486699/1482935928963203142");
  }, 30 * 60 * 1000); // كل 30 دقيقة
}

client.login(process.env.TOKEN);
