const { UserSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

/**
 * Draft Handlers Service
 * Handles all Discord interactions for the draft system
 */
class DraftHandlers {
    constructor(draftCore, draftEmbeds, eventBus, logger) {
        this.draftCore = draftCore;
        this.embeds = draftEmbeds;
        this.eventBus = eventBus;
        this.logger = logger;
        
        this.setupEventListeners();
    }

    /**
     * Setup internal event listeners
     */
    setupEventListeners() {
        this.eventBus.subscribe('draft.created', this.handleDraftCreated.bind(this));
        this.eventBus.subscribe('draft.captain.added', this.handleCaptainAdded.bind(this));
        this.eventBus.subscribe('draft.captain.removed', this.handleCaptainRemoved.bind(this));
        this.eventBus.subscribe('draft.countdown.started', this.handleCountdownStarted.bind(this));
        this.eventBus.subscribe('draft.countdown.update', this.handleCountdownUpdate.bind(this));
        this.eventBus.subscribe('draft.started', this.handleDraftStarted.bind(this));
        this.eventBus.subscribe('draft.turn.started', this.handleTurnStarted.bind(this));
        this.eventBus.subscribe('draft.bid.placed', this.handleBidPlaced.bind(this));
        this.eventBus.subscribe('draft.completed', this.handleDraftCompleted.bind(this));
    }

    /**
     * Register interaction handlers
     * @param {Object} buttonHandler - Button handler
     * @param {Object} modalHandler - Modal handler
     * @param {Object} selectHandler - Select handler
     */
    registerHandlers(buttonHandler, modalHandler, selectHandler) {
        // Register button handlers
        buttonHandler.register('draft_join_captain', this.handleJoinCaptain.bind(this));
        buttonHandler.register('draft_leave_captain', this.handleLeaveCaptain.bind(this));
        buttonHandler.register('draft_cancel', this.handleCancelDraft.bind(this));
        buttonHandler.register('draft_bid_player', this.handleBidButton.bind(this));
        buttonHandler.register('draft_skip_turn', this.handleSkipButton.bind(this));
        buttonHandler.register('draft_end', this.handleEndButton.bind(this));

        // Register select menu handlers
        selectHandler.register('draft_player_select', this.handlePlayerSelect.bind(this));

        // Register modal handlers
        modalHandler.register('draft_bid', this.handleBidModal.bind(this));

        this.logger.debug('Draft interaction handlers registered');
    }

    /**
     * Handle join captain button
     * @param {Object} interaction - Discord interaction
     */
    async handleJoinCaptain(interaction) {
        try {
            const result = await this.draftCore.addCaptain(interaction.channelId, interaction.user.id);
            
            if (result.success) {
                await interaction.reply({
                    embeds: [this.embeds.createSuccessEmbed('Joined as Captain', 'You have successfully joined as a captain!')],
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Cannot Join', result.error)],
                    ephemeral: true
                });
            }
        } catch (error) {
            this.logger.error('Error handling join captain:', error);
            await this.handleInteractionError(interaction, 'Failed to join as captain');
        }
    }

    /**
     * Handle leave captain button
     * @param {Object} interaction - Discord interaction
     */
    async handleLeaveCaptain(interaction) {
        try {
            const result = await this.draftCore.removeCaptain(interaction.channelId, interaction.user.id);
            
            if (result.success) {
                await interaction.reply({
                    embeds: [this.embeds.createSuccessEmbed('Left Draft', 'You have left the draft.')],
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Cannot Leave', result.error)],
                    ephemeral: true
                });
            }
        } catch (error) {
            this.logger.error('Error handling leave captain:', error);
            await this.handleInteractionError(interaction, 'Failed to leave draft');
        }
    }

    /**
     * Handle cancel draft button
     * @param {Object} interaction - Discord interaction
     */
    async handleCancelDraft(interaction) {
        try {
            const draft = this.draftCore.getDraft(interaction.channelId);
            if (!draft) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Draft Not Found', 'No active draft found in this channel.')],
                    ephemeral: true
                });
            }

            // Check permissions
            if (interaction.user.id !== draft.managerId && !draft.captains.includes(interaction.user.id)) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('No Permission', 'Only the draft manager or captains can cancel the draft.')],
                    ephemeral: true
                });
            }

            // Cancel the draft
            draft.status = 'cancelled';
            await this.draftCore.repository.updateDraft(draft);

            // Emit event
            this.eventBus.emitEvent('draft.cancelled', { 
                draft,
                cancelledBy: interaction.user.id
            }, { source: 'DraftHandlers' });

            await interaction.reply({
                embeds: [this.embeds.createSuccessEmbed('Draft Cancelled', 'The draft has been cancelled.')],
                ephemeral: true
            });

        } catch (error) {
            this.logger.error('Error handling cancel draft:', error);
            await this.handleInteractionError(interaction, 'Failed to cancel draft');
        }
    }

    /**
     * Handle bid button - opens player selection
     * @param {Object} interaction - Discord interaction
     */
    async handleBidButton(interaction) {
        try {
            const draft = this.draftCore.getDraft(interaction.channelId);
            if (!draft) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Draft Not Found', 'No active draft found.')],
                    ephemeral: true
                });
            }

            // Check if it's user's turn
            const currentCaptain = draft.captains[draft.currentTurn];
            if (currentCaptain !== interaction.user.id) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Not Your Turn', 'Please wait for your turn to bid.')],
                    ephemeral: true
                });
            }

            // Create player selection embed
            const embed = this.embeds.createSuccessEmbed('Select Player to Bid On', 'Choose a player from the server to place your bid:');

            // Get server members (excluding bots and already drafted players)
            const guild = interaction.guild;
            const members = await guild.members.fetch();

            const draftedPlayers = new Set();
            for (const [_, team] of draft.teams) {
                team.players.forEach(p => draftedPlayers.add(p.id));
            }

            const availableMembers = members
                .filter(member => !member.user.bot && !draftedPlayers.has(member.id) && !draft.captains.includes(member.id))
                .first(25); // Discord limit

            if (availableMembers.size === 0) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('No Players Available', 'All eligible players have been drafted.')],
                    ephemeral: true
                });
            }

            // Create user select menu
            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('draft_player_select')
                .setPlaceholder('Select a player to bid on...')
                .setMaxValues(1);

            const components = [new ActionRowBuilder().addComponents(userSelect)];

            await interaction.reply({ embeds: [embed], components, ephemeral: true });

        } catch (error) {
            this.logger.error('Error handling bid button:', error);
            await this.handleInteractionError(interaction, 'Failed to open player selection');
        }
    }

    /**
     * Handle player selection from dropdown
     * @param {Object} interaction - Discord interaction
     */
    async handlePlayerSelect(interaction) {
        try {
            const playerId = interaction.values[0];
            
            // Create bid amount modal
            const modal = new ModalBuilder()
                .setCustomId(`draft_bid_${playerId}`)
                .setTitle('Place Your Bid');

            const bidInput = new TextInputBuilder()
                .setCustomId('bid_amount')
                .setLabel('Bid Amount ($)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter bid amount (e.g., 50)')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(4);

            const actionRow = new ActionRowBuilder().addComponents(bidInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);

        } catch (error) {
            this.logger.error('Error handling player select:', error);
            await this.handleInteractionError(interaction, 'Failed to open bid modal');
        }
    }

    /**
     * Handle bid modal submission
     * @param {Object} interaction - Discord interaction
     */
    async handleBidModal(interaction) {
        try {
            const playerId = interaction.customId.split('_')[2];
            const bidAmount = parseInt(interaction.fields.getTextInputValue('bid_amount'));

            if (isNaN(bidAmount) || bidAmount <= 0) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Invalid Bid', 'Please enter a valid positive number.')],
                    ephemeral: true
                });
            }

            const draft = this.draftCore.getDraft(interaction.channelId);
            if (!draft) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Draft Not Found', 'No active draft found.')],
                    ephemeral: true
                });
            }

            // Place the bid
            const result = await this.draftCore.placeBid(draft.id, interaction.user.id, playerId, bidAmount);

            if (result.success) {
                await interaction.reply({
                    embeds: [this.embeds.createBidConfirmationEmbed(interaction.user.id, playerId, bidAmount)],
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Bid Failed', result.error)],
                    ephemeral: true
                });
            }

        } catch (error) {
            this.logger.error('Error handling bid modal:', error);
            await this.handleInteractionError(interaction, 'Failed to process bid');
        }
    }

    /**
     * Handle skip turn button
     * @param {Object} interaction - Discord interaction
     */
    async handleSkipButton(interaction) {
        try {
            const draft = this.draftCore.getDraft(interaction.channelId);
            if (!draft) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Draft Not Found', 'No active draft found.')],
                    ephemeral: true
                });
            }

            const currentCaptain = draft.captains[draft.currentTurn];
            if (interaction.user.id !== currentCaptain && interaction.user.id !== draft.managerId) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('No Permission', 'Only the current captain or draft manager can skip turns.')],
                    ephemeral: true
                });
            }

            await this.draftCore.skipTurn(draft.id);

            await interaction.reply({
                embeds: [this.embeds.createTurnSkipEmbed(currentCaptain)],
                ephemeral: true
            });

        } catch (error) {
            this.logger.error('Error handling skip button:', error);
            await this.handleInteractionError(interaction, 'Failed to skip turn');
        }
    }

    /**
     * Handle end draft button
     * @param {Object} interaction - Discord interaction
     */
    async handleEndButton(interaction) {
        try {
            const draft = this.draftCore.getDraft(interaction.channelId);
            if (!draft) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('Draft Not Found', 'No active draft found.')],
                    ephemeral: true
                });
            }

            if (interaction.user.id !== draft.managerId) {
                return await interaction.reply({
                    embeds: [this.embeds.createErrorEmbed('No Permission', 'Only the draft manager can end the draft.')],
                    ephemeral: true
                });
            }

            await this.draftCore.completeDraft(draft.id);

            await interaction.reply({
                embeds: [this.embeds.createSuccessEmbed('Draft Ended', 'The draft has been ended by the manager.')],
                ephemeral: true
            });

        } catch (error) {
            this.logger.error('Error handling end button:', error);
            await this.handleInteractionError(interaction, 'Failed to end draft');
        }
    }

    /**
     * Handle draft created event
     * @param {Object} eventData - Event data
     */
    async handleDraftCreated(eventData) {
        // Implementation for handling draft creation
        this.logger.debug(`Draft created: ${eventData.data.draft.id}`);
    }

    /**
     * Handle captain added event
     * @param {Object} eventData - Event data
     */
    async handleCaptainAdded(eventData) {
        // Update draft message if needed
        this.logger.debug(`Captain added to draft: ${eventData.data.captainId}`);
    }

    /**
     * Handle captain removed event
     * @param {Object} eventData - Event data
     */
    async handleCaptainRemoved(eventData) {
        // Update draft message if needed
        this.logger.debug(`Captain removed from draft: ${eventData.data.captainId}`);
    }

    /**
     * Handle countdown started event
     * @param {Object} eventData - Event data
     */
    async handleCountdownStarted(eventData) {
        // Update draft message to show countdown
        this.logger.debug(`Countdown started for draft: ${eventData.data.draft.id}`);
    }

    /**
     * Handle countdown update event
     * @param {Object} eventData - Event data
     */
    async handleCountdownUpdate(eventData) {
        // Update countdown display
        this.logger.debug(`Countdown update: ${eventData.data.remaining}s remaining`);
    }

    /**
     * Handle draft started event
     * @param {Object} eventData - Event data
     */
    async handleDraftStarted(eventData) {
        // Update draft message to show active state
        this.logger.debug(`Draft started: ${eventData.data.draft.id}`);
    }

    /**
     * Handle turn started event
     * @param {Object} eventData - Event data
     */
    async handleTurnStarted(eventData) {
        // Update draft message to show current turn
        this.logger.debug(`Turn started for: ${eventData.data.currentCaptain}`);
    }

    /**
     * Handle bid placed event
     * @param {Object} eventData - Event data
     */
    async handleBidPlaced(eventData) {
        // Update draft message to reflect new bid
        this.logger.debug(`Bid placed: ${eventData.data.captainId} -> ${eventData.data.playerId} ($${eventData.data.amount})`);
    }

    /**
     * Handle draft completed event
     * @param {Object} eventData - Event data
     */
    async handleDraftCompleted(eventData) {
        // Update draft message to show completion
        this.logger.debug(`Draft completed: ${eventData.data.draft.id}`);
    }

    /**
     * Handle interaction errors
     * @param {Object} interaction - Discord interaction
     * @param {string} message - Error message
     */
    async handleInteractionError(interaction, message) {
        try {
            const embed = this.embeds.createErrorEmbed('Error', message);
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            this.logger.error('Error handling interaction error:', error);
        }
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        this.logger.info('Shutting down DraftHandlers service...');
        // No specific cleanup needed
        this.logger.success('DraftHandlers service shutdown complete');
    }
}

module.exports = DraftHandlers;
