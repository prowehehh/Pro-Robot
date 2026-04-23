const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType 
} = require('discord.js');
const express = require('express');
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

const badWords = ['شتيمة1', 'شتيمة2']; 
const userViolations = new Map();
const adsStorage = new Map(); // تخزين الإعلانات النشطة

const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clean chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Mute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('Unmute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
    
    // أمر الإرسال المطور
    new SlashCommandBuilder().setName('send')
        .setDescription('Send a custom message')
        .addStringOption(o => o.setName('message').setDescription('Content').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Send after (minutes)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Delete after (minutes)').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Box color').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'})),

    new SlashCommandBuilder().setName('vote').setDescription('Start a poll with buttons').addStringOption(o => o.setName('question').setDescription('The question').setRequired(true)),

    // أوامر نظام الإعلانات
    new SlashCommandBuilder().setName('ads_set').setDescription('Set auto advertisement')
        .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Ad Content').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Select Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('Every X minutes').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('Delete after X minutes').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('ads_stop').setDescription('Stop an ad')
        .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true)),

    new SlashCommandBuilder().setName('ads_edit').setDescription('Edit an ad text')
        .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
        .addStringOption(o => o.setName('new_text').setDescription('New Content').setRequired(true)),

].map(c => c.toJSON());

// دالة تشغيل حلقة الإعلان
function startAdLoop(adName, guildId) {
    const ad = adsStorage.get(adName);
    if (!ad) return;
    if (ad.timer) clearInterval(ad.timer);

    ad.timer = setInterval(async () => {
        const guild = client.guilds.cache.get(guildId);
        const chan = guild?.channels.cache.get(ad.channelId);
        if (!chan) return;

        // حذف الرسالة القديمة إن وجدت
        if (ad.lastMsgId) {
            const old = await chan.messages.fetch(ad.lastMsgId).catch(() => null);
            if (old) await old.delete().catch(() => {});
        }

        let sent;
        if (ad.style === 'embed') {
            const emb = new EmbedBuilder().setDescription(ad.text).setColor('#3498db').setTitle(`📢 ${ad.name}`);
            sent = await chan.send({ embeds: [emb] }).catch(() => {});
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
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ System Active: ${client.user.tag}`);
    } catch (e) { console.error(e); }
    updateLiveInfo();
});

// نظام الحماية
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const hasBadWord = badWords.some(word => message.content.toLowerCase().includes(word));
    if (hasBadWord) {
        await message.delete().catch(() => {});
        const count = (userViolations.get(message.author.id) || 0) + 1;
        userViolations.set(message.author.id, count);
        if (count >= 2) {
            await message.member.timeout(10 * 60 * 60 * 1000, 'Repeated bad words');
            message.channel.send(`⚠️ <@${message.author.id}> has been muted for 10 hours.`);
            userViolations.delete(message.author.id);
        } else {
            const warn = await message.channel.send(`🚫 <@${message.author.id}>, No bad words!`);
            setTimeout(() => warn.delete().catch(() => {}), 5000);
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel, guild } = interaction;

    if (commandName === 'ads_set') {
        const name = options.getString('name');
        const adData = {
            name,
            text: options.getString('text'),
            channelId: options.getChannel('channel').id,
            interval: options.getInteger('interval'),
            deleteAfter: options.getInteger('delete'),
            style: options.getString('style'),
            timer: null,
            lastMsgId: null
        };
        adsStorage.set(name, adData);
        startAdLoop(name, guild.id);
        await interaction.reply({ content: `✅ Ad **${name}** is now active every ${adData.interval} mins.`, ephemeral: true });
    }

    if (commandName === 'ads_stop') {
        const name = options.getString('name');
        const ad = adsStorage.get(name);
        if (ad) {
            clearInterval(ad.timer);
            adsStorage.delete(name);
            await interaction.reply({ content: `🛑 Ad **${name}** stopped.`, ephemeral: true });
        } else await interaction.reply({ content: "❌ Not found.", ephemeral: true });
    }

    if (commandName === 'ads_edit') {
        const name = options.getString('name');
        const ad = adsStorage.get(name);
        if (ad) {
            ad.text = options.getString('new_text');
            await interaction.reply({ content: `✅ Ad **${name}** text updated.`, ephemeral: true });
        } else await interaction.reply({ content: "❌ Not found.", ephemeral: true });
    }

    if (commandName === 'send') {
        const text = options.getString('message');
        const style = options.getString('style');
        const dSend = options.getInteger('delay_send');
        const dDelete = options.getInteger('delete_after');
        const color = options.getString('color') || '#3498db';
        await interaction.reply({ content: `Will send in ${dSend} min.`, ephemeral: true });
        setTimeout(async () => {
            let s;
            if (style === 'embed') s = await channel.send({ embeds: [new EmbedBuilder().setDescription(text).setColor(color)] });
            else s = await channel.send(text);
            if (dDelete > 0) setTimeout(() => s.delete().catch(() => {}), dDelete * 60000);
        }, dSend * 60000);
    }

    if (commandName === 'vote') {
        const q = options.getString('question');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Vote').setDescription(q).setColor('#f1c40f')], components: [row] });
    }

    if (commandName === 'clear') {
        await channel.bulkDelete(Math.min(options.getInteger('amount'), 100));
        await interaction.reply({ content: 'Done.', ephemeral: true });
    }
});

client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE);
    if (role) await member.roles.add(role).catch(() => {});
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeText = `<@${member.id}>\n𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1484639863411183636>\n[¡}================{!}================[¡}\nThank you! ❤️`;
        const m = await welcomeCh.send(welcomeText);
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
        .setDescription(`@everyone\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#3498db');
    const msgs = await infoCh.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit({ embeds: [infoEmbed] }); else await infoCh.send({ embeds: [infoEmbed] });
}

client.login(process.env.TOKEN);
