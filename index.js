const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const express = require('express');
const app = express();

// --- تشغيل السيرفر ---
app.get('/', (req, res) => res.send('Pro Robot System is Ready! 🚀'));
app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// --- الإعدادات الثابتة (IDs) ---
const WELCOME_CHANNEL_ID = '1482881348204101768';
const INFO_CHANNEL_ID = '1484639863411183636';
const AUTO_ROLE_ID = '1482883802186514615';

// --- نظام الحماية (قائمة الكلمات الممنوعة) ---
// يمكنك إضافة أي كلمات أخرى هنا
const badWords = ['شتيمة1', 'شتيمة2', 'badword1', 'badword2']; 
const userViolations = new Map(); // لتتبع تكرار الشتائم

// --- تعريف الأوامر ---
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check robot speed'),
  new SlashCommandBuilder().setName('clear').setDescription('Delete messages').addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  
  // أمر send المطور
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a styled message')
    .addStringOption(o => o.setName('message').setDescription('Content').setRequired(true))
    .addStringOption(o => o.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
    .addStringOption(o => o.setName('color').setDescription('Box color').addChoices({name:'Blue',value:'#3498db'},{name:'Red',value:'#e74c3c'},{name:'Green',value:'#2ecc71'}))
    .addIntegerOption(o => o.setName('delay').setDescription('Send after (seconds)'))
    .addIntegerOption(o => o.setName('delete').setDescription('Delete after (minutes)')),
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Commands Registered! ✅');
    } catch (e) { console.error(e); }
    updateLiveInfo(); // تحديث المعلومات عند التشغيل
});

// --- نظام منع الشتائم والحماية ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();
    const hasBadWord = badWords.some(word => content.includes(word));

    if (hasBadWord) {
        await message.delete().catch(() => {});
        const userId = message.author.id;
        const count = (userViolations.get(userId) || 0) + 1;
        userViolations.set(userId, count);

        if (count === 1) {
            return message.channel.send(`${message.author}, Don't use bad words! (Warning 1/2)`).then(m => setTimeout(() => m.delete(), 5000));
        } else if (count >= 2) {
            // تنفيذ Timeout لمدة 10 ساعات
            const member = message.guild.members.cache.get(userId);
            if (member) {
                await member.timeout(10 * 60 * 60 * 1000, 'Using bad words repeatedly').catch(() => {});
                message.channel.send(`${message.author} has been muted for 10 hours for repeated violations! 🚫`);
                userViolations.set(userId, 0); // تصفير العداد بعد العقاب
            }
        }
    }
});

// --- التفاعل مع الأوامر ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel, member, guild } = interaction;

    if (commandName === 'send') {
        const msgText = options.getString('message');
        const style = options.getString('style');
        const col = options.getString('color') || '#3498db';
        const delay = options.getInteger('delay') || 0;
        const delTime = options.getInteger('delete') || 0;

        await interaction.reply({ content: 'Processing...', ephemeral: true });

        setTimeout(async () => {
            let sentMsg;
            if (style === 'embed') {
                const emb = new EmbedBuilder().setDescription(msgText).setColor(col);
                sentMsg = await channel.send({ embeds: [emb] });
            } else {
                sentMsg = await channel.send(msgText);
            }

            if (delTime > 0) {
                setTimeout(() => sentMsg.delete().catch(() => {}), delTime * 60000);
            }
        }, delay * 1000);
    }

    // أوامر الإدارة الأساسية
    if (commandName === 'clear') {
        const amt = options.getInteger('amount');
        await channel.bulkDelete(Math.min(amt, 100)).catch(() => {});
        await interaction.reply({ content: `Cleared ${amt} messages!`, ephemeral: true });
    }
    if (commandName === 'mute') {
        const target = options.getMember('target');
        const time = options.getInteger('duration');
        await target.timeout(time * 60000);
        await interaction.reply(`Muted ${target} for ${time} minutes.`);
    }
    if (commandName === 'unmute') {
        await options.getMember('target').timeout(null);
        await interaction.reply('Unmuted! ✅');
    }
    if (commandName === 'kick') { await options.getMember('target').kick(); await interaction.reply('Kicked!'); }
    if (commandName === 'ban') { await guild.members.ban(options.getUser('target')); await interaction.reply('Banned!'); }
    if (commandName === 'ping') await interaction.reply(`Speed: \`${client.ws.ping}ms\``);
});

// --- الترحيب و Auto Role ---
client.on('guildMemberAdd', async (member) => {
    // إعطاء الرتبة فوراً
    const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
    if (role) await member.roles.add(role).catch(() => {});

    // رسالة الترحيب
    const welcomeChan = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChan) {
        const welcomeText = `<@${member.id}>\n𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1484639863411183636>\n[¡}================{!}================[¡}\nThank you! ❤️`;
        
        const emb = new EmbedBuilder().setDescription(welcomeText).setColor('#00ff00');
        const msg = await welcomeChan.send({ content: `<@${member.id}>`, embeds: [emb] });
        
        // مسح الرسالة بعد 24 ساعة
        setTimeout(() => msg.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

// --- تحديث Live Info عند الخروج ---
client.on('guildMemberRemove', (member) => {
    updateLiveInfo(member.guild);
});

// --- دالة Live Info ---
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const infoChan = client.channels.cache.get(INFO_CHANNEL_ID);
    if (!infoChan || !guild) return;

    const infoEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Pro Server Information', iconURL: guild.iconURL() })
        .setDescription(`@everyone\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@1134146616857731173>\n• Robot: <@1495419259147386920>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: **${guild.memberCount}**\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`)
        .setColor('#f1c40f');

    const msgs = await infoChan.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);

    if (botMsg) {
        await botMsg.edit({ content: '@everyone', embeds: [infoEmbed] });
    } else {
        await infoChan.send({ content: '@everyone', embeds: [infoEmbed] });
    }
}

client.login(process.env.TOKEN);
