const { Client, GatewayIntentBits } = require('discord.js');
const logger = require('../utils/logger.js');
const config = require('../config/config.js');

// Import handler classes
const CommandHandler = require('../handlers/commandHandler.js');
const EventHandler = require('../handlers/eventHandler.js');

/**
 * Main Application Orchestrator
 * Simplified version for basic bot functionality
 */
class Application {
    constructor() {
        this.client = null;
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.startTime = Date.now();

        // Handler instances will be created after client is ready
        this.commandHandler = null;
        this.eventHandler = null;

        // Bind shutdown handlers
        this.setupGracefulShutdown();
    }

    /**
     * Initialize the application
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('🚀 Starting Quantum Discord Bot...');
            logger.info('🚀 Starting Quantum Discord Bot...');

            // Validate configuration
            console.log('🔍 Validating configuration...');
            await this.validateConfiguration();

            // Create Discord client
            console.log('🤖 Creating Discord client...');
            await this.createDiscordClient();

            // Load commands and events
            console.log('⚡ Loading commands...');
            await this.loadCommands();

            console.log('📡 Loading events...');
            await this.loadEvents();

            // Connect to Discord
            console.log('🌐 Connecting to Discord...');
            await this.connectToDiscord();

            this.isInitialized = true;
            console.log('🌌 Quantum Discord Bot initialized successfully!');
            logger.success('🌌 Quantum Discord Bot initialized successfully!');

        } catch (error) {
            console.error('💥 Failed to initialize application:', error);
            logger.error('💥 Failed to initialize application:', error);
            throw error;
        }
    }

    /**
     * Validate configuration
     */
    async validateConfiguration() {
        logger.debug('🔍 Validating configuration...');

        if (!config.bot?.token) {
            throw new Error('Discord token is required');
        }

        if (!config.bot?.clientId) {
            throw new Error('Client ID is required');
        }

        if (!config.bot?.intents || !Array.isArray(config.bot.intents)) {
            throw new Error('Bot intents must be an array');
        }

        logger.debug('✅ Configuration validation passed');
    }

    /**
     * Create Discord client
     */
    async createDiscordClient() {
        logger.debug('🤖 Creating Discord client...');

        this.client = new Client({
            intents: config.bot.intents.map(intent => GatewayIntentBits[intent]),
            presence: config.bot.presence || {
                status: 'online',
                activities: [{
                    name: 'with quantum mechanics',
                    type: 0 // PLAYING
                }]
            }
        });

        // Store application reference for backward compatibility (use different property name)
        this.client.app = this;

        // Create handler instances
        this.commandHandler = new CommandHandler(this.client);
        this.eventHandler = new EventHandler(this.client);

        logger.debug('✅ Discord client created');
    }

    /**
     * Load commands
     */
    async loadCommands() {
        console.log('⚡ Loading commands...');
        logger.debug('⚡ Loading commands...');
        try {
            await this.commandHandler.loadCommands();
            console.log('✅ Commands loaded successfully');
            logger.debug('✅ Commands loaded successfully');
        } catch (error) {
            console.error('💥 Error loading commands:', error);
            throw error;
        }
    }

    /**
     * Load events
     */
    async loadEvents() {
        console.log('📡 Loading events...');
        logger.debug('📡 Loading events...');
        try {
            await this.eventHandler.loadEvents();
            console.log('✅ Events loaded successfully');
            logger.debug('✅ Events loaded successfully');
        } catch (error) {
            console.error('💥 Error loading events:', error);
            throw error;
        }
    }

    /**
     * Connect to Discord
     */
    async connectToDiscord() {
        logger.info('🌐 Connecting to Discord...');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout after 30 seconds'));
            }, 30000);

            this.client.once('ready', () => {
                clearTimeout(timeout);
                logger.success(`🎉 Connected as ${this.client.user.tag}!`);
                resolve();
            });

            this.client.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            this.client.login(config.bot.token);
        });
    }

    /**
     * Setup graceful shutdown handlers
     */
    setupGracefulShutdown() {
        const shutdownHandler = async (signal) => {
            if (this.isShuttingDown) {
                return;
            }

            logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
            this.isShuttingDown = true;

            try {
                if (this.client) {
                    await this.client.destroy();
                    logger.info('🤖 Discord client disconnected');
                }

                logger.success('🌌 Quantum Discord Bot shutdown complete');
                process.exit(0);
            } catch (error) {
                logger.error('💥 Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGINT', shutdownHandler);
        process.on('SIGTERM', shutdownHandler);
        process.on('uncaughtException', (error) => {
            logger.error('💥 Uncaught exception:', error);
            shutdownHandler('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled rejection:', reason);
            logger.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
            shutdownHandler('unhandledRejection');
        });
    }

    /**
     * Get application statistics
     */
    getStats() {
        return {
            uptime: Date.now() - this.startTime,
            memoryUsage: process.memoryUsage(),
            guildsCount: this.client?.guilds?.cache?.size || 0,
            usersCount: this.client?.users?.cache?.size || 0,
            channelsCount: this.client?.channels?.cache?.size || 0,
            ping: this.client?.ws?.ping || 0
        };
    }


}

module.exports = Application;
