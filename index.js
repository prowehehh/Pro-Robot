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

// --- إعدادات الحماية ---
const badWordsPattern = [/كسم/i, /متناك/i, /شرموط/i, /خول/i, /عرص/i, /fuck/i, /shit/i, /ksm/i];
const dangerousExts = [".exe", ".bat", ".scr", ".sh", ".vbs", ".msi", ".com", ".cmd"]; 
const scamKeywords = ["free nitro", "discord.gift", "gift for you", "nitro free"];
const userViolations = new Map();

const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clean chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Mute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('Unmute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
    new SlashCommandBuilder().setName('translate').setDescription('Translate text').addStringOption(o => o.setName('text').setDescription('Content').setRequired(true)).addStringOption(o => o.setName('to').setDescription('Language code').setRequired(true)),
    new SlashCommandBuilder().setName('send').setDescription('Send custom message').addStringOption(o => o.setName('message').setDescription('Content').setRequired(true)).addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})).addIntegerOption(o => o.setName('delay_send').setDescription('Minutes to wait').setRequired(true)).addIntegerOption(o => o.setName('delete_after').setDescription('Minutes until delete').setRequired(true)).addStringOption(o => o.setName('color').setDescription('Box color').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'})),
    new SlashCommandBuilder().setName('vote').setDescription('Start a poll').addStringOption(o => o.setName('question').setDescription('The question').setRequired(true)),
].map(c => c.toJSON());

client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
    updateLiveInfo();
});

// --- نظام الحماية ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild || message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const content = message.content.toLowerCase();
    if (badWordsPattern.some(p => p.test(content)) || /(https?:\/\/[^\s]+)/g.test(content) || scamKeywords.some(k => content.includes(k))) {
        await message.delete().catch(() => {});
    }
});

// --- التفاعل مع الأوامر ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel } = interaction;

    try {
        if (commandName === 'clear') {
            await channel.bulkDelete(Math.min(options.getInteger('amount'), 100));
            await interaction.reply({ content: 'Done.', ephemeral: true });
        }
        if (commandName === 'mute') {
            await options.getMember('target').timeout(options.getInteger('duration') * 60000);
            await interaction.reply(`Muted.`);
        }
        if (commandName === 'unmute') {
            await options.getMember('target').timeout(null);
            await interaction.reply(`Unmuted.`);
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
        if (commandName === 'vote') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Vote').setDescription(options.getString('question')).setColor('#f1c40f')], components: [row] });
        }
    } catch (e) { console.error(e); }
});

// --- الترحيب (داخل مربع ويتمسح بعد 24 ساعة) ---
client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE);
    if (role) await member.roles.add(role).catch(() => {});

    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder()
            .setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1484639863411183636>\n[¡}================{!}================[¡}\nThank you! ❤️`)
            .setColor('#3498db');

        const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] });
        
        // حذف الرسالة بعد 24 ساعة
        setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

client.on('guildMemberRemove', (member) => updateLiveInfo(member.guild));

// --- تحديث الـ Info (داخل مربع) ---
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;

    const infoEmbed = new EmbedBuilder()
        .setDescription(`[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#3498db');

    try {
        const msgs = await infoCh.messages.fetch({ limit: 10 });
        const botMsg = msgs.find(m => m.author.id === client.user.id);

        if (botMsg) await botMsg.edit({ content: '@everyone', embeds: [infoEmbed] });
        else await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
    } catch (e) { console.error(e); }
}

client.login(process.env.TOKEN);
