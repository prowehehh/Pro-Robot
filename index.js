const { 
    Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, 
    REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType 
} = require('discord.js');
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

// تشغيل السيرفر عشان البوت يفضل صاحي 24 ساعة
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

// إعدادات السيرفر الخاصة بك
const CONFIG = {
    WELCOME_CH: '1482881348204101768',
    INFO_CH: '1484639863411183636',
    AUTO_ROLE: '1482883802186514615',
    OWNER_ID: '1134146616857731173',
    BOT_ID: '1495419259147386920',
    HELP_CH: '1497909981725593712' // قناة المساعدة للـ AI
};

const adsStorage = new Map();

// --- وظيفة الـ AI (Mistral) ---
async function getMistralResponse(userMessage) {
    try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MISTRAL_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-tiny",
                messages: [
                    { role: "system", content: `You are an AI for "Pro Security System". Support all languages. Server Info: Created 15/03/2026, Location: Egypt, Owner: <@${CONFIG.OWNER_ID}>. Rules: No insults, no advertising.` },
                    { role: "user", content: userMessage }
                ]
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || `انا لا اعرف اسال صاحب السيرفر <@${CONFIG.OWNER_ID}>`;
    } catch (err) {
        return `انا لا اعرف اسال صاحب السيرفر <@${CONFIG.OWNER_ID}>`;
    }
}

// --- تسجيل جميع الأوامر بدون استثناء ---
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('سرعة اتصال البوت'),
    
    new SlashCommandBuilder().setName('clear').setDescription('تنظيف الشات')
        .addIntegerOption(o => o.setName('amount').setDescription('عدد الرسائل').setRequired(true)),
    
    new SlashCommandBuilder().setName('send').setDescription('إرسال رسالة مخصصة بوقت محدد')
        .addStringOption(o => o.setName('message').setDescription('محتوى الرسالة').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('شكل الرسالة').setRequired(true).addChoices({name:'مربع (Box)',value:'embed'},{name:'عادي (Normal)',value:'normal'}))
        .addIntegerOption(o => o.setName('delay_send').setDescription('وقت الانتظار قبل الإرسال (بالدقائق)').setRequired(true))
        .addIntegerOption(o => o.setName('delete_after').setDescription('وقت الحذف التلقائي (بالدقائق)').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('لون المربع').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'})),

    new SlashCommandBuilder().setName('ads_set').setDescription('إعداد إعلان تلقائي جديد')
        .addStringOption(o => o.setName('name').setDescription('اسم الإعلان').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('محتوى الإعلان').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('قناة الإعلان').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption(o => o.setName('interval').setDescription('الإرسال كل كم دقيقة').setRequired(true))
        .addIntegerOption(o => o.setName('delete').setDescription('الحذف بعد كم دقيقة').setRequired(true))
        .addStringOption(o => o.setName('style').setDescription('الشكل').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('ads_edit').setDescription('تعديل أو حذف إعلان قائم')
        .addStringOption(o => o.setName('name').setDescription('اختر اسم الإعلان').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('text').setDescription('النص الجديد (اختياري)').setRequired(false))
        .addChannelOption(o => o.setName('channel').setDescription('القناة الجديدة (اختياري)').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addIntegerOption(o => o.setName('interval').setDescription('الوقت الجديد (اختياري)').setRequired(false))
        .addIntegerOption(o => o.setName('delete').setDescription('وقت الحذف الجديد (اختياري)').setRequired(false))
        .addStringOption(o => o.setName('style').setDescription('الشكل الجديد (اختياري)').setRequired(false).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'})),

    new SlashCommandBuilder().setName('translate').setDescription('ترجمة نصوص')
        .addStringOption(o => o.setName('text').setDescription('النص').setRequired(true))
        .addStringOption(o => o.setName('to').setDescription('كود اللغة (مثال: ar)').setRequired(true)),

    new SlashCommandBuilder().setName('vote').setDescription('عمل تصويت سريع')
        .addStringOption(o => o.setName('question').setDescription('سؤال التصويت').setRequired(true)),
].map(c => c.toJSON());

// --- وظيفة تشغيل حلقة الإعلانات ---
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
    console.log(`Logged in as ${client.user.tag}`);
    updateLiveInfo();
});

// التعامل مع رسائل الـ AI
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== CONFIG.HELP_CH) return;

    try {
        await message.channel.sendTyping();
        const text = await getMistralResponse(message.content);
        if (text) {
            const botMsg = await message.reply(text);
            setTimeout(() => {
                message.delete().catch(() => {});
                botMsg.delete().catch(() => {});
            }, 600000); // حذف بعد 10 دقائق لتنظيف القناة
        }
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
    // الأوتوكومبليت لأسماء الإعلانات
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused();
        const choices = Array.from(adsStorage.keys());
        const filtered = choices.filter(choice => choice.startsWith(focusedValue));
        await interaction.respond(filtered.map(c => ({ name: c, value: c }))).catch(() => {});
    }

    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, channel } = interaction;

        try {
            if (commandName === 'ping') {
                return await interaction.reply(`🏓 Pong! Speed: \`${client.ws.ping}ms\``);
            }

            // أمر الإرسال (Send)
            if (commandName === 'send') {
                const msg = options.getString('message');
                const style = options.getString('style');
                const delay = options.getInteger('delay_send');
                const delAfter = options.getInteger('delete_after');
                const color = options.getString('color') || '#3498db';

                await interaction.reply({ content: `✅ ستصل الرسالة خلال ${delay} دقيقة.`, ephemeral: true });

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
                return await interaction.reply({ content: `✅ تم تفعيل إعلان: **${name}**`, ephemeral: true });
            }

            if (commandName === 'ads_edit') {
                const name = options.getString('name');
                const ad = adsStorage.get(name);
                if (!ad) return await interaction.reply({ content: "❌ هذا الإعلان غير موجود.", ephemeral: true });

                if (options.getString('text')) ad.text = options.getString('text');
                if (options.getChannel('channel')) ad.channelId = options.getChannel('channel').id;
                if (options.getInteger('interval')) ad.interval = options.getInteger('interval');
                if (options.getInteger('delete') !== null) ad.deleteAfter = options.getInteger('delete');
                if (options.getString('style')) ad.style = options.getString('style');

                startAdLoop(name, guild.id);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stop_ad_${name}`).setLabel('حذف الإعلان نهائياً 🗑️').setStyle(ButtonStyle.Danger));
                return await interaction.reply({ content: `⚙️ تم تحديث إعلان **${name}** بنجاح.`, components: [row], ephemeral: true });
            }

            if (commandName === 'clear') {
                await interaction.deferReply({ ephemeral: true });
                await channel.bulkDelete(Math.min(options.getInteger('amount'), 100)).catch(() => {});
                return await interaction.editReply('تم تنظيف الشات بنجاح! 🧹');
            }

            if (commandName === 'translate') {
                await interaction.deferReply();
                const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${options.getString('to').toLowerCase()}&dt=t&q=${encodeURI(options.getString('text'))}`);
                const json = await res.json();
                const result = json[0].map(i => i[0]).join('');
                return await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🌐 ترجمة').setDescription(result).setColor('#4285F4')] });
            }

            if (commandName === 'vote') {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('v_yes').setLabel('نعم ✅').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('v_no').setLabel('لا ❌').setStyle(ButtonStyle.Danger)
                );
                return await interaction.reply({ embeds: [new EmbedBuilder().setTitle('تصويت جديد').setDescription(options.getString('question')).setColor('#f1c40f')], components: [row] });
            }

        } catch (e) {
            console.error(e);
            if (!interaction.replied) await interaction.reply({ content: '❌ حدث خطأ أثناء تنفيذ الأمر.', ephemeral: true });
        }
    } 

    // أزرار الحذف
    else if (interaction.isButton()) {
        if (interaction.customId.startsWith('stop_ad_')) {
            const name = interaction.customId.replace('stop_ad_', '');
            const ad = adsStorage.get(name);
            if (ad) {
                if (ad.timer) clearInterval(ad.timer);
                adsStorage.delete(name);
                await interaction.update({ content: `🗑️ تم حذف إعلان **${name}** من النظام.`, components: [], ephemeral: true });
            }
        }
    }
});

// --- نظام الترحيب والرتب التلقائية ---
client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE);
    if (role) await member.roles.add(role).catch(() => {});
    
    const welcomeCh = member.guild.channels.cache.get(CONFIG.WELCOME_CH);
    if (welcomeCh) {
        const welcomeEmbed = new EmbedBuilder()
            .setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝘃𝗲𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1482901664951304222>\n[¡}================{!}================[¡}\nThank you! ❤️`)
            .setColor('#3498db');
        const m = await welcomeCh.send({ content: `<@${member.id}>`, embeds: [welcomeEmbed] }).catch(() => {});
        if (m) setTimeout(() => m.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

// --- نظام تحديث المعلومات (Info) ---
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoCh = client.channels.cache.get(CONFIG.INFO_CH);
    if (!infoCh || !guild) return;

    const infoEmbed = new EmbedBuilder()
        .setDescription(`[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@${CONFIG.OWNER_ID}>\n• Robot: <@${CONFIG.BOT_ID}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#3498db');

    try {
        const msgs = await infoCh.messages.fetch({ limit: 10 }).catch(() => null);
        if (msgs) {
            const botMessages = msgs.filter(m => m.author.id === client.user.id);
            for (const m of botMessages.values()) await m.delete().catch(() => {});
        }
        await infoCh.send({ content: '@everyone', embeds: [infoEmbed] });
    } catch (e) { console.error(e); }
}

client.login(process.env.TOKEN);
