const logger = require('../utils/logger.js');

module.exports = {
    name: 'messageCreate',
    async execute(client, message) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Get services from the application container
        const app = client.application;
        if (!app) return;

        try {
            const draftCore = app.getService('draftCore');
            const draftEmbeds = app.getService('draftEmbeds');

            // Check if there's an active draft in this channel
            const draft = draftCore.getDraft(message.channelId);
            if (!draft || draft.status !== 'active') return;

            // Check if message contains a mention and a number (bid format: @user 50)
            const mentionRegex = /<@!?(\d+)>\s+(\d+)/;
            const match = message.content.match(mentionRegex);

            if (!match) return;

            const mentionedUserId = match[1];
            const bidAmount = parseInt(match[2]);

            // Validate bid amount
            if (isNaN(bidAmount) || bidAmount <= 0) return;

            // Check if it's the user's turn
            const currentCaptain = draft.captains[draft.currentTurn];
            if (currentCaptain !== message.author.id) {
                // Send ephemeral-like message that deletes after 5 seconds
                const errorEmbed = draftEmbeds.createErrorEmbed('Not Your Turn', 'Please wait for your turn to bid.');
                const errorMsg = await message.reply({ embeds: [errorEmbed] });
                setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
                return;
            }

            // Process the bid
            const result = await draftCore.placeBid(draft.id, message.author.id, mentionedUserId, bidAmount);

            if (result.success) {
                // React to the message to show it was processed
                await message.react('✅');

                // The draft system will automatically update embeds via events
                logger.debug(`Message bid processed: ${message.author.id} -> ${mentionedUserId} ($${bidAmount})`);
            } else {
                // React with error and send temporary error message
                await message.react('❌');
                const errorEmbed = draftEmbeds.createErrorEmbed('Bid Failed', result.error);
                const errorMsg = await message.reply({ embeds: [errorEmbed] });
                setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
            }
        } catch (error) {
            logger.error('Draft message bid error:', error);
            await message.react('❌').catch(() => {});
        }
    }
};
