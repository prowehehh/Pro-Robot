const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Pro Robot Ultra Security is Online! 🛡️'));
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

// قائمة الكلمات الممنوعة (تقدر تزود عليها)
const badWords = ['شتيمة1', 'شتيمة2', 'fuck', 'bitch', 'ass', 'sharmout'];

let ad1Msg = null, ad2Msg = null, ad3Msg = null;

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('فحص سرعة البوت'),
  new SlashCommandBuilder().setName('server').setDescription('عرض معلومات السيرفر'),
  new SlashCommandBuilder().setName('info').setDescription('تحديث معلومات السيرفر يدوياً'),
  new SlashCommandBuilder().setName('clear').setDescription('مسح رسائل').addIntegerOption(opt => opt.setName('amount').setDescription('العدد').setRequired(true)),
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
    console.log('Successfully registered application commands.');
  } catch (error) { console.error(error); }

  updateLiveInfo();
  startAds();
});

// --- نظام الحماية (Protection) ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.toLowerCase();
  const hasLink = /(https?:\/\/[^\s]+)/g.test(content);
  const hasBadWord = badWords.some(word => content.includes(word));

  // منع الروابط والشتائم (ما عدا الإدارة وقناة الإعلانات)
  if ((hasLink || hasBadWord) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    if (message.channel.id !== AD_CHANNEL_ID) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`⚠️ ممنوع الروابط أو الشتائم يا ${message.author}!`);
      setTimeout(() => warn.delete().catch(() => {}), 3000);
    }
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
    welcomeChannel.send(`${member}! Welcome to **𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂** 👑! @everyone`);
  }
  updateLiveInfo(member.guild);
});

// --- التعامل مع الأوامر (Interaction) ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild } = interaction;

  // رد سريع عشان تطبيق "The application did not respond" ما يظهرش
  if (commandName === 'ping') {
    await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);
  }

  if (commandName === 'server') {
    const embed = new EmbedBuilder()
      .setTitle(`Server Info: ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: 'Total Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Created At', value: `${guild.createdAt.toLocaleDateString()}`, inline: true }
      )
      .setColor('#00ff00');
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'clear') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) 
      return interaction.reply({ content: 'ماعندك صلاحية!', ephemeral: true });
    
    const amount = options.getInteger('amount');
    await interaction.channel.bulkDelete(Math.min(amount, 100), true);
    await interaction.reply({ content: `✅ تم مسح ${amount} رسالة بنجاح.`, ephemeral: true });
  }

  if (commandName === 'mute') {
    const target = options.getMember('target');
    const duration = options.getInteger('duration');
    await target.timeout(duration * 60 * 1000, 'Muted by Pro Robot');
    await interaction.reply(`🔇 تم إسكات ${target} لمدة ${duration} دقيقة.`);
  }

  if (commandName === 'kick') {
    const target = options.getMember('target');
    await target.kick();
    await interaction.reply(`👢 تم طرد ${target.user.tag} من السيرفر.`);
  }

  if (commandName === 'ban') {
    const target = options.getUser('target');
    await guild.members.ban(target);
    await interaction.reply(`🚫 تم حظر ${target.tag} نهائياً.`);
  }

  if (commandName === 'info') {
    updateLiveInfo(guild);
    await interaction.reply({ content: '✅ تم تحديث Live Info!', ephemeral: true });
  }
});

// --- نظام الإعلانات (30 min - delete after 15 min) ---
function startAds() {
  const channel = client.channels.cache.get(AD_CHANNEL_ID);
  if (!channel) return;

  setInterval(async () => {
    if (ad1Msg) await ad1Msg.delete().catch(() => {});
    ad1Msg = await channel.send(`If you want to make totem about onwe skin or picture about onwe skin.
Ask <@1480631975697055754>
https://discord.com/channels/1482874760940486699/1484397891693969601`);
    setTimeout(() => { if (ad1Msg) ad1Msg.delete().catch(() => {}); ad1Msg = null; }, 15 * 60 * 1000);
  }, 30 * 60 * 1000);
}

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
