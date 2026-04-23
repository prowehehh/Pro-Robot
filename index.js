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

// --- قائمة الأوامر كاملة ومحدثة ---
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
  new SlashCommandBuilder().setName('info').setDescription('Update info'),
  new SlashCommandBuilder().setName('server').setDescription('Server info'),
  new SlashCommandBuilder().setName('vote').setDescription('Create vote').addStringOption(o => o.setName('question').setDescription('Question').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Delete msgs').addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  
  // أوامر الإعلانات
  new SlashCommandBuilder()
    .setName('ads_set')
    .setDescription('Set Ad')
    .addStringOption(o => o.setName('name').setDescription('Name').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('style').setDescription('Box/Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
    .addStringOption(o => o.setName('color').setDescription('Color').setRequired(true).addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'}))
    .addIntegerOption(o => o.setName('interval').setDescription('Minutes').setRequired(true))
    .addIntegerOption(o => o.setName('delete').setDescription('Delete after').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ads_stop')
    .setDescription('Stop Ad')
    .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to clean').addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder()
    .setName('ads_enable')
    .setDescription('Enable Ad')
    .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder()
    .setName('ads_edit')
    .setDescription('Edit Ad')
    .addStringOption(o => o.setName('name').setDescription('Target Name').setRequired(true))
    .addStringOption(o => o.setName('new_name').setDescription('New Name'))
    .addStringOption(o => o.setName('new_text').setDescription('New Text'))
    .addChannelOption(o => o.setName('new_channel').setDescription('New Channel').addChannelTypes(ChannelType.GuildText))
    .addIntegerOption(o => o.setName('new_interval').setDescription('New Time'))
    .addStringOption(o => o.setName('new_style').setDescription('Style').addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send styled message')
    .addStringOption(o => o.setName('message').setDescription('Text').setRequired(true))
    .addStringOption(o => o.setName('style').setDescription('Box/Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
    .addStringOption(o => o.setName('color').setDescription('Color').addChoices({name:'Blue',value:'#3498db'},{name:'Green',value:'#2ecc71'}))
    .addIntegerOption(o => o.setName('time').setDescription('Delete after').setRequired(true)),
].map(c => c.toJSON());

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
            const emb = new EmbedBuilder().setTitle(`📢 ${ad.name}`).setDescription(ad.text).setColor(ad.color);
            sent = await chan.send({ embeds: [emb] }).catch(() => {});
        } else {
            sent = await chan.send({ content: `**📢 ${ad.name}**\n\n${ad.text}` }).catch(() => {});
        }
        if (sent) {
            ad.lastMsgId = sent.id;
            if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60000);
        }
    }, ad.interval * 60000);
}

client.on('ready', async () => {
    console.log(`${client.user.tag} Online!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Commands Updated! ✅');
    } catch (e) { console.error(e); }
    updateLiveInfo();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, channel, member } = interaction;
    const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (commandName === 'ads_set') {
        if (!isAdmin) return interaction.reply({ content: "No Perms!", ephemeral: true });
        const name = options.getString('name');
        adsStorage.set(name, { name, text: options.getString('text'), channelId: options.getChannel('channel').id, style: options.getString('style'), color: options.getString('color'), interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'), timer: null, lastMsgId: null });
        startAdLoop(name);
        await interaction.reply({ content: `Ad ${name} started!`, ephemeral: true });
    }

    if (commandName === 'ads_stop') {
        const name = options.getString('name');
        const chan = options.getChannel('channel');
        const ad = adsStorage.get(name);
        if (ad) {
            if (ad.timer) clearInterval(ad.timer);
            const msgs = await chan.messages.fetch({ limit: 50 }).catch(() => []);
            msgs.filter(m => m.author.id === client.user.id && (m.content?.includes(name) || m.embeds[0]?.title?.includes(name))).forEach(m => m.delete().catch(() => {}));
            await interaction.reply({ content: `Stopped ${name} in <#${chan.id}>`, ephemeral: true });
        } else await interaction.reply({ content: "Not found!", ephemeral: true });
    }

    if (commandName === 'ads_edit') {
        const name = options.getString('name');
        const ad = adsStorage.get(name);
        if (!ad) return interaction.reply({ content: "Not found!", ephemeral: true });
        if (options.getString('new_name')) { const n = options.getString('new_name'); adsStorage.set(n, ad); adsStorage.delete(name); ad.name = n; }
        if (options.getString('new_text')) ad.text = options.getString('new_text');
        if (options.getChannel('new_channel')) ad.channelId = options.getChannel('new_channel').id;
        if (options.getInteger('new_interval')) ad.interval = options.getInteger('new_interval');
        if (options.getString('new_style')) ad.style = options.getString('new_style');
        startAdLoop(ad.name);
        await interaction.reply({ content: "Updated!", ephemeral: true });
    }

    if (commandName === 'ads_enable') {
        const name = options.getString('name');
        const ad = adsStorage.get(name);
        if (ad) {
            ad.channelId = options.getChannel('channel').id;
            startAdLoop(name);
            await interaction.reply({ content: "Enabled!", ephemeral: true });
        } else await interaction.reply({ content: "Not found!", ephemeral: true });
    }

    if (commandName === 'send') {
        const msg = options.getString('message');
        const style = options.getString('style');
        const col = options.getString('color') || '#3498db';
        const time = options.getInteger('time');
        let s;
        if (style === 'embed') { s = await channel.send({ embeds: [new EmbedBuilder().setDescription(msg).setColor(col)] }); } 
        else { s = await channel.send(msg); }
        await interaction.reply({ content: "Sent!", ephemeral: true });
        if (time > 0) setTimeout(() => s.delete().catch(() => {}), time * 60000);
    }

    // الأوامر الأساسية
    if (commandName === 'clear') { await channel.bulkDelete(Math.min(options.getInteger('amount'), 100)); await interaction.reply({content:'Done',ephemeral:true}); }
    if (commandName === 'kick') { await options.getMember('target').kick(); await interaction.reply('Kicked!'); }
    if (commandName === 'ban') { await guild.members.ban(options.getUser('target')); await interaction.reply('Banned!'); }
    if (commandName === 'mute') { await options.getMember('target').timeout(options.getInteger('duration') * 60000); await interaction.reply('Muted!'); }
    if (commandName === 'unmute') { await options.getMember('target').timeout(null); await interaction.reply('Unmuted!'); }
    if (commandName === 'vote') {
        const m = await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Vote').setDescription(options.getString('question'))], fetchReply: true });
        await m.react('✅'); await m.react('❌');
    }
    if (commandName === 'server') { await interaction.reply({ embeds: [new EmbedBuilder().setTitle(guild.name).addFields({name:'Members',value:`${guild.memberCount}`})] }); }
});

client.on('guildMemberAdd', async (m) => {
    try { const r = m.guild.roles.cache.get(MEMBER_ROLE_ID); if (r) await m.roles.add(r); } catch(e) {}
    updateLiveInfo(m.guild);
});

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const c = client.channels.cache.get(INFO_CHANNEL_ID);
    if (!c || !guild) return;
    const info = `**Server Members:** ${guild.memberCount}`;
    const msgs = await c.messages.fetch({ limit: 5 });
    const m = msgs.find(msg => msg.author.id === client.user.id);
    if (m) await m.edit(info); else await c.send(info);
}

client.login(process.env.TOKEN);

