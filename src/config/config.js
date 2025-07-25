const { GatewayIntentBits, Partials, ActivityType } = require('discord.js');
require('dotenv').config();

module.exports = {
    // Bot Configuration
    bot: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID,
        ownerId: process.env.OWNER_ID,
        testGuildId: process.env.TEST_GUILD_ID,
        
        // Bot Settings
        embedColor: '#0099ff',
        errorColor: '#ff0000',
        successColor: '#00ff00',
        warningColor: '#ffff00',
        
        // Activity Settings
        activity: {
            name: '/help | {servers} servers | Slash Commands Only',
            type: ActivityType.Watching
        },
        
        // Bot Intents (required for draft bidding)
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,    // For reading messages
            GatewayIntentBits.MessageContent    // Required for draft bidding via messages
            // Add these intents if you enable them in Discord Developer Portal:
            // GatewayIntentBits.GuildMembers,     // Requires "Server Members Intent"
            // GatewayIntentBits.GuildPresences    // Requires "Presence Intent"
        ],
        
        // Partials for better caching
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction,
            Partials.User,
            Partials.GuildMember
        ]
    },

    // External APIs
    apis: {
        topgg: {
            token: process.env.TOPGG_TOKEN,
            webhookAuth: process.env.TOPGG_WEBHOOK_AUTH,
            webhookPort: process.env.TOPGG_WEBHOOK_PORT || 3000
        }
    },

    // Database Configuration
    database: {
        url: process.env.DATABASE_URL,
        type: process.env.DATABASE_TYPE || 'mongodb',
        name: process.env.DATABASE_NAME || 'dbl_bot'
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        logToFile: process.env.LOG_TO_FILE === 'true',
        logDirectory: './logs'
    },

    // Command Configuration
    commands: {
        globalDeploy: process.env.GLOBAL_DEPLOY === 'true',
        guildDeploy: process.env.GUILD_DEPLOY === 'true',
        deleteUnused: process.env.DELETE_UNUSED_COMMANDS === 'true'
    },

    // Feature Flags
    features: {
        autoStats: process.env.AUTO_STATS !== 'false',
        webhooks: process.env.ENABLE_WEBHOOKS === 'true',
        analytics: process.env.ENABLE_ANALYTICS === 'true',
        maintenance: process.env.MAINTENANCE_MODE === 'true'
    },

    // Rate Limiting
    rateLimits: {
        commands: {
            global: 5, // commands per 10 seconds globally
            user: 3    // commands per 10 seconds per user
        }
    },

    // Embed Templates
    embeds: {
        footer: {
            text: 'Advanced DBL Bot • Cutting-Edge Discord.js v14',
            iconURL: null // Will be set to bot avatar when ready
        },
        author: {
            name: 'Advanced DBL Bot',
            iconURL: null // Will be set to bot avatar when ready
        }
    },

    // Component Configuration
    components: {
        maxButtonsPerRow: 5,
        maxSelectOptions: 25,
        maxActionRows: 5,
        defaultSelectPlaceholder: 'Select an option...',
        confirmationTimeout: 30000, // 30 seconds
        paginationTimeout: 300000   // 5 minutes
    },

    // Advanced Features
    advanced: {
        enableHotReload: process.env.NODE_ENV !== 'production',
        enableMetrics: process.env.ENABLE_METRICS === 'true',
        enableProfiling: process.env.ENABLE_PROFILING === 'true',
        maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE) || 1000,
        componentCacheTimeout: 600000, // 10 minutes
        interactionTimeout: 15000 // 15 seconds
    },

    // Validation
    validate() {
        const required = [
            'DISCORD_TOKEN',
            'CLIENT_ID'
        ];

        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Validate token format
        if (!process.env.DISCORD_TOKEN.match(/^[A-Za-z0-9._-]+$/)) {
            throw new Error('Invalid Discord token format');
        }

        // Validate client ID format
        if (!process.env.CLIENT_ID.match(/^\d{17,19}$/)) {
            throw new Error('Invalid Client ID format');
        }

        return true;
    }
};
