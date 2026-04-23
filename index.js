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

const badWordsPattern = [/كسم/i, /متناك/i, /شرموط/i, /خول/i, /عرص/i, /fuck/i, /shit/i, /ksm/i];
const dangerousExts = [".exe", ".bat", ".scr", ".sh", ".vbs", ".msi", ".com", ".cmd"]; 
const scamKeywords = ["free nitro", "discord.gift", "gift for you", "nitro free"];
const userViolations = new Map();
const adsStorage = new Map();

const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clean chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Mute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('Unmute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
    new SlashCommandBuilder().setName('translate').setDescription('Translate text').addStringOption(o => o.setName('text').setDescription('Content').setRequired(true)).addStringOption(o => o.setName('to').setDescription('Language code').setRequired(true)),
    
    // نظام الإعلانات
    new SlashCommandBuilder().setName('ads_set').setDescription('Set auto advertisement')
        .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Ad Content').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Select Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('Every X minutes').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('Auto-delete msg after X mins').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('ads_edit').setDescription('Edit an advertisement')
        .addStringOption(o => o.setName('name').setDescription('Ad Name to edit').setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder().setName('send').setDescription('Send custom message').addStringOption(o => o.setName('message').setDescription('Content').setRequired(true)).addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})).addIntegerOption(o => o.setName('delay_send').setDescription('Minutes to wait').setRequired(true)).addIntegerOption(o => o.setName('delete_after').setDescription('Minutes until delete').setRequired(true)).addStringOption(o => o.setName('color').setDescription('Box color').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'})),
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

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild || message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const content = message.content.toLowerCase();
    if (badWordsPattern.some(p => p.test(content)) || /(https?:\/\/[^\s]+)/g.test(content) || scamKeywords.some(k => content.includes(k)) || message.attachments.some(file => dangerousExts.some(ext => file.name.toLowerCase().endsWith(ext)))) {
        await message.delete().catch(() => {});
        const count = (userViolations.get(message.author.id) || 0) + 1;
        userViolations.set(message.author.id, count);
        if (count >= 2) {
            await message.member.timeout(24 * 60 * 60 * 1000, "Protection Violation").catch(() => {});
            message.channel.send(`⚠️ <@${message.author.id}> تم إسكاتك 24 ساعة.`);
            userViolations.delete(message.author.id);
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const choices = Array.from(adsStorage.keys());
        const filtered = choices.filter(choice => choice.startsWith(focusedValue));
        await interaction.respond(filtered.map(c => ({ name: c, value: c })));
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, channel } = interaction;

    if (commandName === 'ads_set') {
        const name = options.getString('name');
        const data = {
            name, text: options.getString('text'), channelId: options.getChannel('channel').id,
            interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'),
            style: options.getString('style'), timer: null, lastMsgId: null
        };
        adsStorage.set(name, data);
        startAdLoop(name, guild.id);
        await interaction.reply({ content: `✅ Ad **${name}** has been started.`, ephemeral: true });
    }

    if (commandName === 'ads_edit') {
        const name = options.getString('name');
        if (!adsStorage.has(name)) return interaction.reply({ content: "❌ Ad not found.", ephemeral: true });
        // هنا تم حذف زر الـ delete بناءً على طلبك
        await interaction.reply({ content: `Editing options for **${name}** (Management Panel)`, ephemeral: true });
    }

    if (commandName === 'translate') {
        const text = options.getString('text');
        const to = options.getString('to').toLowerCase();
        await interaction.deferReply();
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURI(text)}`);
        const json = await res.json();
        const result = json[0].map(i => i[0]).join('');
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🌐 Translation').setDescription(result).setColor('#4285F4')] });
    }

    if (commandName === 'clear') {
        await channel.bulkDelete(Math.min(options.getInteger('amount'), 100));
        await interaction.reply({ content: 'Done.', ephemeral: true });
    }
    
    if (commandName === 'vote') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Vote').setDescription(options.getString('question')).setColor('#f1c40f')], components: [row] });
    }
});

client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE);
    if (role) await member.roles.add(role).catch(() => {});
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder()
            .setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1484639863411183636>\n[¡}================{!}================[¡}\nThank you! ❤️`)
            .setColor('#3498db');
        const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] });
        setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

client.on('guildMemberRemove', (member) => updateLiveInfo(member.guild));

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;

    const infoEmbed = new EmbedBuilder()
        .setDescription(`[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#3498db');

    const msgs = await infoCh.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit({ content: '@everyone', embeds: [infoEmbed] });
    else await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
}

client.login(process.env.TOKEN);
