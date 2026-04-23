const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType 
} = require('discord.js');
const express = require('express');
const app = express();

// استضافة البوت
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

// --- الإعدادات الثابتة ---
const CONFIG = {
    WELCOME_CH: '1482881348204101768',
    INFO_CH: '1484639863411183636',
    AUTO_ROLE: '1482883802186514615',
    OWNER_ID: '1134146616857731173',
    BOT_ID: '1495419259147386920'
};

// قائمة الكلمات الممنوعة (تقدر تزيد عليها)
const badWords = ['شتيمة1', 'شتيمة2', 'badword1']; 
const userViolations = new Map();

// --- تعريف الأوامر ---
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clean chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Mute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('Unmute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('Kick member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Ban member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
    
    new SlashCommandBuilder().setName('send')
        .setDescription('Send a custom message')
        .addStringOption(o => o.setName('message').setDescription('Content').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Send after (minutes) - 0 for instant').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Delete after (minutes) - 0 for never').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Box color (Hex)').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'})),

    new SlashCommandBuilder().setName('vote')
        .setDescription('Start a poll with buttons')
        .addStringOption(o => o.setName('question').setDescription('The question').setRequired(true)),
].map(c => c.toJSON());

// --- تشغيل البوت ---
client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ System Active: ${client.user.tag}`);
    } catch (e) { console.error(e); }
    updateLiveInfo();
});

// --- نظام الحماية من الشتائم ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase();
    const hasBadWord = badWords.some(word => content.includes(word));

    if (hasBadWord) {
        await message.delete().catch(() => {});
        const count = (userViolations.get(message.author.id) || 0) + 1;
        userViolations.set(message.author.id, count);

        if (count >= 2) {
            await message.member.timeout(10 * 60 * 60 * 1000, 'Bad words repetition');
            message.channel.send(`⚠️ <@${message.author.id}> has been muted for 10 hours for repeated bad words.`);
            userViolations.delete(message.author.id);
        } else {
            const warning = await message.channel.send(`🚫 <@${message.author.id}>, Bad words are not allowed!`);
            setTimeout(() => warning.delete().catch(() => {}), 5000);
        }
    }
});

// --- التفاعل مع الأوامر ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel, guild, member } = interaction;

    if (commandName === 'send') {
        const text = options.getString('message');
        const style = options.getString('style');
        const dSend = options.getInteger('delay_send');
        const dDelete = options.getInteger('delete_after');
        const color = options.getString('color') || '#3498db';

        await interaction.reply({ content: `Processing... will send in ${dSend} min.`, ephemeral: true });

        setTimeout(async () => {
            let sentMsg;
            if (style === 'embed') {
                const emb = new EmbedBuilder().setDescription(text).setColor(color);
                sentMsg = await channel.send({ embeds: [emb] });
            } else {
                sentMsg = await channel.send(text);
            }

            if (dDelete > 0) {
                setTimeout(() => sentMsg.delete().catch(() => {}), dDelete * 60000);
            }
        }, dSend * 60000);
    }

    if (commandName === 'vote') {
        const q = options.getString('question');
        const emb = new EmbedBuilder().setTitle('📊 Community Vote').setDescription(q).setColor('#f1c40f').setFooter({text: `Started by ${member.user.username}`});
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ embeds: [emb], components: [row] });
    }

    // أوامر الإدارة الأساسية
    if (commandName === 'clear') {
        const amt = options.getInteger('amount');
        await channel.bulkDelete(Math.min(amt, 100));
        await interaction.reply({ content: `Cleared ${amt} messages.`, ephemeral: true });
    }
    if (commandName === 'mute') {
        const t = options.getMember('target');
        const d = options.getInteger('duration');
        await t.timeout(d * 60000);
        await interaction.reply(`Muted ${t} for ${d} minutes.`);
    }
    if (commandName === 'unmute') {
        await options.getMember('target').timeout(null);
        await interaction.reply(`Unmuted!`);
    }
});

// --- الترحيب و Auto Role ---
client.on('guildMemberAdd', async (member) => {
    // رتبة تلقائية
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE);
    if (role) await member.roles.add(role).catch(() => {});

    // رسالة الترحيب
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeText = `<@${member.id}>\n𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1484639863411183636>\n[¡}================{!}================[¡}\nThank you! ❤️`;
        const welcomeMsg = await welcomeCh.send(welcomeText);
        
        // مسح بعد 24 ساعة
        setTimeout(() => welcomeMsg.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

// تحديث Live Info عند الخروج
client.on('guildMemberRemove', (member) => updateLiveInfo(member.guild));

// --- Live Info Function ---
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;

    const infoEmbed = new EmbedBuilder()
        .setDescription(`@everyone\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#3498db');

    const msgs = await infoCh.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);

    if (botMsg) await botMsg.edit({ content: '', embeds: [infoEmbed] });
    else await infoCh.send({ embeds: [infoEmbed] });
}

client.login(process.env.TOKEN);
