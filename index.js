const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ComponentType 
} = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

// تشغيل السيرفر لضمان بقاء البوت أونلاين
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

// نظام الحماية - Regex للشتائم
const badWordsPattern = [/كسم/i, /متناك/i, /شرموط/i, /خول/i, /عرص/i, /يا بن ال/i, /fuck/i, /shit/i, /bitch/i, /ksm/i, /sharmot/i];
const userViolations = new Map();
const adsStorage = new Map();

// --- تعريف الأوامر ---
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot speed'),
    new SlashCommandBuilder().setName('clear').setDescription('Clean chat').addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
    
    // أمر الترجمة
    new SlashCommandBuilder().setName('translate')
        .setDescription('Translate text to any language')
        .addStringOption(o => o.setName('text').setDescription('The text to translate').setRequired(true))
        .addStringOption(o => o.setName('to').setDescription('Language code (ex: ar, en, fr)').setRequired(true)),

    // أوامر الإعلانات
    new SlashCommandBuilder().setName('ads_set').setDescription('Set auto advertisement')
        .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Ad Content').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Select Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('Every X minutes').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('Delete after X minutes').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('ads_edit').setDescription('Edit or Delete an advertisement')
        .addStringOption(o => o.setName('name').setDescription('Select Ad Name').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('text').setDescription('New Content').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('New Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('New Interval (mins)').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('New Auto-delete (mins)').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('New Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('vote').setDescription('Start a poll').addStringOption(o => o.setName('question').setDescription('The question').setRequired(true)),
    
    new SlashCommandBuilder().setName('send')
        .setDescription('Send custom message')
        .addStringOption(o => o.setName('message').setDescription('Content').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('Style').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
        .addIntegerOption(o => o.setName('delay_send').setDescription('Minutes to wait').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('Minutes until delete').setRequired(true))
].map(c => c.toJSON());

// --- دالة حلقة الإعلانات ---
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
        console.log(`✅ ${client.user.tag} is ready!`);
    } catch (e) { console.error(e); }
    updateLiveInfo();
});

// --- نظام الحماية ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    if (badWordsPattern.some(p => p.test(message.content))) {
        await message.delete().catch(() => {});
        const count = (userViolations.get(message.author.id) || 0) + 1;
        userViolations.set(message.author.id, count);
        if (count >= 2) {
            await message.member.timeout(10 * 60 * 60 * 1000, 'Bad words');
            message.channel.send(`⚠️ <@${message.author.id}> has been muted for 10h.`);
            userViolations.delete(message.author.id);
        } else {
            const warn = await message.channel.send(`🚫 <@${message.author.id}>، ممنوع الشتم!`);
            setTimeout(() => warn.delete().catch(() => {}), 5000);
        }
    }
});

// --- معالجة التفاعلات (Slash & Buttons) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'ads_edit') {
            const focusedValue = interaction.options.getFocused();
            const choices = Array.from(adsStorage.keys());
            const filtered = choices.filter(choice => choice.startsWith(focusedValue));
            await interaction.respond(filtered.map(c => ({ name: c, value: c })));
        }
    }

    if (interaction.isChatInputCommand()) {
        const { commandName, options, channel, guild } = interaction;

        if (commandName === 'translate') {
            const text = options.getString('text');
            const to = options.getString('to').toLowerCase();
            await interaction.deferReply();
            try {
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURI(text)}`);
                const json = await res.json();
                const result = json[0].map(i => i[0]).join('');
                const embed = new EmbedBuilder().setTitle('🌐 Translation').addFields({name:'Original', value:text}, {name:`Translated (${to})`, value:result}).setColor('#4285F4');
                await interaction.editReply({ embeds: [embed] });
            } catch { await interaction.editReply('❌ Error translating.'); }
        }

        if (commandName === 'ads_set' || commandName === 'ads_edit') {
            const name = options.getString('name');
            const data = {
                name, text: options.getString('text'), channelId: options.getChannel('channel').id,
                interval: options.getInteger('interval'), deleteAfter: options.getInteger('delete'),
                style: options.getString('style'), timer: adsStorage.get(name)?.timer || null
            };
            adsStorage.set(name, data);
            startAdLoop(name, guild.id);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`del_ad_${name}`).setLabel('Delete Ad 🗑️').setStyle(ButtonStyle.Danger));
            await interaction.reply({ content: `✅ Ad **${name}** is active.`, components: [row], ephemeral: true });
        }

        if (commandName === 'ping') await interaction.reply(`🏓 \`${client.ws.ping}ms\``);
        if (commandName === 'clear') {
            await channel.bulkDelete(options.getInteger('amount')).catch(() => {});
            await interaction.reply({ content: 'Cleaned.', ephemeral: true });
        }
        if (commandName === 'vote') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('v_yes').setLabel('Yes ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('v_no').setLabel('No ❌').setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Vote').setDescription(options.getString('question')).setColor('#f1c40f')], components: [row] });
        }
        
        if (commandName === 'send') {
            const text = options.getString('message');
            const style = options.getString('style');
            await interaction.reply({ content: 'Pending...', ephemeral: true });
            setTimeout(async () => {
                let s = (style === 'embed') ? await channel.send({ embeds: [new EmbedBuilder().setDescription(text).setColor('#3498db')] }) : await channel.send(text);
                const del = options.getInteger('delete_after');
                if (del > 0) setTimeout(() => s.delete().catch(() => {}), del * 60000);
            }, options.getInteger('delay_send') * 60000);
        }
    } 

    else if (interaction.isButton()) {
        if (interaction.customId.startsWith('del_ad_')) {
            const name = interaction.customId.replace('del_ad_', '');
            if (adsStorage.has(name)) {
                clearInterval(adsStorage.get(name).timer);
                adsStorage.delete(name);
                await interaction.reply({ content: `🗑️ Ad **${name}** Deleted.`, ephemeral: true });
            }
        } else { await interaction.reply({ content: 'Done ✅', ephemeral: true }); }
    }
});

// --- الترحيب والمعلومات ---
client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE);
    if (role) await member.roles.add(role).catch(() => {});
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeText = `<@${member.id}>\n𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\nThank you! ❤️`;
        const m = await welcomeCh.send(welcomeText);
        setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;
    const infoEmbed = new EmbedBuilder()
        .setDescription(`• Owner: <@${CONFIG.OWNER_ID}>\n• Total Members: ${guild.memberCount}\n• Location: Egypt 🇪🇬`)
        .setColor('#3498db');
    const msgs = await infoCh.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    if (botMsg) await botMsg.edit({ embeds: [infoEmbed] }); else await infoCh.send({ embeds: [infoEmbed] });
}

client.login(process.env.TOKEN);
