const logger = require('../utils/logger.js');
const embedBuilder = require('../utils/embedBuilder.js');
const config = require('../config/config.js');

module.exports = {
    name: 'interactionCreate',
    async execute(client, interaction) {
        // Check if bot is in maintenance mode
        if (config.features.maintenance && interaction.user.id !== config.bot.ownerId) {
            const embed = embedBuilder.warning(
                'Maintenance Mode',
                'The bot is currently under maintenance. Please try again later.'
            );
            
            if (interaction.isRepliable()) {
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }
            return;
        }

        try {
            // Handle different interaction types
            if (interaction.isChatInputCommand()) {
                await client.commandHandler.handleSlashCommand(interaction);
            } else if (interaction.isContextMenuCommand()) {
                await client.interactionHandler.handleContextMenuInteraction(interaction);
            } else if (interaction.isButton()) {
                // Handle draft buttons specifically
                if (interaction.customId.startsWith('draft_')) {
                    await handleDraftButton(client, interaction);
                } else {
                    await client.interactionHandler.handleButtonInteraction(interaction);
                }
            } else if (interaction.isAnySelectMenu()) {
                // Handle draft select menus specifically
                if (interaction.customId.startsWith('draft_')) {
                    await handleDraftSelect(client, interaction);
                } else {
                    await client.interactionHandler.handleSelectMenuInteraction(interaction);
                }
            } else if (interaction.isModalSubmit()) {
                // Handle draft modals specifically
                if (interaction.customId.startsWith('draft_')) {
                    await handleDraftModal(client, interaction);
                } else {
                    await client.interactionHandler.handleModalInteraction(interaction);
                }
            } else if (interaction.isAutocomplete()) {
                await client.interactionHandler.handleAutocompleteInteraction(interaction);
            }
        } catch (error) {
            logger.error('Error handling interaction:', error);
            
            const embed = embedBuilder.error(
                'Interaction Error',
                'An unexpected error occurred while processing your interaction.'
            );

            try {
                if (interaction.isRepliable()) {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ embeds: [embed], flags: 64 });
                    } else {
                        await interaction.reply({ embeds: [embed], flags: 64 });
                    }
                }
            } catch (followUpError) {
                logger.error('Error sending error message:', followUpError);
            }
        }
    }
};

// Handle draft button interactions
async function handleDraftButton(client, interaction) {
    try {
        if (!client.draftManager) {
            const DraftManager = require('../utils/draftManager.js');
            client.draftManager = new DraftManager(client);
        }

        const customId = interaction.customId;
        const params = customId.split('_').slice(1); // Remove 'draft' prefix
        const action = params[0];

        switch (action) {
            case 'confirm':
                if (params[1] === 'start') {
                    // Parse settings from button ID: draft_confirm_start_2_5_1000
                    const captains = parseInt(params[2]);
                    const rosterSize = parseInt(params[3]);
                    const budget = parseInt(params[4]);
                    
                    await client.draftManager.handleConfirmStart(interaction, { captains, rosterSize, budget });
                }
                break;
            case 'cancel':
                if (params[1] === 'start') {
                    await client.draftManager.handleCancelStart(interaction);
                } else {
                    await client.draftManager.handleCancelDraft(interaction);
                }
                break;
            case 'join':
                if (params[1] === 'captain') {
                    await client.draftManager.handleJoinCaptain(interaction);
                }
                break;
            case 'leave':
                if (params[1] === 'captain') {
                    await client.draftManager.handleLeaveCaptain(interaction);
                }
                break;
            case 'bid':
                if (params[1] === 'player') {
                    await client.draftManager.handleBidButton(interaction);
                }
                break;
            case 'skip':
                if (params[1] === 'turn') {
                    await client.draftManager.handleSkipButton(interaction);
                }
                break;
            case 'end':
                await client.draftManager.handleEndButton(interaction);
                break;
            default:
                logger.warn(`Unknown draft button action: ${action}`);
        }
    } catch (error) {
        logger.error('Draft button error:', error);
        const embed = embedBuilder.error('Button Error', 'Failed to handle draft button interaction.');
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
    }
}

// Handle draft select menu interactions
async function handleDraftSelect(client, interaction) {
    try {
        if (!client.draftManager) {
            const DraftManager = require('../utils/draftManager.js');
            client.draftManager = new DraftManager(client);
        }

        if (interaction.customId === 'draft_player_select') {
            await client.draftManager.handlePlayerSelect(interaction);
        }
    } catch (error) {
        logger.error('Draft select error:', error);
    }
}

// Handle draft modal interactions
async function handleDraftModal(client, interaction) {
    try {
        if (!client.draftManager) {
            const DraftManager = require('../utils/draftManager.js');
            client.draftManager = new DraftManager(client);
        }

        if (interaction.customId.startsWith('draft_bid_')) {
            const playerId = interaction.customId.split('_')[2];
            await client.draftManager.handleBidModal(interaction, [playerId]);
        }
    } catch (error) {
        logger.error('Draft modal error:', error);
    }
}




