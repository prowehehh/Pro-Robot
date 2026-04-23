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

// تخزين الإعلانات (للسماح بتعدد الإعلانات والتحكم بكل واحد باسمه)
const adsStorage = new Map();

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
  new SlashCommandBuilder().setName('info').setDescription('Update server info manually'),
  new SlashCommandBuilder().setName('server').setDescription('Show server information'),
  
  // 1. إنشاء إعلان جديد
  new SlashCommandBuilder()
    .setName('ads_set')
    .setDescription('Set a new auto advertisement')
    .addStringOption(opt => opt.setName('name').setDescription('Ad unique name').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Ad message').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Select channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(opt => opt.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal Text', value: 'normal' }))
    .addStringOption(opt => opt.setName('color').setDescription('Box color').setRequired(true).addChoices({ name: 'Blue', value: '#3498db' }, { name: 'Green', value: '#2ecc71' }, { name: 'Red', value: '#e74c3c' }, { name: 'Yellow', value: '#f1c40f' }, { name: 'Black', value: '#000000' }))
    .addIntegerOption(opt => opt.setName('interval').setDescription('Every (minutes)').setRequired(true))
    .addIntegerOption(opt => opt.setName('delete').setDescription('Delete after (minutes)').setRequired(true)),

  // 2. إيقاف إعلان معين باسمه
  new SlashCommandBuilder()
    .setName('ads_stop')
    .setDescription('Stop a specific ad by name')
    .addStringOption(opt => opt.setName('name').setDescription('Name of the ad to stop').setRequired(true)),

  // 3. تفعيل إعلان متوقف واختيار قناة
  new SlashCommandBuilder()
    .setName('ads_enable')
    .setDescription('Enable a stopped ad')
    .addStringOption(opt => opt.setName('name').setDescription('Name of the ad').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to run in').addChannelTypes(ChannelType.GuildText).setRequired(true)),

  // 4. تعديل إعلان موجود
  new SlashCommandBuilder()
    .setName('ads_edit')
    .setDescription('Edit an existing ad')
    .addStringOption(opt => opt.setName('name').setDescription('Name of the ad to edit').setRequired(true))
    .addStringOption(opt => opt.setName('new_text').setDescription('Update text'))
    .addChannelOption(opt => opt.setName('new_channel').setDescription('Update channel').addChannelTypes(ChannelType.GuildText))
    .addIntegerOption(opt => opt.setName('new_interval').setDescription('Update interval'))
    .addStringOption(opt => opt.setName('new_color').setDescription('Update color').addChoices({ name: 'Blue', value: '#3498db' }, { name: 'Green', value: '#2ecc71' }, { name: 'Red', value: '#e74c3c' })),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a message and delete it after specific time')
    .addStringOption(opt => opt.setName('message').setDescription('Your message').setRequired(true))
    .addIntegerOption(opt => opt.setName('time').setDescription('Time in minutes').setRequired(true)),
].map(command => command.toJSON());

// دالة تشغيل الإعلان (Logic)
function startAdLoop(adName) {
    const ad = adsStorage.get(adName);
    if (!ad) return;

    if (ad.timer) clearInterval(ad.timer);

    ad.timer = setInterval(async () => {
        const targetChannel = client.channels.cache.get(ad.channelId);
        if (!targetChannel) return;

        // مسح الرسالة القديمة للإعلان ده
        if (ad.lastMsgId) {
            const oldMsg = await targetChannel.messages.fetch(ad.lastMsgId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
        }

        let sentMsg;
        if (ad.style === 'embed') {
            const embed = new EmbedBuilder().setTitle(`📢 ${ad.name}`).setDescription(ad.text).setColor(ad.color).setTimestamp();
            sentMsg = await targetChannel.send({ embeds: [embed] }).catch(() => {});
        } else {
            sentMsg = await targetChannel.send({ content: `**📢 ${ad.name}**\n\n${ad.text}` }).catch(() => {});
        }

        if (sentMsg) {
            ad.lastMsgId = sentMsg.id;
            if (ad.deleteAfter > 0) {
                setTimeout(async () => {
                    await sentMsg.delete().catch(() => {});
                    if (ad.lastMsgId === sentMsg.id) ad.lastMsgId = null;
                }, ad.deleteAfter * 60 * 1000);
            }
        }
    }, ad.interval * 60 * 1000);
}

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Commands Updated! ✅');
  } catch (error) { console.error(error); }
  updateLiveInfo();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel, member } = interaction;
  const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

  // --- نظام الإعلانات المطور ---

  if (commandName === 'ads_set') {
    if (!isAdmin) return interaction.reply({ content: "Admins only! ❌", ephemeral: true });
    const name = options.getString('name');
    
    adsStorage.set(name, {
        name,
        text: options.getString('text'),
        channelId: options.getChannel('channel').id,
        style: options.getString('style'),
        color: options.getString('color'),
        interval: options.getInteger('interval'),
        deleteAfter: options.getInteger('delete'),
        timer: null,
        lastMsgId: null
    });

    startAdLoop(name);
    await interaction.reply({ content: `✅ Ad **${name}** started!`, ephemeral: true });
  }

  if (commandName === 'ads_stop') {
    if (!isAdmin) return interaction.reply({ content: "Admins only! ❌", ephemeral: true });
    const name = options.getString('name');
    const ad = adsStorage.get(name);

    if (ad) {
        if (ad.timer) clearInterval(ad.timer);
        ad.timer = null;
        // مسح آخر رسالة لو موجودة
        if (ad.lastMsgId) {
            const chan = client.channels.cache.get(ad.channelId);
            const msg = await chan?.messages.fetch(ad.lastMsgId).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
        }
        await interaction.reply({ content: `🛑 Ad **${name}** has been stopped and cleared.`, ephemeral: true });
    } else {
        await interaction.reply({ content: "Ad name not found! ❌", ephemeral: true });
    }
  }

  if (commandName === 'ads_enable') {
    if (!isAdmin) return interaction.reply({ content: "Admins only! ❌", ephemeral: true });
    const name = options.getString('name');
    const channelId = options.getChannel('channel').id;
    const ad = adsStorage.get(name);

    if (ad) {
        ad.channelId = channelId;
        startAdLoop(name);
        await interaction.reply({ content: `✅ Ad **${name}** enabled in <#${channelId}>!`, ephemeral: true });
    } else {
        await interaction.reply({ content: "Ad name not found! ❌", ephemeral: true });
    }
  }

  if (commandName === 'ads_edit') {
    if (!isAdmin) return interaction.reply({ content: "Admins only! ❌", ephemeral: true });
    const name = options.getString('name');
    const ad = adsStorage.get(name);

    if (!ad) return interaction.reply({ content: "Ad not found! ❌", ephemeral: true });

    if (options.getString('new_text')) ad.text = options.getString('new_text');
    if (options.getChannel('new_channel')) ad.channelId = options.getChannel('new_channel').id;
    if (options.getInteger('new_interval')) ad.interval = options.getInteger('new_interval');
    if (options.getString('new_color')) ad.color = options.getString('new_color');

    startAdLoop(name);
    await interaction.reply({ content: `✅ Ad **${name}** updated and restarted!`, ephemeral: true });
  }

  // --- الأوامر الأخرى ---
  if (commandName === 'send') {
    const text = options.getString('message');
    const time = options.getInteger('time');
    const sentMsg = await channel.send(text).catch(() => {});
    await interaction.reply({ content: `✅ Sent!`, ephemeral: true });
    if (time > 0 && sentMsg) setTimeout(() => sentMsg.delete().catch(() => {}), time * 60 * 1000);
  }

  if (commandName === 'info') { updateLiveInfo(guild); await interaction.reply({ content: '✅ Info updated!', ephemeral: true }); }
  if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);
});

// --- Welcome & Live Info (نفس الكود السابق) ---
client.on('guildMemberAdd', async (member) => {
    try {
        const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
        if (role) await member.roles.add(role);
    } catch (e) {}
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
        const welcomeEmbed = new EmbedBuilder().setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() }).setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n\n→ <#1482874761951576228> | <#1484639863411183636>`).setColor('#00ff00').setTimestamp();
        const sentMsg = await welcomeChannel.send({ content: `${member}`, embeds: [welcomeEmbed] }).catch(() => {});
        if (sentMsg) setTimeout(() => sentMsg.delete().catch(() => {}), 86400000);
    }
    updateLiveInfo(member.guild);
});

async function updateLiveInfo(guild) {
  if (!guild) guild = client.guilds.cache.first();
  const channel = client.channels.cache.get(INFO_CHANNEL_ID);
  if (!channel || !guild) return;
  const createdAt = guild.createdAt.toLocaleDateString('en-GB');
  const info = `@everyone\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@1134146616857731173>\n• Total Members: ${guild.memberCount}\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`;
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit(info); else await channel.send(info);
  } catch (e) {}
}

client.login(process.env.TOKEN);

