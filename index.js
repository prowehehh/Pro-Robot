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

// --- قائمة الأوامر الكاملة ---
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check speed'),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute member').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Delete msgs').addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban').addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)),
  new SlashCommandBuilder().setName('info').setDescription('Update info'),
  
  new SlashCommandBuilder()
    .setName('ads_stop')
    .setDescription('Stop Ad')
    .addStringOption(o => o.setName('name').setDescription('Ad Name').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder()
    .setName('ads_edit')
    .setDescription('Edit Ad')
    .addStringOption(o => o.setName('name').setDescription('Current Name').setRequired(true))
    .addStringOption(o => o.setName('new_text').setDescription('New Text')),

  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send message')
    .addStringOption(o => o.setName('message').setDescription('Text').setRequired(true))
    .addStringOption(o => o.setName('style').setDescription('Box/Normal').setRequired(true).addChoices({name:'Box',value:'embed'},{name:'Normal',value:'normal'}))
    .addIntegerOption(o => o.setName('time').setDescription('Delete after minutes').setRequired(true)),
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`${client.user.tag} Online!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        // خطوة المزامنة الإجبارية لتحديث القائمة عندك
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Commands Synchronized! ✅');
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, channel } = interaction;

    if (commandName === 'ping') await interaction.reply('🏓 Pong!');
    
    if (commandName === 'unmute') {
        await options.getMember('target').timeout(null);
        await interaction.reply('Done! ✅');
    }

    if (commandName === 'clear') {
        await channel.bulkDelete(options.getInteger('amount'));
        await interaction.reply({ content: 'Deleted!', ephemeral: true });
    }

    if (commandName === 'send') {
        const msg = options.getString('message');
        const style = options.getString('style');
        const time = options.getInteger('time');
        let s;
        if (style === 'embed') {
            s = await channel.send({ embeds: [new EmbedBuilder().setDescription(msg).setColor('#3498db')] });
        } else {
            s = await channel.send(msg);
        }
        await interaction.reply({ content: 'Sent!', ephemeral: true });
        if (time > 0) setTimeout(() => s.delete().catch(() => {}), time * 60000);
    }
});

client.on('guildMemberAdd', async (member) => {
    // ترحيب بدون Thumbnail (الصورة الجانبية)
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
        const welcomeEmbed = new EmbedBuilder()
            .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
            .setDescription(`𝗪𝗲𝗹𝗰𝗼𝗺𝗲 𝘁𝗼 𝐏𝐫𝐨 𝐒𝐞𝐫𝐯𝐞𝐫 𝐟𝐨𝐫 𝐌𝐂 👑\n- You are now from team PRO! 🥳`)
            .setColor('#00ff00');
        await welcomeChannel.send({ content: `${member}`, embeds: [welcomeEmbed] });
    }
});

client.login(process.env.TOKEN);
