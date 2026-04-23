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

// --- إعدادات الأيدي (IDs) ---
const WELCOME_CHANNEL_ID = '1482881348204101768';
const INFO_CHANNEL_ID = '1484639863411183636';
const MEMBER_ROLE_ID = '1482883802186514615';

const adsStorage = new Map();

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
  
  // نظام الإعلانات
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

  new SlashCommandBuilder()
    .setName('ads_stop')
    .setDescription('Stop a specific ad and clean a channel')
    .addStringOption(opt => opt.setName('name').setDescription('Name of the ad').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to stop it in').addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder()
    .setName('ads_enable')
    .setDescription('Enable a stopped ad')
    .addStringOption(opt => opt.setName('name').setDescription('Name of the ad').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to run in').addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder()
    .setName('ads_edit')
    .setDescription('Edit an existing ad')
    .addStringOption(opt => opt.setName('name').setDescription('Current ad name').setRequired(true))
    .addStringOption(opt => opt.setName('new_name').setDescription('New name'))
    .addStringOption(opt => opt.setName('new_text').setDescription('New text'))
    .addChannelOption(opt => opt.setName('new_channel').setDescription('New channel'))
    .addIntegerOption(opt => opt.setName('new_interval').setDescription('New time interval'))
    .addStringOption(opt => opt.setName('new_style').setDescription('Box or Normal').addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal Text', value: 'normal' })),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send message with style and color')
    .addStringOption(opt => opt.setName('message').setDescription('Message text').setRequired(true))
    .addStringOption(opt => opt.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({ name: 'Box (Embed)', value: 'embed' }, { name: 'Normal Text', value: 'normal' }))
    .addStringOption(opt => opt.setName('color').setDescription('Color if box').addChoices({ name: 'Blue', value: '#3498db' }, { name: 'Green', value: '#2ecc71' }, { name: 'Red', value: '#e74c3c' }))
    .addIntegerOption(opt => opt.setName('time').setDescription('Delete after (minutes)').setRequired(true)),
].map(command => command.toJSON());

function startAdLoop(adName) {
    const ad = adsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);
    ad.timer = setInterval(async () => {
        const chan = client.channels.cache.get(ad.channelId);
        if (!chan) return;
        if (ad.lastMsgId) {
            const old = await chan.messages.fetch(ad.lastMsgId).catch(() => null);
            if (old) await old.delete().catch(() => {});
        }
        let sent;
        if (ad.style === 'embed') {
            const emb = new EmbedBuilder().setTitle(`📢 ${ad.name}`).setDescription(ad.text).setColor(ad.color).setTimestamp();
            sent = await chan.send({ embeds: [emb] }).catch(() => {});
        } else {
            sent = await chan.send({ content: `**📢 ${ad.name}**\n\n${ad.text}` }).catch(() => {});
        }
        if (sent) {
            ad.lastMsgId = sent.id;
            if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60 * 1000);
        }
    }, ad.interval * 60 * 1000);
}

client.on('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
    updateLiveInfo();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, channel, member } = interaction;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (commandName === 'ads_set') {
        if (!isAdmin) return interaction.reply({ content: "No permission!", ephemeral: true });
        const name = options.getString('name');
        adsStorage.set(name, { name, text: options.getString('text'), channelId: options.getChannel('channel').id, style: options.getString('style'), color: options.getString('color'), interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'), timer: null, lastMsgId: null });
        startAdLoop(name);
        await interaction.reply({ content: `✅ Ad ${name} set!`, ephemeral: true });
    }

    if (commandName === 'ads_stop') {
        const name = options.getString('name');
        const chan = options.getChannel('channel');
        const ad = adsStorage.get(name);
        if (ad) {
            if (ad.timer) clearInterval(ad.timer);
            const msgs = await chan.messages.fetch({ limit: 20 });
            msgs.filter(m => m.author.id === client.user.id && (m.content.includes(name) || m.embeds[0]?.title?.includes(name))).forEach(m => m.delete().catch(() => {}));
            await interaction.reply({ content: `🛑 Ad ${name} stopped in <#${chan.id}>`, ephemeral: true });
        } else await interaction.reply({ content: "Not found!", ephemeral: true });
    }

    if (commandName === 'ads_edit') {
        const name = options.getString('name');
        const ad = adsStorage.get(name);
        if (!ad) return interaction.reply({ content: "Ad not found!", ephemeral: true });
        if (options.getString('new_name')) {
            const nName = options.getString('new_name');
            adsStorage.set(nName, ad); adsStorage.delete(name); ad.name = nName;
        }
        if (options.getString('new_text')) ad.text = options.getString('new_text');
        if (options.getChannel('new_channel')) ad.channelId = options.getChannel('new_channel').id;
        if (options.getInteger('new_interval')) ad.interval = options.getInteger('new_interval');
        if (options.getString('new_style')) ad.style = options.getString('new_style');
        startAdLoop(ad.name);
        await interaction.reply({ content: "✅ Ad updated!", ephemeral: true });
    }

    if (commandName === 'ads_enable') {
        const name = options.getString('name');
        const ad = adsStorage.get(name);
        if (ad) {
            ad.channelId = options.getChannel('channel').id;
            startAdLoop(name);
            await interaction.reply({ content: "✅ Ad enabled!", ephemeral: true });
        } else await interaction.reply({ content: "Not found!", ephemeral: true });
    }

    if (commandName === 'send') {
        const msg = options.getString('message');
        const style = options.getString('style');
        const col = options.getString('color') || '#3498db';
        const time = options.getInteger('time');
        let sMsg;
        if (style === 'embed') {
            const emb = new EmbedBuilder().setDescription(msg).setColor(col);
            sMsg = await channel.send({ embeds: [emb] });
        } else sMsg = await channel.send(msg);
        await interaction.reply({ content: "Sent!", ephemeral: true });
        if (time > 0) setTimeout(() => sMsg.delete().catch(() => {}), time * 60 * 1000);
    }

    // الأوامر الأساسية
    if (commandName === 'clear') {
        const amt = options.getInteger('amount');
        await channel.bulkDelete(Math.min(amt, 100));
        await interaction.reply({ content: `Deleted ${amt}!`, ephemeral: true });
    }
    if (commandName === 'vote') {
        const q = options.getString('question');
        const emb = new EmbedBuilder().setTitle('Vote!').setDescription(q).setColor('#3498db');
        const m = await interaction.reply({ embeds: [emb], fetchReply: true });
        await m.react('✅'); await m.react('❌');
    }
    if (commandName === 'kick') { await options.getMember('target').kick(); await interaction.reply('Kicked! 🦶'); }
    if (commandName === 'ban') { await guild.members.ban(options.getUser('target')); await interaction.reply('Banned! 🚫'); }
    if (commandName === 'mute') { await options.getMember('target').timeout(options.getInteger('duration') * 60000); await interaction.reply('Muted! 🔇'); }
    if (commandName === 'unmute') { await options.getMember('target').timeout(null); await interaction.reply('Unmuted! 🔊'); }
    if (commandName === 'ping') await interaction.reply(`🏓 Pong! \`${client.ws.ping}ms\``);
    if (commandName === 'server') {
        const emb = new EmbedBuilder().setTitle(guild.name).setThumbnail(guild.iconURL()).addFields({ name: 'Members', value: `${guild.memberCount}` }).setColor('#f1c40f');
        await interaction.reply({ embeds: [emb] });
    }
    if (commandName === 'info') { updateLiveInfo(guild); await interaction.reply('Updated!'); }
});

client.on('guildMemberAdd', async (m) => {
    try { const r = m.guild.roles.cache.get(MEMBER_ROLE_ID); if (r) await m.roles.add(r); } catch(e) {}
    const c = m.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (c) {
        const emb = new EmbedBuilder().setDescription(`Welcome <@${m.id}>!`).setColor('#00ff00');
        const s = await c.send({ content: `${m}`, embeds: [emb] });
        setTimeout(() => s.delete().catch(() => {}), 86400000);
    }
    updateLiveInfo(m.guild);
});

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const c = client.channels.cache.get(INFO_CHANNEL_ID);
    if (!c || !guild) return;
    const info = `**Server Info:**\n• Members: ${guild.memberCount}`;
    const msgs = await c.messages.fetch({ limit: 5 });
    const m = msgs.find(msg => msg.author.id === client.user.id);
    if (m) await m.edit(info); else await c.send(info);
}

client.login(process.env.TOKEN);

