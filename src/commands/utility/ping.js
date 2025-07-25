const { SlashCommandBuilder } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder.js');
const { AdvancedComponentBuilder } = require('../../utils/componentBuilder.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Shows bot latency and API response time'),
    
    category: 'utility',
    cooldown: 3,
    
    async execute(interaction) {
        const startTime = Date.now();
        
        // Initial reply to measure response time
        await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        const embed = embedBuilder.ping(interaction.client, responseTime);
        
        // Add additional latency information
        embed.addFields(
            {
                name: '📡 Connection Quality',
                value: this.getConnectionQuality(interaction.client.ws.ping),
                inline: true
            },
            {
                name: '🌐 WebSocket Status',
                value: this.getWebSocketStatus(interaction.client.ws.status),
                inline: true
            },
            {
                name: '⚡ Performance',
                value: this.getPerformanceRating(interaction.client.ws.ping, responseTime),
                inline: true
            }
        );
        
        // Add action buttons using advanced component builder
        const components = new AdvancedComponentBuilder()
            .createRow()
            .addRefreshButton('ping_refresh')
            .addSecondaryButton('ping_detailed', 'Detailed Info', '📊')
            .addSecondaryButton('ping_history', 'History', '📈')
            .addDeleteButton('delete_ping')
            .build();

        await interaction.editReply({
            content: null,
            embeds: [embed],
            components
        });
    },

    getConnectionQuality(ping) {
        if (ping < 50) return '🟢 Excellent';
        if (ping < 100) return '🟡 Good';
        if (ping < 200) return '🟠 Fair';
        if (ping < 500) return '🔴 Poor';
        return '⚫ Very Poor';
    },

    getWebSocketStatus(status) {
        const statusMap = {
            0: '🔴 Connecting',
            1: '🟢 Open',
            2: '🟡 Closing',
            3: '🔴 Closed'
        };
        
        return statusMap[status] || '❓ Unknown';
    },

    getPerformanceRating(apiPing, responsePing) {
        const avgPing = (apiPing + responsePing) / 2;
        
        if (avgPing < 75) return '⭐⭐⭐⭐⭐ Excellent';
        if (avgPing < 150) return '⭐⭐⭐⭐ Good';
        if (avgPing < 250) return '⭐⭐⭐ Average';
        if (avgPing < 400) return '⭐⭐ Below Average';
        return '⭐ Poor';
    }
};
