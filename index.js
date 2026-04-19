const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
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

// --- تحديث الأيدي (IDs) بناءً على مراجعتك يا سيف ---
const WELCOME_CHANNEL_ID = '1482881348204101768'; // قناة الترحيب
const AD_CHANNEL_ID = '1482874761951576228';      // قناة الإعلانات
const INFO_CHANNEL_ID = '1484639863411183636';    // قناة معلومات السيرفر
const MEMBER_ROLE_ID = '1482883802186514615';     // رتبة العضو

let lastAdMessage = null;

// --- تعريف الأوامر ---
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('فحص سرعة اتصال البوت'),
  new SlashCommandBuilder().setName('info').setDescription('تحديث معلومات السيرفر يدوياً'),
  new SlashCommandBuilder().setName('server').setDescription('عرض معلومات وتفاصيل السيرفر'),
  new SlashCommandBuilder().setName('vote').setDescription('عمل تصويت جديد').addStringOption(opt => opt.setName('question').setDescription('سؤال التصويت').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('مسح الرسائل').addIntegerOption(opt => opt.setName('amount').setDescription('عدد الرسائل').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('إسكات عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)).addIntegerOption(opt => opt.setName('duration').setDescription('بالدقائق').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('فك الإسكات').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('حظر عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
].map(command => command.toJSON());

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Successfully reloaded slash commands.');
  } catch (error) { console.error(error); }

  updateLiveInfo();
  startAds();
});

// --- نظام الترحيب والـ Auto Role ---
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

client.on('guildMemberRemove', (member) => updateLiveInfo(member.guild));

// --- دالة الـ Live Info ---
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
    if (botMsg) await botMsg.edit(infoContent); else await channel.send(infoContent);
  } catch (e) {}
}

// --- التعامل مع أوامر السلاش ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, member } = interaction;

  if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);
  if (commandName === 'server') {
    const embed = new EmbedBuilder().setColor('#f1c40f').setTitle(`📊 Server Info: ${guild.name}`).setThumbnail(guild.iconURL()).addFields({ name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },{ name: '👥 Members', value: `${guild.memberCount}`, inline: true }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
  if (commandName === 'vote') {
    const q = options.getString('question');
    const msg = await interaction.reply({ content: `**📊 تصويت جديد:**\n${q}`, fetchReply: true });
    await msg.react('✅'); await msg.react('❌');
  }
  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await interaction.channel.bulkDelete(Math.min(amount, 100));
    await interaction.reply({ content: `✅ تم مسح ${amount} رسالة.`, ephemeral: true });
  }
  if (commandName === 'mute') {
    const target = options.getMember('target');
    const time = options.getInteger('duration');
    await target.timeout(time * 60 * 1000);
    await interaction.reply(`🔇 تم عمل ميوت لـ ${target} لمدة ${time} دقيقة.`);
  }
  if (commandName === 'unmute') {
    const target = options.getMember('target');
    await target.timeout(null);
    await interaction.reply(`🔊 تم فك الميوت عن ${target}.`);
  }
  if (commandName === 'kick') { await options.getMember('target').kick(); await interaction.reply(`👢 Done.`); }
  if (commandName === 'ban') { await guild.members.ban(options.getUser('target')); await interaction.reply(`🚫 Done.`); }
  if (commandName === 'info') { updateLiveInfo(guild); await interaction.reply({ content: 'Updated!', ephemeral: true }); }
});

// --- نظام الإعلانات ---
function startAds() {
  const adText = "Advertisement: Check out our Minecraft Packs! 🎮\nhttps://discord.com/channels/1482874760940486699/1482935928963203142";
  setInterval(async () => {
    const channel = client.channels.cache.get(AD_CHANNEL_ID);
    if (!channel) return;
    if (lastAdMessage) try { await lastAdMessage.delete(); } catch(e){}
    lastAdMessage = await channel.send(adText);
  }, 30 * 60 * 1000);
}

client.login(process.env.TOKEN);
