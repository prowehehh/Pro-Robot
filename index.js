const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Pro Robot is Online! 🚀'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is ready on port ${port}`));

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
  new SlashCommandBuilder().setName('unmute').setDescription('فك إسكات').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('حظر عضو').addUserOption(opt => opt.setName('target').setDescription('العضو').setRequired(true)),
].map(command => command.toJSON());

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('/help', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ تم تحديث جميع الأوامر بنجاح');
  } catch (error) { console.error(error); }

  updateLiveInfo();
  startAds();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;

  try {
    if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);

    if (commandName === 'server') {
      const serverEmbed = new EmbedBuilder()
        .setTitle(`Information Server: ${guild.name}`) // تم تصحيح القوس هنا
        .setThumbnail(guild.iconURL())
        .addFields(
          { name: '👑 Owner server:', value: `<@${guild.ownerId}>`, inline: true },
          { name: '👥 Number Members:', value: `${guild.memberCount}`, inline: true },
          { name: '🌍 Location:', value: `Egypt`, inline: true },
          { name: '📅 Date:', value: `${guild.createdAt.toLocaleDateString('en-GB')}`, inline: true }
        )
        .setColor('#f1c40f');
      await interaction.reply({ embeds: [serverEmbed] });
    }

    if (commandName === 'vote') {
      const question = options.getString('question');
      const voteEmbed = new EmbedBuilder()
        .setTitle('📊 تصويت جديد')
        .setDescription(question)
        .setFooter({ text: `بواسطة: ${interaction.user.username}` })
        .setColor('#3498db')
        .setTimestamp();
      
      const msg = await interaction.reply({ embeds: [voteEmbed], fetchReply: true });
      await msg.react('✅');
      await msg.react('❌');
    }

    if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      await channel.bulkDelete(Math.min(amount, 100)).catch(() => {});
      await interaction.reply({ content: `✅ تم مسح ${amount} رسالة.`, ephemeral: true });
    }

    if (commandName === 'mute') {
      const target = options.getMember('target');
      const time = options.getInteger('duration');
      await target.timeout(time * 60 * 1000).catch(() => {});
      await interaction.reply(`🔇 تم إسكات ${target} لمدة ${time} دقيقة.`);
    }

    if (commandName === 'unmute') {
      const target = options.getMember('target');
      await target.timeout(null).catch(() => {});
      await interaction.reply(`🔊 تم فك الإسكات عن ${target}.`);
    }

    if (commandName === 'kick') { 
        await options.getMember('target').kick().catch(() => {}); 
        await interaction.reply(`👢 تم طرد العضو.`); 
    }

    if (commandName === 'ban') { 
        await guild.members.ban(options.getUser('target')).catch(() => {}); 
        await interaction.reply(`🚫 تم حظر العضو.`); 
    }

    if (commandName === 'info') { 
        updateLiveInfo(guild); 
        await interaction.reply({ content: 'تم تحديث الروم بنجاح!', ephemeral: true }); 
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply({ content: 'حدث خطأ أثناء تنفيذ الأمر.', ephemeral: true });
  }
});

// باقي الدوال (Welcome, Ads, updateLiveInfo)
client.on('guildMemberAdd', async (member) => {
    try {
      const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
      if (role) await member.roles.add(role);
    } catch (e) {}
  
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      const welcomeMsg = `${member}! Welcome to the **𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂** 👑!`;
      welcomeChannel.send(welcomeMsg).catch(() => {});
    }
    updateLiveInfo(member.guild);
});

function startAds() {
    const channel = client.channels.cache.get(AD_CHANNEL_ID);
    if (!channel) return;
    setInterval(async () => {
      try {
        if (ad1Msg) await ad1Msg.delete().catch(() => {});
        const adContent = `If you want to make totem about onwe skin or picture about onwe skin. Ask @Dream234\n→ You will receive your request in there!\nhttps://discord.com/channels/1482874760940486699/1484397891693969601`;
        ad1Msg = await channel.send(adContent);
        setTimeout(async () => {
          if (ad1Msg) { await ad1Msg.delete().catch(() => {}); ad1Msg = null; }
        }, 15 * 60 * 1000);
      } catch (e) {}
    }, 30 * 60 * 1000);
}

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const channel = client.channels.cache.get(INFO_CHANNEL_ID);
    if (!channel || !guild) return;
    const createdAt = guild.createdAt.toLocaleDateString('en-GB');
    const info = `@everyone\nInformation about server:-\n• Total Members: ${guild.memberCount}\n• Date Server: ${createdAt}`;
    try {
      const msgs = await channel.messages.fetch({ limit: 10 });
      const botMsg = msgs.find(m => m.author.id === client.user.id);
      if (botMsg) await botMsg.edit(info); else await channel.send(info);
    } catch (e) {}
}

client.login(process.env.TOKEN);
