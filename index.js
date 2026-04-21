const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Pro Robot is Online! 🚀'));
app.listen(process.env.PORT || 3000);

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

let ad1Msg = null;

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('فحص سرعة البوت'),
  new SlashCommandBuilder().setName('info').setDescription('تحديث معلومات السيرفر يدوياً'),
  new SlashCommandBuilder().setName('server').setDescription('عرض معلومات السيرفر'),
  new SlashCommandBuilder().setName('vote').setDescription('عمل تصويت').addStringOption(opt => opt.setName('question').setDescription('السؤال').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('مسح رسائل').addIntegerOption(opt => opt.setName('amount').setDescription('العدد').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('إسكات عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)).addIntegerOption(opt => opt.setName('duration').setDescription('بالدقائق').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('حظر عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
].map(command => command.toJSON());

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commands Registered.');
  } catch (error) { console.error(error); }
  
  updateLiveInfo();
  startAds();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;

  if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);

  if (commandName === 'server') {
    const serverEmbed = new EmbedBuilder()
      .setTitle(`Server Info: ${guild.name}`)
      .addFields(
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Created At', value: `${guild.createdAt.toLocaleDateString('en-GB')}`, inline: true }
      )
      .setColor('#f1c40f');
    await interaction.reply({ embeds: [serverEmbed] });
  }

  if (commandName === 'vote') {
    const question = options.getString('question');
    const voteEmbed = new EmbedBuilder()
      .setTitle('📊 New Vote')
      .setDescription(question)
      .setColor('#3498db');
    const msg = await interaction.reply({ embeds: [voteEmbed], fetchReply: true });
    await msg.react('✅'); await msg.react('❌');
  }

  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await channel.bulkDelete(Math.min(amount, 100)).catch(() => {});
    await interaction.reply({ content: `✅ Done.`, ephemeral: true });
  }

  if (commandName === 'mute') {
    const target = options.getMember('target');
    const time = options.getInteger('duration');
    await target.timeout(time * 60 * 1000).catch(() => {});
    await interaction.reply(`🔇 Muted ${target.user.tag}.`);
  }

  if (commandName === 'kick') { await options.getMember('target').kick().catch(() => {}); await interaction.reply(`👢 Kicked.`); }
  if (commandName === 'ban') { await guild.members.ban(options.getUser('target')).catch(() => {}); await interaction.reply(`🚫 Banned.`); }
  if (commandName === 'info') { updateLiveInfo(guild); await interaction.reply({ content: 'Updated!', ephemeral: true }); }
});

client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
  if (role) await member.roles.add(role).catch(() => {});

  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    welcomeChannel.send(`${member}! Welcome to **𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂** 👑!`);
  }
  updateLiveInfo(member.guild);
});

function startAds() {
  const channel = client.channels.cache.get(AD_CHANNEL_ID);
  if (!channel) return;
  setInterval(async () => {
    if (ad1Msg) await ad1Msg.delete().catch(() => {});
    ad1Msg = await channel.send(`📢 **Pro Packs Update**\nCheck out our latest content!\nhttps://discord.com/channels/1482874760940486699/1482936392479936645`);
  }, 30 * 60 * 1000);
}

async function updateLiveInfo(guild) {
  if (!guild) guild = client.guilds.cache.first();
  const channel = client.channels.cache.get(INFO_CHANNEL_ID);
  if (!channel || !guild) return;
  const info = `**Server Live Info**\nOwner: <@1134146616857731173>\nMembers: ${guild.memberCount}`;
  const msgs = await channel.messages.fetch({ limit: 5 }).catch(() => []);
  const botMsg = msgs.find(m => m.author.id === client.user.id);
  if (botMsg) await botMsg.edit(info).catch(() => {}); else await channel.send(info).catch(() => {});
}

client.login(process.env.TOKEN);
