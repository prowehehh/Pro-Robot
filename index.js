const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Pro Robot is Online! 🚀'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is ready on port ${port}!`));

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
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('إرسال رسالة وحذفها بعد وقت معين')
    .addStringOption(opt => opt.setName('message').setDescription('اكتب الرسالة هنا').setRequired(true))
    .addIntegerOption(opt => opt.setName('time').setDescription('وقت المسح بالدقائق (0 يعني لا تمسح)').setRequired(true)),
].map(command => command.toJSON());

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('/help', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('All commands were successfully updated! ✅️');
  } catch (error) { console.error(error); }

  updateLiveInfo();
  startAds();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;

  if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);

  if (commandName === 'send') {
    const text = options.getString('message');
    const time = options.getInteger('time');
    const sentMsg = await channel.send(text).catch(() => {});
    await interaction.reply({ content: `Your message has been sent successfully! ✅`, ephemeral: true });

    if (time > 0 && sentMsg) {
      setTimeout(async () => {
        await sentMsg.delete().catch(() => {});
      }, time * 60 * 1000);
    }
  }

  if (commandName === 'server') {
    const serverEmbed = new EmbedBuilder()
      .setTitle(`Information Server: ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: '👑 Onwer Server:', value: `<@${guild.ownerId}>`, inline: true },
        { name: '👥 Number of Members:', value: `${guild.memberCount}`, inline: true },
        { name: '🌍 Location:', value: `Egypt`, inline: true },
        { name: '📅 Date:', value: `${guild.createdAt.toLocaleDateString('en-GB')}`, inline: true }
      )
      .setColor('#f1c40f');
    await interaction.reply({ embeds: [serverEmbed] });
  }

  if (commandName === 'vote') {
    const question = options.getString('question');
    const voteEmbed = new EmbedBuilder()
      .setTitle('New Vote! 🗳')
      .setDescription(question)
      .setFooter({ text: `By: ${interaction.user.username}` })
      .setColor('#3498db')
      .setTimestamp();
    
    const msg = await interaction.reply({ embeds: [voteEmbed], fetchReply: true });
    await msg.react('✅');
    await msg.react('❌');
  }

  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await channel.bulkDelete(Math.min(amount, 100)).catch(() => {});
    await interaction.reply({ content: `Messages ${amount} deleted! ✅️`, ephemeral: true });
  }

  if (commandName === 'mute') {
    const target = options.getMember('target');
    const time = options.getInteger('duration');
    await target.timeout(time * 60 * 1000).catch(() => {});
    await interaction.reply(`Silenced ${target} For the ${time} Minutes! 🔇`);
  }

  if (commandName === 'unmute') {
    const target = options.getMember('target');
    await target.timeout(null).catch(() => {});
    await interaction.reply(`Unmuted! 🔈 ${target}`);
  }

  if (commandName === 'kick') { await options.getMember('target').kick().catch(() => {}); await interaction.reply(`The member has been kicked! 🦶`); }
  if (commandName === 'ban') { await guild.members.ban(options.getUser('target')).catch(() => {}); await interaction.reply(`The member has been banned! 🚫`); }
  if (commandName === 'info') { updateLiveInfo(guild); await interaction.reply({ content: 'The information has been updated! ✅️', ephemeral: true }); }
});

client.on('guildMemberAdd', async (member) => {
    try {
      const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
      if (role) await member.roles.add(role);
    } catch (e) {}
  
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      const welcomeEmbed = new EmbedBuilder()
        // هنا صورة العضو هتظهر فقط بجانب الاسم فوق (Author Icon)
        .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
        .setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑
[¡}================{!}================[¡}
- You are now from team PRO! 🥳
- Join us and you will be enjoying! 🎉
- Chat with us and go to read info server.
[]--------------------!--------------------[]
→ <#1482874761951576228> | <#1484639863411183636>
[¡}================{!}================[¡}
Thank you! ❤️ | From:@Pro King`)
        // تم حذف سطر الـ setThumbnail لإزالة الصورة الجانبية الكبيرة
        .setColor('#00ff00')
        .setTimestamp();

      const sentMsg = await welcomeChannel.send({ content: `${member}`, embeds: [welcomeEmbed] }).catch(() => {});
      
      if (sentMsg) {
          setTimeout(async () => {
              await sentMsg.delete().catch(() => {});
          }, 86400000);
      }
    }
    updateLiveInfo(member.guild);
  });
  
  function startAds() {
    const channel = client.channels.cache.get(AD_CHANNEL_ID);
    if (!channel) return;
  
    setInterval(async () => {
      try {
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
      } catch (err) {}
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
