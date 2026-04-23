const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
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

// --- إعدادات الأيدي (IDs) الثابتة ---
const WELCOME_CHANNEL_ID = '1482881348204101768';
const INFO_CHANNEL_ID = '1484639863411183636';
const MEMBER_ROLE_ID = '1482883802186514615';

// متغيرات نظام الإعلانات الجديد
let activeAdInterval = null;
let currentAdMsg = null;
let adConfig = {};

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
  new SlashCommandBuilder().setName('info').setDescription('Update server info manually'),
  new SlashCommandBuilder().setName('server').setDescription('Show server information'),
  new SlashCommandBuilder().setName('vote').setDescription('Create a vote').addStringOption(opt => opt.setName('question').setDescription('The question').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Delete messages').addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)).addIntegerOption(opt => opt.setName('duration').setDescription('In minutes').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member').addUserOption(opt => opt.setName('target').setDescription('The member').setRequired(true)),
  
  // أمر إعداد الإعلانات الجديد مع التحكم الكامل في القناة والشكل واللون
  new SlashCommandBuilder()
    .setName('ads_set')
    .setDescription('Set a new auto advertisement')
    .addStringOption(opt => opt.setName('name').setDescription('Ad name').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Ad message').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Select the channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(opt => opt.setName('style').setDescription('Choose style').setRequired(true)
        .addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal Text', value: 'normal' }))
    .addStringOption(opt => opt.setName('color').setDescription('Choose color (if Box)').setRequired(true)
        .addChoices(
            { name: 'Blue', value: '#3498db' },
            { name: 'Green', value: '#2ecc71' },
            { name: 'Red', value: '#e74c3c' },
            { name: 'Yellow', value: '#f1c40f' },
            { name: 'Black', value: '#000000' }
        ))
    .addIntegerOption(opt => opt.setName('interval').setDescription('Send every (minutes)').setRequired(true))
    .addIntegerOption(opt => opt.setName('delete').setDescription('Delete after (minutes)').setRequired(true)),

  new SlashCommandBuilder().setName('ads_stop').setDescription('Stop the current ad system'),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a message and delete it after specific time')
    .addStringOption(opt => opt.setName('message').setDescription('Your message').setRequired(true))
    .addIntegerOption(opt => opt.setName('time').setDescription('Time to delete in minutes').setRequired(true)),
].map(command => command.toJSON());

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('/help', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('All commands updated! ✅️');
  } catch (error) { console.error(error); }

  updateLiveInfo();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel, member } = interaction;
  const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

  // --- نظام الإعلانات المطور ---
  if (commandName === 'ads_set') {
    if (!isAdmin) return interaction.reply({ content: "Sorry, this command is for Admins only! ❌", ephemeral: true });

    // إيقاف أي إعلان شغال
    if (activeAdInterval) clearInterval(activeAdInterval);

    adConfig = {
      name: options.getString('name'),
      text: options.getString('text'),
      channelId: options.getChannel('channel').id,
      style: options.getString('style'),
      color: options.getString('color'),
      sendEvery: options.getInteger('interval'),
      deleteAfter: options.getInteger('delete')
    };

    const startAdSystem = () => {
      const targetChannel = client.channels.cache.get(adConfig.channelId);
      if (!targetChannel) return;

      activeAdInterval = setInterval(async () => {
        if (currentAdMsg) await currentAdMsg.delete().catch(() => {});
        
        if (adConfig.style === 'embed') {
          const adEmbed = new EmbedBuilder()
            .setTitle(`📢 ${adConfig.name}`)
            .setDescription(adConfig.text)
            .setColor(adConfig.color)
            .setFooter({ text: 'Auto Ad System' })
            .setTimestamp();
          currentAdMsg = await targetChannel.send({ embeds: [adEmbed] });
        } else {
          currentAdMsg = await targetChannel.send({ content: `**📢 ${adConfig.name}**\n\n${adConfig.text}` });
        }

        if (adConfig.deleteAfter > 0) {
          setTimeout(async () => {
            if (currentAdMsg) {
              await currentAdMsg.delete().catch(() => {});
              currentAdMsg = null;
            }
          }, adConfig.deleteAfter * 60 * 1000);
        }
      }, adConfig.sendEvery * 60 * 1000);
    };

    startAdSystem();
    await interaction.reply({ content: `✅ Ad system started in <#${adConfig.channelId}>!`, ephemeral: true });
  }

  if (commandName === 'ads_stop') {
    if (!isAdmin) return interaction.reply({ content: "Sorry, Admins only! ❌", ephemeral: true });
    if (activeAdInterval) {
      clearInterval(activeAdInterval);
      activeAdInterval = null;
      if (currentAdMsg) await currentAdMsg.delete().catch(() => {});
      await interaction.reply({ content: "🛑 All auto ads have been stopped.", ephemeral: true });
    } else {
      await interaction.reply({ content: "No active ads to stop.", ephemeral: true });
    }
  }

  // --- باقي الأوامر الإدارية بالإنجليزية ---
  if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);

  if (commandName === 'send') {
    const text = options.getString('message');
    const time = options.getInteger('time');
    const sentMsg = await channel.send(text).catch(() => {});
    await interaction.reply({ content: `✅ Message sent successfully!`, ephemeral: true });
    if (time > 0 && sentMsg) setTimeout(() => sentMsg.delete().catch(() => {}), time * 60 * 1000);
  }

  if (commandName === 'info') {
    updateLiveInfo(guild);
    await interaction.reply({ content: '✅ Server information has been updated!', ephemeral: true });
  }

  if (commandName === 'server') {
    const serverEmbed = new EmbedBuilder()
      .setTitle(`Server Information: ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: '👑 Owner:', value: `<@${guild.ownerId}>`, inline: true },
        { name: '👥 Members:', value: `${guild.memberCount}`, inline: true },
        { name: '🌍 Location:', value: `Egypt`, inline: true },
        { name: '📅 Created At:', value: `${guild.createdAt.toLocaleDateString('en-GB')}`, inline: true }
      )
      .setColor('#f1c40f');
    await interaction.reply({ embeds: [serverEmbed] });
  }

  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await channel.bulkDelete(Math.min(amount, 100)).catch(() => {});
    await interaction.reply({ content: `✅ Deleted ${amount} messages!`, ephemeral: true });
  }

  if (commandName === 'mute') {
    const target = options.getMember('target');
    const time = options.getInteger('duration');
    await target.timeout(time * 60 * 1000).catch(() => {});
    await interaction.reply({ content: `🔇 ${target.user.username} has been silenced for ${time} minutes!` });
  }

  if (commandName === 'unmute') {
    const target = options.getMember('target');
    await target.timeout(null).catch(() => {});
    await interaction.reply({ content: `🔊 ${target.user.username} has been unmuted!` });
  }

  if (commandName === 'kick') { await options.getMember('target').kick().catch(() => {}); await interaction.reply({ content: `🦶 Member has been kicked!` }); }
  if (commandName === 'ban') { await guild.members.ban(options.getUser('target')).catch(() => {}); await interaction.reply({ content: `🚫 Member has been banned!` }); }
});

// --- رسالة الترحيب ---
client.on('guildMemberAdd', async (member) => {
    try {
      const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
      if (role) await member.roles.add(role);
    } catch (e) {}
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      const welcomeEmbed = new EmbedBuilder()
        .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
        .setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1484639863411183636>\n[¡}================{!}================[¡}\nThank you! ❤️ | From:@Pro King`)
        .setColor('#00ff00').setTimestamp();
      const sentMsg = await welcomeChannel.send({ content: `${member}`, embeds: [welcomeEmbed] }).catch(() => {});
      if (sentMsg) setTimeout(() => sentMsg.delete().catch(() => {}), 86400000);
    }
    updateLiveInfo(member.guild);
});

// --- تحديث معلومات السيرفر الحية ---
async function updateLiveInfo(guild) {
  if (!guild) guild = client.guilds.cache.first();
  const channel = client.channels.cache.get(INFO_CHANNEL_ID);
  if (!channel || !guild) return;
  const createdAt = guild.createdAt.toLocaleDateString('en-GB');
  const info = `@everyone\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@1134146616857731173>\n• Robot: <@1495419259147386920>\n• Server from: Egypt\n• Date Server: ${createdAt}\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`;
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit(info); else await channel.send(info);
  } catch (e) {}
}

client.login(process.env.TOKEN);
