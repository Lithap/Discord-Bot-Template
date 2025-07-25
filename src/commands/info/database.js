const { SlashCommandBuilder } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder.js');
const { AdvancedComponentBuilder } = require('../../utils/componentBuilder.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('database')
        .setDescription('Shows database connection status and statistics')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check database connection status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show database statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('health')
                .setDescription('Perform database health check')
        ),
    
    category: 'info',
    cooldown: 5,
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        await interaction.deferReply();
        
        switch (subcommand) {
            case 'status':
                await this.showStatus(interaction);
                break;
            case 'stats':
                await this.showStats(interaction);
                break;
            case 'health':
                await this.performHealthCheck(interaction);
                break;
            default:
                await this.showStatus(interaction);
                break;
        }
    },

    async showStatus(interaction) {
        const database = interaction.client.database;
        
        const embed = embedBuilder.createEmbed({ color: '#5865f2' });
        embed.setTitle('📊 Database Status');
        
        if (!database) {
            embed.setDescription('❌ Database not configured');
            embed.addFields({
                name: 'Status',
                value: 'No database connection available',
                inline: false
            });
            embed.setColor('#f04747');
        } else {
            const status = database.getStatus();
            const isHealthy = await database.healthCheck();
            
            embed.setDescription(`${isHealthy ? '✅' : '❌'} Database Connection`);
            
            embed.addFields(
                { name: 'Type', value: status.type, inline: true },
                { name: 'Status', value: status.status, inline: true },
                { name: 'Health', value: isHealthy ? '🟢 Healthy' : '🔴 Unhealthy', inline: true }
            );
            
            if (status.details && typeof status.details === 'object') {
                embed.addFields({
                    name: 'Details',
                    value: `**Database:** ${status.details.database}\n**Collections:** ${status.details.collections}`,
                    inline: false
                });
            }
            
            embed.setColor(isHealthy ? '#00d26a' : '#f04747');
        }
        
        const components = new AdvancedComponentBuilder()
            .createRow()
            .addRefreshButton('database_refresh')
            .addSecondaryButton('database_stats', 'Statistics', '📈')
            .addSecondaryButton('database_health', 'Health Check', '🔍')
            .build();
        
        embed.setFooter({ text: 'DBL Bot • Database Status' });
        
        await interaction.editReply({ embeds: [embed], components });
    },

    async showStats(interaction) {
        const database = interaction.client.database;
        
        const embed = embedBuilder.createEmbed({ color: '#5865f2' });
        embed.setTitle('📈 Database Statistics');
        
        if (!database || !database.isAvailable()) {
            embed.setDescription('❌ Database not available');
            embed.setColor('#f04747');
        } else {
            try {
                const stats = await database.getStats();
                
                if (stats) {
                    embed.setDescription('📊 Current database statistics');
                    
                    embed.addFields(
                        { name: '🏠 Guilds', value: stats.guilds.toString(), inline: true },
                        { name: '👥 Users', value: stats.users.toString(), inline: true },
                        { name: '📋 Total Drafts', value: stats.drafts.toString(), inline: true },
                        { name: '🟢 Active Drafts', value: stats.activeDrafts.toString(), inline: true },
                        { name: '✅ Completed Drafts', value: stats.completedDrafts.toString(), inline: true },
                        { name: '📊 Collections', value: '8 collections', inline: true }
                    );
                    
                    embed.setColor('#00d26a');
                } else {
                    embed.setDescription('❌ Failed to retrieve statistics');
                    embed.setColor('#f04747');
                }
            } catch (error) {
                embed.setDescription('❌ Error retrieving statistics');
                embed.addFields({
                    name: 'Error',
                    value: error.message,
                    inline: false
                });
                embed.setColor('#f04747');
            }
        }
        
        const components = new AdvancedComponentBuilder()
            .createRow()
            .addRefreshButton('database_stats_refresh')
            .addSecondaryButton('database_status', 'Status', '📊')
            .addSecondaryButton('database_health', 'Health Check', '🔍')
            .build();
        
        embed.setFooter({ text: 'DBL Bot • Database Statistics' });
        
        await interaction.editReply({ embeds: [embed], components });
    },

    async performHealthCheck(interaction) {
        const database = interaction.client.database;
        
        const embed = embedBuilder.createEmbed({ color: '#5865f2' });
        embed.setTitle('🔍 Database Health Check');
        
        if (!database) {
            embed.setDescription('❌ Database not configured');
            embed.setColor('#f04747');
        } else {
            try {
                const startTime = Date.now();
                const isHealthy = await database.healthCheck();
                const responseTime = Date.now() - startTime;
                
                embed.setDescription(`${isHealthy ? '✅ Health check passed' : '❌ Health check failed'}`);
                
                embed.addFields(
                    { name: 'Connection', value: isHealthy ? '🟢 Active' : '🔴 Failed', inline: true },
                    { name: 'Response Time', value: `${responseTime}ms`, inline: true },
                    { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
                );
                
                if (isHealthy) {
                    embed.addFields({
                        name: 'Status',
                        value: '✅ Database is responding normally\n✅ Connection is stable\n✅ Operations are functional',
                        inline: false
                    });
                } else {
                    embed.addFields({
                        name: 'Issues',
                        value: '❌ Database connection failed\n❌ Health check timeout\n❌ Operations may be affected',
                        inline: false
                    });
                }
                
                embed.setColor(isHealthy ? '#00d26a' : '#f04747');
            } catch (error) {
                embed.setDescription('❌ Health check error');
                embed.addFields({
                    name: 'Error Details',
                    value: error.message,
                    inline: false
                });
                embed.setColor('#f04747');
            }
        }
        
        const components = new AdvancedComponentBuilder()
            .createRow()
            .addRefreshButton('database_health_refresh')
            .addSecondaryButton('database_status', 'Status', '📊')
            .addSecondaryButton('database_stats', 'Statistics', '📈')
            .build();
        
        embed.setFooter({ text: 'DBL Bot • Database Health Check' });
        
        await interaction.editReply({ embeds: [embed], components });
    }
};
