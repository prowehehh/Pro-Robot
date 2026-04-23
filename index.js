const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType 
} = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

app.get('/', (req, res) => res.send('Pro Security System is Online! 🛡️'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

const CONFIG = {
    WELCOME_CH: '1482881348204101768',
    INFO_CH: '1484639863411183636',
    AUTO_ROLE: '1482883802186514615',
    OWNER_ID: '1134146616857731173',
    BOT_ID: '1495419259147386920'
};

const adsStorage = new Map();

const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clean chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    
    // أمر الإرسال (Send) اللي رجعناه
    new SlashCommandBuilder().setName('send').setDescription('Send custom message')
        .addStringOption(o => o.setName('message').setDescription('Content').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Minutes to wait').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Minutes until delete').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Box color').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'})),

    new SlashCommandBuilder().setName('ads_set').setDescription('Set auto advertisement')
        .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Ad Content').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Select Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('Every X minutes').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('Auto-delete msg after X mins').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('ads_edit').setDescription('Edit/Delete an advertisement')
        .addStringOption(o => o.setName('name').setDescription('Select Ad Name').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('text').setDescription('New Content (Optional)').setRequired(false))
        .addChannelOption(o => o.setName('channel').setDescription('New Channel (Optional)').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addIntegerOption(o => o.setName('interval').setDescription('New Interval (Optional)').setRequired(false))
        .addIntegerOption(o => o.setName('delete').setDescription('New Delete Time (Optional)').setRequired(false))
        .addStringOption(o => o.setName('style').setDescription('New Style (Optional)').setRequired(false).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('translate').setDescription('Translate text').addStringOption(o => o.setName('text').setDescription('Content').setRequired(true)).addStringOption(o => o.setName('to').setDescription('Language code').setRequired(true)),
    new SlashCommandBuilder().setName('vote').setDescription('Start a poll').addStringOption(o => o.setName('question').setDescription('The question').setRequired(true)),
].map(c => c.toJSON());

function startAdLoop(adName, guildId) {
    const ad = adsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);
    ad.timer = setInterval(async () => {
        const guild = client.guilds.cache.get(guildId);
        const chan = guild?.channels.cache.get(ad.channelId);
        if (!chan) return;
        if (ad.lastMsgId) {
            const old = await chan.messages.fetch(ad.lastMsgId).catch(() => null);
            if (old) await old.delete().catch(() => {});
        }
        let sent;
        if (ad.style === 'embed') {
            sent = await chan.send({ embeds: [new EmbedBuilder().setDescription(ad.text).setColor('#3498db').setTitle(`📢 ${ad.name}`)] }).catch(() => {});
        } else {
            sent = await chan.send(`**📢 ${ad.name}**\n\n${ad.text}`).catch(() => {});
        }
        if (sent) {
            ad.lastMsgId = sent.id;
            if (ad.deleteAfter > 0) setTimeout(() => sent.delete().catch(() => {}), ad.deleteAfter * 60000);
        }
    }, ad.interval * 60000);
}

client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
    updateLiveInfo();
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const choices = Array.from(adsStorage.keys());
        const filtered = choices.filter(choice => choice.startsWith(focusedValue));
        await interaction.respond(filtered.map(c => ({ name: c, value: c }))).catch(() => {});
    }

    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, channel } = interaction;

        // تنفيذ أمر Send
        if (commandName === 'send') {
            const msg = options.getString('message');
            const style = options.getString('style');
            const delay = options.getInteger('delay_send');
            const delAfter = options.getInteger('delete_after');
            const color = options.getString('color') || '#3498db';

            await interaction.reply({ content: `⏱️ سيتم إرسال الرسالة بعد ${delay} دقيقة.`, ephemeral: true });

            setTimeout(async () => {
                let sent;
                if (style === 'embed') {
                    sent = await channel.send({ embeds: [new EmbedBuilder().setDescription(msg).setColor(color)] }).catch(() => {});
                } else {
                    sent = await channel.send(msg).catch(() => {});
                }
                if (sent && delAfter > 0) {
                    setTimeout(() => sent.delete().catch(() => {}), delAfter * 60000);
                }
            }, delay * 60000);
        }

        if (commandName === 'ads_set') {
            const name = options.getString('name');
            const data = {
                name, text: options.getString('text'), channelId: options.getChannel('channel').id,
                interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'),
                style: options.getString('style'), timer: null, lastMsgId: null
            };
            adsStorage.set(name, data);
            startAdLoop(name, guild.id);
            await interaction.reply({ content: `✅ Ad **${name}** started.`, ephemeral: true });
        }

        if (commandName === 'ads_edit') {
            const name = options.getString('name');
            const ad = adsStorage.get(name);
            if (!ad) return interaction.reply({ content: "❌ Ad not found.", ephemeral: true });

            if (options.getString('text')) ad.text = options.getString('text');
            if (options.getChannel('channel')) ad.channelId = options.getChannel('channel').id;
            if (options.getInteger('interval')) ad.interval = options.getInteger('interval');
            if (options.getInteger('delete') !== null) ad.deleteAfter = options.getInteger('delete');
            if (options.getString('style')) ad.style = options.getString('style');

            startAdLoop(name, guild.id);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`stop_ad_${name}`).setLabel('Delete Ad Forever 🗑️').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ 
                content: `⚙️ Ad **${name}** updated!`, 
                components: [row], 
                ephemeral: true 
            });
        }

        if (commandName === 'clear') {
            await channel.bulkDelete(Math.min(options.getInteger('amount'), 100)).catch(() => {});
            await interaction.reply({ content: 'Done.', ephemeral: true });
        }
        
        if (commandName === 'translate') {
            await interaction.deferReply();
            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${options.getString('to').toLowerCase()}&dt=t&q=${encodeURI(options.getString('text'))}`);
            const json = await res.json();
            const result = json[0].map(i => i[0]).join('');
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🌐 Translation').setDescription(result).setColor('#4285F4')] });
        }
    } 

    else if (interaction.isButton()) {
        if (interaction.customId.startsWith('stop_ad_')) {
            const name = interaction.customId.replace('stop_ad_', '');
            const ad = adsStorage.get(name);
            if (ad) {
                if (ad.timer) clearInterval(ad.timer);
                adsStorage.delete(name);
                await interaction.reply({ content: `🗑️ Ad **${name}** deleted.`, ephemeral: true });
            }
        }
    }
});

// --- Info & Welcome ---
client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE);
    if (role) await member.roles.add(role).catch(() => {});
    updateLiveInfo(member.guild);
});

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;
    const infoEmbed = new EmbedBuilder().setDescription(`[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Total Members: ${guild.memberCount}\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`).setColor('#3498db');
    const msgs = await infoCh.messages.fetch({ limit: 10 }).catch(() => null);
    if (msgs) {
        const botMsg = msgs.find(m => m.author.id === client.user.id);
        if (botMsg) await botMsg.edit({ embeds: [infoEmbed] });
        else await infoCh.send({ embeds: [infoEmbed] });
    }
}

client.login(process.env.TOKEN);
