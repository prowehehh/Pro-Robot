const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const express = require('express');

const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();


// =====================================================
// KEEP ALIVE
// =====================================================

app.get('/', (req, res) =>
    res.send('Pro Robot Ultra Online 🤖')
);

app.listen(process.env.PORT || 3000);


// =====================================================
// CLIENT
// =====================================================

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration

    ]

});


// =====================================================
// CONFIG
// =====================================================

const CONFIG = {

    WELCOME_CH: '1482881348204101768',
    AUTO_ROLE: '1482883802186514615',
    AUTO_ROLE_2: '1499510435639197887',

    OWNER_ID: '1134146616857731173',
    BOT_ID: '1495419259147386920',

    HELP_CH: '1497909981725593712',
    SUBMIT_LOG: '1494367980702797935',

    ROLE_CHANNEL: '1482874761951576228',
    INFO_CH: '1484641160394702958'

};


// =====================================================
// STORAGE
// =====================================================

const adsStorage = new Map();
const warnStorage = new Map();

const aiMemory = new Map();
const radarStorage = new Map();

const pendingUpdates = new Map();
const adminAttempts = new Map();

let extraServerInfo = "";


// =====================================================
// SECURITY
// =====================================================

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD;


// =====================================================
// AI MEMORY
// =====================================================

function saveContext(userId, userMessage, botReply) {

    if (!aiMemory.has(userId)) {
        aiMemory.set(userId, []);
    }

    const history = aiMemory.get(userId);

    history.push({

        user: userMessage,
        bot: botReply

    });

    if (history.length > 10) {
        history.shift();
    }

}

function getContext(userId) {

    const history =
        aiMemory.get(userId) || [];

    return history.map(h =>

        `User: ${h.user}\nBot: ${h.bot}`

    ).join('\n');

}


// =====================================================
// RADAR SYSTEM
// =====================================================

function addRadar(guildId, type) {

    if (!radarStorage.has(guildId)) {

        radarStorage.set(guildId, {

            joins: 0,
            leaves: 0,
            bans: 0,
            channels: 0,
            roles: 0

        });

    }

    const data = radarStorage.get(guildId);

    if (type === 'join') data.joins++;
    if (type === 'leave') data.leaves++;
    if (type === 'ban') data.bans++;
    if (type === 'channel') data.channels++;
    if (type === 'role') data.roles++;

}


// =====================================================
// RADAR LOG
// =====================================================

async function sendDetailedLog(

    guild,
    title,
    details,
    color = '#3498db'

) {

    const logChannel =
        guild.channels.cache.get(CONFIG.SUBMIT_LOG);

    if (!logChannel) return;

    setTimeout(async () => {

        const fetchedLogs =
            await guild.fetchAuditLogs({ limit: 1 })
                .catch(() => null);

        const logEntry =
            fetchedLogs?.entries.first();

        const executor =
            logEntry ?
                logEntry.executor.tag :
                'Unknown';

        const embed =
            new EmbedBuilder()

                .setTitle(`📡 RADAR PRO: ${title}`)

                .setDescription(details)

                .addFields(

                    {
                        name: '👤 Executor',
                        value: executor,
                        inline: true
                    },

                    {
                        name: '📍 Server',
                        value: guild.name,
                        inline: true
                    }

                )

                .setColor(color)

                .setTimestamp();

        await logChannel.send({

            embeds: [embed]

        }).catch(() => { });

    }, 2000);

}


// =====================================================
// RADAR MORNING
// =====================================================

async function sendMorningRadar() {

    client.guilds.cache.forEach(async guild => {

        const logChannel =
            guild.channels.cache.get(CONFIG.SUBMIT_LOG);

        if (!logChannel) return;

        const radar =
            radarStorage.get(guild.id) || {

                joins: 0,
                leaves: 0,
                bans: 0,
                channels: 0,
                roles: 0

            };

        const embed =
            new EmbedBuilder()

                .setTitle('🌅 Radar Morning Report')

                .setDescription(`

👥 Joins: ${radar.joins}
📤 Leaves: ${radar.leaves}
🔨 Bans: ${radar.bans}
📁 Channel Changes: ${radar.channels}
🎭 Role Changes: ${radar.roles}

🤖 Pro Robot Ultra Monitoring Active

                `)

                .setColor('#f1c40f')

                .setTimestamp();

        await logChannel.send({

            embeds: [embed]

        });

        radarStorage.set(guild.id, {

            joins: 0,
            leaves: 0,
            bans: 0,
            channels: 0,
            roles: 0

        });

    });

}


// =====================================================
// AUTOMOD
// =====================================================

const BAD_WORDS = [

    'word1',
    'word2',
    'word3'

];


// =====================================================
// AI SYSTEM
// =====================================================

async function getMistralResponse(

    userMessage,
    guild,
    userId

) {

    const totalMembers =
        guild.memberCount;

    const onlineMembers =
        guild.members.cache.filter(

            m => m.presence?.status === 'online'

        ).size;

    const previousContext =
        getContext(userId);

    try {

        const response =
            await fetch(

                'https://api.mistral.ai/v1/chat/completions',

                {

                    method: 'POST',

                    headers: {

                        'Content-Type': 'application/json',

                        'Authorization':
                            `Bearer ${process.env.MISTRAL_KEY}`

                    },

                    body: JSON.stringify({

                        model: 'mistral-small',

                        messages: [

                            {

                                role: 'system',

                                content: `
You are Pro Robot Ultra AI.

Server:
- Pro Server for MC
- Country: Egypt
- Owner: Saif

Monitoring:
- Total Members: ${totalMembers}
- Online Members: ${onlineMembers}

Rules:
- Remember conversation context.
- Support Arabic and English.
- Reply professionally.
- If user wants update/admin action:
ask for admin verification.
`

                            },

                            {

                                role: 'user',

                                content: `
Previous Context:
${previousContext}

Current Message:
${userMessage}
`

                            }

                        ],

                        temperature: 0.6

                    })

                }

            );

        const data =
            await response.json();

        const aiReply =
            data.choices?.[0]?.message?.content
            || 'AI Error';

        saveContext(

            userId,
            userMessage,
            aiReply

        );

        return aiReply;

    } catch (err) {

        console.log(err);

        return 'AI Error';

    }

}


// =====================================================
// COMMANDS
// =====================================================

const commands = [

    new SlashCommandBuilder()

        .setName('ping')
        .setDescription('Bot speed'),

    new SlashCommandBuilder()

        .setName('clear')

        .setDescription('Clear messages')

        .addIntegerOption(o =>

            o.setName('amount')
                .setDescription('Amount')
                .setRequired(true)

        )

].map(c => c.toJSON());


// =====================================================
// READY
// =====================================================

client.on('ready', async () => {

    console.log(

        `Logged in as ${client.user.tag}`

    );

    const rest =
        new REST({ version: '10' })
            .setToken(process.env.TOKEN);

    try {

        await rest.put(

            Routes.applicationCommands(
                client.user.id
            ),

            { body: commands }

        );

    } catch (e) {

        console.log(e);

    }

    updateLiveInfo();

    // Radar Morning Every Hour Check

    setInterval(() => {

        const now = new Date();

        if (now.getHours() === 9) {

            sendMorningRadar();

        }

    }, 60 * 60 * 1000);

});


// =====================================================
// EVENTS
// =====================================================

client.on(

    'guildUpdate',

    (oldGuild, newGuild) => {

        if (
            oldGuild.name !== newGuild.name
        ) {

            sendDetailedLog(

                newGuild,

                'Server Name Changed',

                `From ${oldGuild.name}
to ${newGuild.name}`,

                '#e67e22'

            );

        }

    }

);


client.on(

    'guildMemberUpdate',

    (oldMember, newMember) => {

        if (
            oldMember.nickname !==
            newMember.nickname
        ) {

            sendDetailedLog(

                newMember.guild,

                'Nickname Changed',

                `User:
<@${newMember.id}>`

            );

        }

    }

);


client.on(

    'channelCreate',

    ch => {

        addRadar(ch.guild.id, 'channel');

        sendDetailedLog(

            ch.guild,

            'Channel Created',

            `Name: ${ch.name}`,

            '#2ecc71'

        );

    }

);


client.on(

    'channelDelete',

    ch => {

        addRadar(ch.guild.id, 'channel');

        sendDetailedLog(

            ch.guild,

            'Channel Deleted',

            `Name: ${ch.name}`,

            '#e74c3c'

        );

    }

);


client.on(

    'roleCreate',

    role => {

        addRadar(role.guild.id, 'role');

        sendDetailedLog(

            role.guild,

            'Role Created',

            role.name,

            '#2ecc71'

        );

    }

);


client.on(

    'roleDelete',

    role => {

        addRadar(role.guild.id, 'role');

        sendDetailedLog(

            role.guild,

            'Role Deleted',

            role.name,

            '#e74c3c'

        );

    }

);


client.on(

    'guildBanAdd',

    ban => {

        addRadar(ban.guild.id, 'ban');

        sendDetailedLog(

            ban.guild,

            'Member Banned',

            ban.user.tag,

            '#c0392b'

        );

    }

);


// =====================================================
// MESSAGE CREATE
// =====================================================

client.on(

    'messageCreate',

    async message => {

        if (
            message.author.bot ||
            !message.guild
        ) return;

        // AUTOMOD

        const hasBadWord =
            BAD_WORDS.some(word =>

                message.content
                    .toLowerCase()
                    .includes(word)

            );

        if (hasBadWord) {

            await message.delete()
                .catch(() => { });

            let count =
                (warnStorage.get(
                    message.author.id
                ) || 0) + 1;

            warnStorage.set(

                message.author.id,
                count

            );

            if (count === 1) {

                await message.member.timeout(

                    5 * 60 * 1000,

                    'Bad words'

                );

                message.channel.send(

                    `⚠️ ${message.author}`

                );

            } else {

                await message.member.ban({

                    reason:
                        'Repeated swearing'

                });

            }

            return;

        }

        const isHelpChannel =
            message.channel.id ===
            CONFIG.HELP_CH;

        const isMentioned =
            message.mentions.users.has(
                client.user.id
            );

        if (
            isHelpChannel ||
            isMentioned
        ) {

            await message.channel
                .sendTyping();

            const cleanContent =
                message.content

                    .replace(
                        `<@${client.user.id}>`,
                        ''
                    )

                    .trim();

            const text =
                await getMistralResponse(

                    cleanContent,

                    message.guild,

                    message.author.id

                );

            const row =
                new ActionRowBuilder();

            const isUpdateTask =

                cleanContent.includes('update')
                ||
                cleanContent.includes('تعديل')
                ||
                cleanContent.includes('ضيف');

            if (isUpdateTask) {

                pendingUpdates.set(

                    message.author.id,
                    cleanContent

                );

                row.addComponents(

                    new ButtonBuilder()

                        .setCustomId(
                            'open_admin_modal'
                        )

                        .setLabel(
                            'Admin Verification 🔐'
                        )

                        .setStyle(
                            ButtonStyle.Danger
                        )

                );

                await message.reply({

                    content: text,

                    components: [row]

                });

            } else {

                await message.reply(text);

            }

        }

    }

);


// =====================================================
// INTERACTIONS
// =====================================================

client.on(

    'interactionCreate',

    async interaction => {

        // ADMIN BUTTON

        if (

            interaction.isButton()

            &&

            interaction.customId ===
            'open_admin_modal'

        ) {

            const modal =
                new ModalBuilder()

                    .setCustomId(
                        'admin_pass_modal'
                    )

                    .setTitle(
                        'Admin Verification'
                    );

            const passField =
                new TextInputBuilder()

                    .setCustomId(
                        'admin_password_input'
                    )

                    .setLabel(
                        'Admin Password'
                    )

                    .setStyle(
                        TextInputStyle.Short
                    )

                    .setRequired(true);

            modal.addComponents(

                new ActionRowBuilder()
                    .addComponents(passField)

            );

            return await interaction
                .showModal(modal);

        }

        // ADMIN MODAL

        if (

            interaction.isModalSubmit()

            &&

            interaction.customId ===
            'admin_pass_modal'

        ) {

            const attempts =
                adminAttempts.get(
                    interaction.user.id
                ) || 0;

            if (attempts >= 3) {

                return interaction.reply({

                    content:
                        '🚫 Too many failed attempts.',

                    ephemeral: true

                });

            }

            const enteredPass =
                interaction.fields
                    .getTextInputValue(
                        'admin_password_input'
                    );

            if (
                enteredPass ===
                ADMIN_PASSWORD
            ) {

                adminAttempts.delete(
                    interaction.user.id
                );

                extraServerInfo =
                    pendingUpdates.get(
                        interaction.user.id
                    ) || 'Updated';

                pendingUpdates.delete(
                    interaction.user.id
                );

                await updateLiveInfo(
                    interaction.guild
                );

                return interaction.reply({

                    content:
                        '✅ Verification Success',

                    ephemeral: true

                });

            } else {

                adminAttempts.set(

                    interaction.user.id,

                    attempts + 1

                );

                return interaction.reply({

                    content:
                        '❌ Wrong Password',

                    ephemeral: true

                });

            }

        }

        // COMMANDS

        if (
            interaction.isChatInputCommand()
        ) {

            const {
                commandName,
                options,
                channel
            } = interaction;

            if (commandName === 'ping') {

                return interaction.reply(

                    `🏓 ${client.ws.ping}ms`

                );

            }

            if (commandName === 'clear') {

                await channel.bulkDelete(

                    Math.min(
                        options.getInteger('amount'),
                        100
                    )

                );

                return interaction.reply({

                    content:
                        '🧹 Cleaned',

                    ephemeral: true

                });

            }

        }

    }

);


// =====================================================
// MEMBER JOIN
// =====================================================

client.on(

    'guildMemberAdd',

    async member => {

        addRadar(member.guild.id, 'join');

        sendDetailedLog(

            member.guild,

            'Member Joined',

            `<@${member.id}> joined`,

            '#2ecc71'

        );

        const rolesToAdd = [

            CONFIG.AUTO_ROLE,
            CONFIG.AUTO_ROLE_2

        ];

        await member.roles.add(
            rolesToAdd
        ).catch(() => { });

        updateLiveInfo(member.guild);

    }

);


// =====================================================
// MEMBER LEAVE
// =====================================================

client.on(

    'guildMemberRemove',

    member => {

        addRadar(member.guild.id, 'leave');

        sendDetailedLog(

            member.guild,

            'Member Left',

            member.user.tag,

            '#e74c3c'

        );

        updateLiveInfo(member.guild);

    }

);


// =====================================================
// LIVE INFO
// =====================================================

async function updateLiveInfo(guild) {

    if (!guild) {

        guild =
            client.guilds.cache.first();

    }

    const infoCh =
        client.channels.cache.get(
            CONFIG.INFO_CH
        );

    if (!infoCh || !guild) return;

    const embed =
        new EmbedBuilder()

            .setTitle(
                '📊 Pro Server Live Status'
            )

            .setDescription(`

👑 Owner:
<@${CONFIG.OWNER_ID}>

🤖 Robot:
<@${CONFIG.BOT_ID}>

🌍 Country:
Egypt

👥 Members:
${guild.memberCount}

🧠 Latest Update:
${extraServerInfo}

            `)

            .setColor('#3498db')

            .setTimestamp();

    try {

        const msgs =
            await infoCh.messages.fetch({
                limit: 10
            });

        msgs

            .filter(m =>
                m.author.id === client.user.id
            )

            .forEach(async m => {

                await m.delete()
                    .catch(() => { });

            });

        await infoCh.send({

            content: '@everyone',

            embeds: [embed]

        });

    } catch (e) {

        console.log(e);

    }

}


// =====================================================
// LOGIN
// =====================================================

client.login(process.env.TOKEN);
