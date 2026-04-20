const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const translate = require('@vitalets/google-translate-api'); // مكتبة الترجمة
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
const WELCOME_CHANNEL_ID = '1482881348204101768';
const AD_CHANNEL_ID = '1482874761951576228';
const INFO_CHANNEL_ID = '1484639863411183636';
const MEMBER_ROLE_ID = '1482883802186514615';

let ad1Msg = null, ad2Msg = null, ad3Msg = null;

// --- تعريف الأوامر (بما فيها الترجمة والمهام) ---
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('فحص سرعة البوت'),
  new SlashCommandBuilder().setName('info').setDescription('تحديث معلومات السيرفر يدوياً'),
  new SlashCommandBuilder().setName('server').setDescription('عرض معلومات السيرفر'),
  new SlashCommandBuilder().setName('clear').setDescription('مسح رسائل').addIntegerOption(opt => opt.setName('amount').setDescription('العدد').setRequired(true)),
  
  // أمر الترجمة الجديد
  new SlashCommandBuilder().setName('translate')
    .setDescription('ترجمة نص معين')
    .addStringOption(opt => opt.setName('text').setDescription('النص المراد ترجمته').setRequired(true))
    .addStringOption(opt => opt.setName('to').setDescription('اللغة (ar للأرقام، en للإنجليزي)').setRequired(true)
      .addChoices({ name: 'Arabic', value: 'ar' }, { name: 'English', value: 'en' })),

  // أمر المهام الجديد
  new SlashCommandBuilder().setName('todo')
    .setDescription('إضافة مهمة لقائمة المهام الخاصة بك')
    .addStringOption(opt => opt.setName('task').setDescription('المهمة التي تريد إضافتها').setRequired(true)),

  new SlashCommandBuilder().setName('mute').setDescription('إسكات عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)).addIntegerOption(opt => opt.setName('duration').setDescription('بالدقائق').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('حظر عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
].map(command => command.toJSON());

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('/help', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Commands Registered.');
  } catch (error) { console.error(error); }

  updateLiveInfo();
  startAds();
});

// --- نظام الترحيب (بدون تعديل كما طلبت) ---
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
  updateLiveInfo(member.guild);
});

// --- نظام الإعلانات بنصوص سيف (بدون تعديل) ---
function startAds() {
  const channel = client.channels.cache.get(AD_CHANNEL_ID);
  if (!channel) return;

  setInterval(async () => {
    if (ad1Msg) await ad1Msg.delete().catch(() => {});
    const ad1Text = `If you want to make totem about onwe skin or picture about onwe skin.
Ask @Dream234

You will receive your request in there
https://discord.com/channels/1482874760940486699/1484397891693969601`;
    ad1Msg = await channel.send(ad1Text);
    setTimeout(async () => { if (ad1Msg) { await ad1Msg.delete().catch(() => {}); ad1Msg = null; } }, 15 * 60 * 1000);
  }, 30 * 60 * 1000);

  setInterval(async () => {
    if (ad2Msg) await ad2Msg.delete().catch(() => {});
    const ad2Text = `All the news about the server is there
https://discord.com/channels/1482874760940486699/1482934834899714048`;
    ad2Msg = await channel.send(ad2Text);
    setTimeout(async () => { if (ad2Msg) { await ad2Msg.delete().catch(() => {}); ad2Msg = null; } }, 15 * 60 * 1000);
  }, 60 * 60 * 1000);

  setInterval(async () => {
    if (ad3Msg) await ad3Msg.delete().catch(() => {});
    const ad3Text = `If you need to edit or make any texture pack.
You can click on here
https://discord.com/channels/1482874760940486699/1482936392479936645 to request!`;
    ad3Msg = await channel.send(ad3Text);
    setTimeout(async () => { if (ad3Msg) { await ad3Msg.delete().catch(() => {}); ad3Msg = null; } }, 15 * 60 * 1000);
  }, 90 * 60 * 1000);
}

// --- تنفيذ الأوامر (Interaction Create) ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, user } = interaction;

  // تنفيذ أمر الترجمة
  if (commandName === 'translate') {
    await interaction.deferReply({ ephemeral: true });
    const text = options.getString('text');
    const targetLang = options.getString('to');
    
    try {
      const res = await translate(text, { to: targetLang });
      await interaction.editReply(`**الترجمة:**\n${res.text}`);
    } catch (err) {
      await interaction.editReply('❌ حدث خطأ أثناء الترجمة.');
    }
  }

  // تنفيذ أمر قائمة المهام
  if (commandName === 'todo') {
    const task = options.getString('task');
    const embed = new EmbedBuilder()
      .setTitle('📝 قائمة مهام جديدة')
      .setDescription(`صاحب المهمة: ${user}\n\n**المهمة:**\n${task}`)
      .setColor('#FFA500')
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);
  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await interaction.channel.bulkDelete(Math.min(amount, 100));
    await interaction.reply({ content: `✅ Done.`, ephemeral: true });
  }
  if (commandName === 'info') { updateLiveInfo(guild); await interaction.reply({ content: 'Updated!', ephemeral: true }); }
});

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
