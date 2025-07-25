const { Collection } = require('discord.js');

/**
 * Draft Core Service - Central draft logic and state management
 * Handles draft creation, state transitions, and business logic
 */
class DraftCore {
    constructor(draftRepository, draftValidation, draftTimers, eventBus, logger) {
        this.repository = draftRepository;
        this.validation = draftValidation;
        this.timers = draftTimers;
        this.eventBus = eventBus;
        this.logger = logger;
        
        // In-memory draft state
        this.activeDrafts = new Collection(); // channelId -> draft data
        this.draftMessages = new Collection(); // draftId -> message object
        
        this.setupEventListeners();
    }

    /**
     * Setup internal event listeners
     */
    setupEventListeners() {
        this.eventBus.subscribe('draft.timer.expired', this.handleTimerExpired.bind(this));
        this.eventBus.subscribe('draft.countdown.finished', this.handleCountdownFinished.bind(this));
    }

    /**
     * Create a new draft session
     * @param {Object} options - Draft creation options
     * @returns {Object} Created draft
     */
    async createDraft(options) {
        try {
            // Validate input
            const validationResult = this.validation.validateDraftCreation(options);
            if (!validationResult.isValid) {
                throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }

            const draftId = this.generateDraftId();
            
            const draft = {
                id: draftId,
                guildId: options.guildId,
                channelId: options.channelId,
                managerId: options.managerId,
                settings: {
                    maxCaptains: options.captains || 2,
                    rosterSize: options.rosterSize || 5,
                    budget: options.budget || 100,
                    turnTime: 30, // seconds
                    bidTime: 10   // seconds for next turn after bid
                },
                status: 'waiting', // waiting, countdown, active, completed, cancelled
                captains: [],
                teams: new Collection(),
                currentTurn: 0,
                round: 1,
                countdown: null,
                turnTimer: null,
                createdAt: new Date(),
                logs: []
            };

            // Store in memory and database
            this.activeDrafts.set(options.channelId, draft);
            await this.repository.saveDraft(draft);

            // Emit event
            this.eventBus.emitEvent('draft.created', { draft }, { source: 'DraftCore' });

            this.logger.info(`Draft created: ${draftId} in guild ${options.guildId}`);
            return draft;

        } catch (error) {
            this.logger.error('Error creating draft:', error);
            throw error;
        }
    }

    /**
     * Add captain to draft
     * @param {string} channelId - Channel ID
     * @param {string} userId - User ID
     * @returns {Object} Result object
     */
    async addCaptain(channelId, userId) {
        try {
            const draft = this.getDraft(channelId);
            if (!draft) {
                return { success: false, error: 'Draft not found' };
            }

            // Validate captain addition
            const validationResult = this.validation.validateCaptainAddition(draft, userId);
            if (!validationResult.isValid) {
                return { success: false, error: validationResult.errors[0] };
            }

            // Add captain
            draft.captains.push(userId);
            draft.teams.set(userId, {
                captainId: userId,
                players: [],
                budget: draft.settings.budget,
                spent: 0
            });

            // Update database
            await this.repository.updateDraft(draft);

            // Emit event
            this.eventBus.emitEvent('draft.captain.added', { 
                draft, 
                captainId: userId 
            }, { source: 'DraftCore' });

            // Check if we can start countdown
            if (draft.captains.length >= draft.settings.maxCaptains) {
                await this.startCountdown(draft.id);
            }

            this.logger.debug(`Captain added to draft ${draft.id}: ${userId}`);
            return { success: true, draft };

        } catch (error) {
            this.logger.error('Error adding captain:', error);
            return { success: false, error: 'Internal error' };
        }
    }

    /**
     * Remove captain from draft
     * @param {string} channelId - Channel ID
     * @param {string} userId - User ID
     * @returns {Object} Result object
     */
    async removeCaptain(channelId, userId) {
        try {
            const draft = this.getDraft(channelId);
            if (!draft) {
                return { success: false, error: 'Draft not found' };
            }

            if (draft.status !== 'waiting') {
                return { success: false, error: 'Cannot leave after draft has started' };
            }

            const captainIndex = draft.captains.indexOf(userId);
            if (captainIndex === -1) {
                return { success: false, error: 'You are not a captain' };
            }

            // Remove captain
            draft.captains.splice(captainIndex, 1);
            draft.teams.delete(userId);

            // Update database
            await this.repository.updateDraft(draft);

            // Emit event
            this.eventBus.emitEvent('draft.captain.removed', { 
                draft, 
                captainId: userId 
            }, { source: 'DraftCore' });

            this.logger.debug(`Captain removed from draft ${draft.id}: ${userId}`);
            return { success: true, draft };

        } catch (error) {
            this.logger.error('Error removing captain:', error);
            return { success: false, error: 'Internal error' };
        }
    }

    /**
     * Start countdown for draft
     * @param {string} draftId - Draft ID
     */
    async startCountdown(draftId) {
        const draft = this.getDraftById(draftId);
        if (!draft || draft.status !== 'waiting') {
            return;
        }

        draft.status = 'countdown';
        draft.countdown = 10; // 10 second countdown

        await this.repository.updateDraft(draft);

        // Start countdown timer
        this.timers.startCountdown(draftId, 10);

        // Emit event
        this.eventBus.emitEvent('draft.countdown.started', { 
            draft 
        }, { source: 'DraftCore' });

        this.logger.info(`Countdown started for draft ${draftId}`);
    }

    /**
     * Start the actual draft
     * @param {string} draftId - Draft ID
     */
    async startDraft(draftId) {
        const draft = this.getDraftById(draftId);
        if (!draft || draft.status !== 'countdown') {
            return;
        }

        draft.status = 'active';
        draft.currentTurn = 0;
        draft.round = 1;

        await this.repository.updateDraft(draft);

        // Start first turn
        await this.startTurn(draftId);

        // Emit event
        this.eventBus.emitEvent('draft.started', { 
            draft 
        }, { source: 'DraftCore' });

        this.logger.info(`Draft started: ${draftId}`);
    }

    /**
     * Start a captain's turn
     * @param {string} draftId - Draft ID
     */
    async startTurn(draftId) {
        const draft = this.getDraftById(draftId);
        if (!draft || draft.status !== 'active') {
            return;
        }

        // Start turn timer
        this.timers.startTurnTimer(draftId, draft.settings.turnTime);

        // Emit event
        this.eventBus.emitEvent('draft.turn.started', { 
            draft,
            currentCaptain: draft.captains[draft.currentTurn]
        }, { source: 'DraftCore' });

        this.logger.debug(`Turn started for draft ${draftId}, captain: ${draft.captains[draft.currentTurn]}`);
    }

    /**
     * Place a bid on a player
     * @param {string} draftId - Draft ID
     * @param {string} captainId - Captain ID
     * @param {string} playerId - Player ID
     * @param {number} amount - Bid amount
     * @returns {Object} Result object
     */
    async placeBid(draftId, captainId, playerId, amount) {
        try {
            const draft = this.getDraftById(draftId);
            if (!draft) {
                return { success: false, error: 'Draft not found' };
            }

            // Validate bid
            const validationResult = this.validation.validateBid(draft, captainId, playerId, amount);
            if (!validationResult.isValid) {
                return { success: false, error: validationResult.errors[0] };
            }

            // Process bid
            const team = draft.teams.get(captainId);
            team.players.push({ id: playerId, amount });
            team.spent += amount;

            // Add to logs
            draft.logs.push({
                type: 'pick',
                captainId,
                playerId,
                amount,
                round: draft.round,
                timestamp: new Date()
            });

            // Update database
            await this.repository.updateDraft(draft);

            // Stop current turn timer
            this.timers.stopTimer(draftId, 'turn');

            // Emit event
            this.eventBus.emitEvent('draft.bid.placed', { 
                draft,
                captainId,
                playerId,
                amount
            }, { source: 'DraftCore' });

            // Check if draft is complete
            if (this.isDraftComplete(draft)) {
                await this.completeDraft(draftId);
            } else {
                // Start bid countdown
                this.timers.startBidCountdown(draftId, draft.settings.bidTime);
            }

            this.logger.info(`Bid placed in draft ${draftId}: ${captainId} -> ${playerId} ($${amount})`);
            return { success: true, draft };

        } catch (error) {
            this.logger.error('Error placing bid:', error);
            return { success: false, error: 'Internal error' };
        }
    }

    /**
     * Get draft by channel ID
     * @param {string} channelId - Channel ID
     * @returns {Object|null} Draft object
     */
    getDraft(channelId) {
        return this.activeDrafts.get(channelId);
    }

    /**
     * Get draft by draft ID
     * @param {string} draftId - Draft ID
     * @returns {Object|null} Draft object
     */
    getDraftById(draftId) {
        for (const draft of this.activeDrafts.values()) {
            if (draft.id === draftId) {
                return draft;
            }
        }
        return null;
    }

    /**
     * Generate unique draft ID
     * @returns {string} Draft ID
     */
    generateDraftId() {
        return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Check if draft is complete
     * @param {Object} draft - Draft object
     * @returns {boolean} Is complete
     */
    isDraftComplete(draft) {
        for (const team of draft.teams.values()) {
            if (team.players.length < draft.settings.rosterSize) {
                return false;
            }
        }
        return true;
    }

    /**
     * Complete the draft
     * @param {string} draftId - Draft ID
     */
    async completeDraft(draftId) {
        const draft = this.getDraftById(draftId);
        if (!draft) return;

        draft.status = 'completed';
        draft.completedAt = new Date();

        await this.repository.updateDraft(draft);

        // Stop all timers
        this.timers.stopAllTimers(draftId);

        // Emit event
        this.eventBus.emitEvent('draft.completed', { 
            draft 
        }, { source: 'DraftCore' });

        this.logger.info(`Draft completed: ${draftId}`);
    }

    /**
     * Handle timer expiration
     * @param {Object} eventData - Event data
     */
    async handleTimerExpired(eventData) {
        const { draftId, timerType } = eventData.data;
        
        if (timerType === 'turn') {
            await this.skipTurn(draftId);
        }
    }

    /**
     * Handle countdown finished
     * @param {Object} eventData - Event data
     */
    async handleCountdownFinished(eventData) {
        const { draftId } = eventData.data;
        await this.startDraft(draftId);
    }

    /**
     * Skip current turn
     * @param {string} draftId - Draft ID
     */
    async skipTurn(draftId) {
        const draft = this.getDraftById(draftId);
        if (!draft || draft.status !== 'active') {
            return;
        }

        // Move to next captain
        draft.currentTurn = (draft.currentTurn + 1) % draft.captains.length;
        
        // Check if we completed a round
        if (draft.currentTurn === 0) {
            draft.round++;
        }

        await this.repository.updateDraft(draft);

        // Emit event
        this.eventBus.emitEvent('draft.turn.skipped', { 
            draft 
        }, { source: 'DraftCore' });

        // Start next turn
        await this.startTurn(draftId);

        this.logger.debug(`Turn skipped in draft ${draftId}`);
    }

    /**
     * Shutdown the service
     */
    async shutdown() {
        this.logger.info('Shutting down DraftCore service...');
        
        // Stop all active timers
        for (const draft of this.activeDrafts.values()) {
            this.timers.stopAllTimers(draft.id);
        }
        
        this.activeDrafts.clear();
        this.draftMessages.clear();
        
        this.logger.success('DraftCore service shutdown complete');
    }
}

module.exports = DraftCore;
