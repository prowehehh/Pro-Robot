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

// --- الأوامر المساعدة ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;

  // 1. أمر Ping
  if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);

  // 2. أمر Server (الجديد)
  if (commandName === 'server') {
    const serverEmbed = new EmbedBuilder()
      .setTitle('Information Server: ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: '👑 Onwer server:', value: `<@${guild.ownerId}>`, inline: true },
        { name: '👥 Number Members:', value: `${guild.memberCount}`, inline: true },
        { name: '🌍 Location:', value: `Egypt`, inline: true },
        { name: '📅 Date:', value: `${guild.createdAt.toLocaleDateString('en-GB')}`, inline: true }
      )
      .setColor('#f1c40f');
    await interaction.reply({ embeds: [serverEmbed] });
  }

  // 3. أمر Vote (الجديد)
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

  // 4. أمر Clear
  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await channel.bulkDelete(Math.min(amount, 100));
    await interaction.reply({ content: `✅ تم مسح ${amount} رسالة.`, ephemeral: true });
  }

  // 5. أمر Mute
  if (commandName === 'mute') {
    const target = options.getMember('target');
    const time = options.getInteger('duration');
    await target.timeout(time * 60 * 1000);
    await interaction.reply(`🔇 تم إسكات ${target} لمدة ${time} دقيقة.`);
  }

  // 6. أمر Unmute (الجديد)
  if (commandName === 'unmute') {
    const target = options.getMember('target');
    await target.timeout(null);
    await interaction.reply(`🔊 تم فك الإسكات عن ${target}.`);
  }

  // 7. باقي أوامر الإدارة
  if (commandName === 'kick') { await options.getMember('target').kick(); await interaction.reply(`👢 تم طرد العضو.`); }
  if (commandName === 'ban') { await guild.members.ban(options.getUser('target')); await interaction.reply(`🚫 تم حظر العضو.`); }
  if (commandName === 'info') { updateLiveInfo(guild); await interaction.reply({ content: 'تم تحديث الروم بنجاح!', ephemeral: true }); }
});

// --- بقية الدوال (Welcome, Ads, updateLiveInfo) كما هي في كودك ---
// (تأكد من إبقائها تحت الـ interactionCreate)

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
  
  function startAds() {
    const channel = client.channels.cache.get(AD_CHANNEL_ID);
    if (!channel) return;
  
    setInterval(async () => {
      if (ad1Msg) await ad1Msg.delete().catch(() => {});
      
      const adContent = `If you want to make totem about onwe skin or picture about onwe skin. Ask @Dream234
→ You will receive your request in there!
https://discord.com/channels/1482874760940486699/1484397891693969601
================================
- All the news about the server is there!
https://discord.com/channels/1482874760940486699/1482934834899714048
================================
- If you need to edit or make any texture pack.
→ You can click on here to get request!
https://discord.com/channels/1482874760940486699/1482936392479936645`;
      
      ad1Msg = await channel.send(adContent);
  
      setTimeout(async () => {
        if (ad1Msg) {
          await ad1Msg.delete().catch(() => {});
          ad1Msg = null;
        }
      }, 15 * 60 * 1000);
  
    }, 30 * 60 * 1000);
  }
  
  async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const channel = client.channels.cache.get(INFO_CHANNEL_ID);
    if (!channel || !guild) return;
    const createdAt = guild.createdAt.toLocaleDateString('en-GB');
    const info = `@everyone\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Onwer: <@1134146616857731173>\n• Robot: <@1495419259147386920>\n• Server from: Egypt\n• Date Server: ${createdAt}\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`;
    try {
      const msgs = await channel.messages.fetch({ limit: 10 });
      const botMsg = msgs.find(m => m.author.id === client.user.id);
      if (botMsg) await botMsg.edit(info); else await channel.send(info);
    } catch (e) {}
  }

client.login(process.env.TOKEN);
