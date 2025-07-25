// Load environment variables
require('dotenv').config();

console.log('🚀 Starting Quantum Discord Bot...');

const Application = require('./core/Application.js');
const logger = require('./utils/logger.js');

/**
 * Main Entry Point
 * Initialize and start the Discord bot application
 */
async function main() {
    try {
        console.log('🚀 Starting Quantum Discord Bot...');
        logger.info(`Starting DBL Bot Advanced... (PID: ${process.pid})`);
        logger.info('Using new modular architecture with service container');

        // Create and initialize application
        console.log('📦 Creating application...');
        const app = new Application();

        console.log('⚡ Initializing application...');
        await app.initialize();

        console.log('🚀 Bot is now online and ready!');
        logger.success('🚀 Bot is now online and ready!');

        // Log application statistics
        const stats = app.getStats();
        console.log('📊 Application Stats:', {
            uptime: `${Math.round(stats.uptime / 1000)}s`,
            memory: `${Math.round(stats.memoryUsage.heapUsed / 1024 / 1024)}MB`,
            guilds: stats.guildsCount,
            users: stats.usersCount,
            ping: `${stats.ping}ms`
        });

        logger.info(`📊 Application Stats:`, {
            uptime: `${Math.round(stats.uptime / 1000)}s`,
            memory: `${Math.round(stats.memoryUsage.heapUsed / 1024 / 1024)}MB`,
            guilds: stats.guildsCount,
            users: stats.usersCount,
            ping: `${stats.ping}ms`
        });

    } catch (error) {
        console.error('❌ Failed to start application:', error);
        logger.error('❌ Failed to start application:', error);

        // Provide specific error guidance
        if (error.message.includes('Discord token')) {
            logger.error('💡 Make sure DISCORD_TOKEN is set in your .env file');
        } else if (error.message.includes('intents')) {
            logger.error('💡 Enable required intents in Discord Developer Portal');
        } else if (error.message.includes('database')) {
            logger.error('💡 Check your database configuration');
        }

        process.exit(1);
    }
}

// Start the application
console.log('🌌 Starting main function...');
main().catch(error => {
    console.error('💥 Main function failed:', error);
    process.exit(1);
});