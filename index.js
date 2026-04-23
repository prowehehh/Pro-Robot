const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Pro Robot is Online! 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
});

// --- الإعدادات (IDs) ---
const WELCOME_CHANNEL_ID = '1482881348204101768';
const INFO_CHANNEL_ID = '1484639863411183636';
const AUTO_ROLE_ID = '1482883802186514615';

// قائمة شتائم (تقدر تزود عليها)
const badWords = ['شتيمة1', 'شتيمة2', 'badword1']; 
const userViolations = new Map();

// --- تعريف الأوامر ---
const commands = [
  // أمر send المطور
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a styled message')
    .addStringOption(o => o.setName('message').setDescription('The content').setRequired(true))
    .addStringOption(o => o.setName('style').setDescription('Box or Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
    .addIntegerOption(o => o.setName('delete_after').setDescription('Delete after (minutes)').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Hex Color (ex: #ff0000)'))
    .addIntegerOption(o => o.setName('delay').setDescription('Delay before sending (seconds)')),

  // أمر vote المطور
  new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Create a customized poll')
    .addStringOption(o => o.setName('question').setDescription('The question').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Options separated by comma (ex: Yes, No, Maybe)').setRequired(true))
    .addStringOption(o => o.setName('reactions').setDescription('Emojis separated by space (ex: ✅ ❌ 🤔)').setRequired(true)),

  // أوامر إدارية مهمة
  new SlashCommandBuilder().setName('clear').setDescription('Clear messages').addIntegerOption(o => o.setName('amount').setRequired(true).setDescription('1-100')),
  new SlashCommandBuilder().setName('ping').setDescription('Bot latency'),
  new SlashCommandBuilder().setName('info_update').setDescription('Manually refresh Live Info'),
].map(c => c.toJSON());

// --- تشغيل البوت ---
client.on('ready', async () => {
    console.log(`${client.user.tag} Ready!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Commands Synchronized! ✅');
    } catch (e) { console.error(e); }
    updateLiveInfo();
});

// --- نظام الحماية (Anti-Bad-Words) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();
    
    if (badWords.some(word => content.includes(word))) {
        await message.delete().catch(() => {});
        const count = (userViolations.get(message.author.id) || 0) + 1;
        userViolations.set(message.author.id, count);

        if (count >= 2) {
            await message.member.timeout(10 * 60 * 60 * 1000, 'Repeated bad words').catch(() => {});
            message.channel.send(`⚠️ <@${message.author.id}> has been muted for 10 hours for repeated bad words.`);
            userViolations.set(message.author.id, 0);
        } else {
            message.channel.send(`🚫 <@${message.author.id}>, bad words are not allowed!`).then(m => setTimeout(() => m.delete(), 5000));
        }
    }
});

// --- التفاعل مع الأوامر ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel, guild, member } = interaction;

    if (commandName === 'send') {
        const msg = options.getString('message');
        const style = options.getString('style');
        const del = options.getInteger('delete_after');
        const color = options.getString('color') || '#3498db';
        const delay = options.getInteger('delay') || 0;

        await interaction.reply({ content: 'Processing...', ephemeral: true });

        setTimeout(async () => {
            let sent;
            if (style === 'embed') {
                const emb = new EmbedBuilder().setDescription(msg).setColor(color);
                sent = await channel.send({ embeds: [emb] });
            } else {
                sent = await channel.send(msg);
            }
            if (del > 0) setTimeout(() => sent.delete().catch(() => {}), del * 60000);
        }, delay * 1000);
    }

    if (commandName === 'vote') {
        const q = options.getString('question');
        const opts = options.getString('options').split(',');
        const reacts = options.getString('reactions').split(' ');

        const emb = new EmbedBuilder()
            .setTitle('📊 New Vote')
            .setDescription(`**${q}**\n\n${opts.map((o, i) => `${i+1}. ${o.trim()}`).join('\n')}`)
            .setColor('#f1c40f')
            .setFooter({ text: `Requested by ${member.user.username}` });

        const m = await interaction.reply({ embeds: [emb], fetchReply: true });
        for (const r of reacts) { if(r.trim()) await m.react(r.trim()).catch(() => {}); }
    }

    if (commandName === 'clear') {
        const amount = options.getInteger('amount');
        await channel.bulkDelete(Math.min(amount, 100));
        await interaction.reply({ content: `Cleared ${amount} messages.`, ephemeral: true });
    }

    if (commandName === 'ping') await interaction.reply(`Latency: ${client.ws.ping}ms`);
    if (commandName === 'info_update') { updateLiveInfo(guild); await interaction.reply('Info Updated!'); }
});

// --- دخول عضو جديد (ترحيب + رتبة + تحديث عداد) ---
client.on('guildMemberAdd', async (member) => {
    // رتبة تلقائية
    const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
    if (role) await member.roles.add(role).catch(() => {});

    // رسالة الترحيب
    const chan = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (chan) {
        const welcomeText = `<@${member.id}>\n𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n[¡}================{!}================[¡}\n- You are now from team PRO! 🥳\n- Join us and you will be enjoying! 🎉\n- Chat with us and go to read info server.\n[]--------------------!--------------------[]\n→ <#1482874761951576228> | <#1484639863411183636>\n[¡}================{!}================[¡}\nThank you! ❤️`;
        const emb = new EmbedBuilder().setDescription(welcomeText).setColor('#00ff00');
        const s = await chan.send({ content: `${member}`, embeds: [emb] });
        // حذف بعد 24 ساعة
        setTimeout(() => s.delete().catch(() => {}), 24 * 60 * 60 * 1000);
    }
    updateLiveInfo(member.guild);
});

// --- خروج عضو (تحديث عداد) ---
client.on('guildMemberRemove', (member) => {
    updateLiveInfo(member.guild);
});

// --- Live Info (تنسيق المربع بدون صورة جانبية) ---
async function updateLiveInfo(guild) {
    if (!guild) guild = client.guilds.cache.first();
    const chan = client.channels.cache.get(INFO_CHANNEL_ID);
    if (!chan || !guild) return;

    const infoText = `[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]\nInformation about server:-\n• Owner: <@1134146616857731173>\n• Robot: <@${client.user.id}>\n• Server from: Egypt\n• Date Server: 15/03/2026\n• Total Members: ${guild.memberCount}\n• Ranks:\n→ [<@&1482883802186514615>, <@&1486093106465210531>, <@&1482884804063268984>, <@&1482885169949052948>, <@&1482885029557178592>]\n[!]≈≈≈≈≈≈≈≈≈≈≈≈≈|!|≈≈≈≈≈≈≈≈≈≈≈≈≈[!]`;
    
    const emb = new EmbedBuilder().setDescription(infoText).setColor('#3498db');
    
    const msgs = await chan.messages.fetch({ limit: 10 });
    const botMsg = msgs.find(m => m.author.id === client.user.id);
    
    if (botMsg) await botMsg.edit({ content: '@everyone', embeds: [emb] });
    else await chan.send({ content: '@everyone', embeds: [emb] });
}

client.login(process.env.TOKEN);
