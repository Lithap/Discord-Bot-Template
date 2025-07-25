/**
 * Draft Validation Service
 * Handles all validation logic for draft operations
 */
class DraftValidation {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Validate draft creation parameters
     * @param {Object} options - Draft creation options
     * @returns {Object} Validation result
     */
    validateDraftCreation(options) {
        const errors = [];

        // Required fields
        if (!options.guildId) {
            errors.push('Guild ID is required');
        }

        if (!options.channelId) {
            errors.push('Channel ID is required');
        }

        if (!options.managerId) {
            errors.push('Manager ID is required');
        }

        // Optional fields with defaults and validation
        if (options.captains !== undefined) {
            if (!Number.isInteger(options.captains) || options.captains < 2 || options.captains > 10) {
                errors.push('Captains must be between 2 and 10');
            }
        }

        if (options.rosterSize !== undefined) {
            if (!Number.isInteger(options.rosterSize) || options.rosterSize < 1 || options.rosterSize > 20) {
                errors.push('Roster size must be between 1 and 20');
            }
        }

        if (options.budget !== undefined) {
            if (!Number.isInteger(options.budget) || options.budget < 10 || options.budget > 1000) {
                errors.push('Budget must be between 10 and 1000');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate captain addition to draft
     * @param {Object} draft - Draft object
     * @param {string} userId - User ID
     * @returns {Object} Validation result
     */
    validateCaptainAddition(draft, userId) {
        const errors = [];

        // Check draft status
        if (draft.status !== 'waiting') {
            errors.push('Cannot join after draft has started');
        }

        // Check if already a captain
        if (draft.captains.includes(userId)) {
            errors.push('You are already a captain');
        }

        // Check captain limit
        if (draft.captains.length >= draft.settings.maxCaptains) {
            errors.push('Draft is full');
        }

        // Check if user is the manager
        if (userId === draft.managerId) {
            errors.push('Draft manager cannot be a captain');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate bid placement
     * @param {Object} draft - Draft object
     * @param {string} captainId - Captain ID
     * @param {string} playerId - Player ID
     * @param {number} amount - Bid amount
     * @returns {Object} Validation result
     */
    validateBid(draft, captainId, playerId, amount) {
        const errors = [];

        // Check draft status
        if (draft.status !== 'active') {
            errors.push('Draft is not active');
        }

        // Check if it's the captain's turn
        const currentCaptain = draft.captains[draft.currentTurn];
        if (currentCaptain !== captainId) {
            errors.push('Not your turn');
        }

        // Check if captain exists
        if (!draft.captains.includes(captainId)) {
            errors.push('You are not a captain in this draft');
        }

        // Validate bid amount
        if (!Number.isInteger(amount) || amount <= 0) {
            errors.push('Bid amount must be a positive integer');
        }

        // Check if captain has enough budget
        const team = draft.teams.get(captainId);
        if (team && (team.spent + amount) > team.budget) {
            errors.push(`Insufficient budget. Available: $${team.budget - team.spent}`);
        }

        // Check if player is already drafted
        if (this.isPlayerDrafted(draft, playerId)) {
            errors.push('Player has already been drafted');
        }

        // Check if captain's roster is full
        if (team && team.players.length >= draft.settings.rosterSize) {
            errors.push('Your roster is full');
        }

        // Check if player is a captain
        if (draft.captains.includes(playerId)) {
            errors.push('Cannot draft a captain');
        }

        // Check if player is the manager
        if (playerId === draft.managerId) {
            errors.push('Cannot draft the draft manager');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate turn skip
     * @param {Object} draft - Draft object
     * @param {string} userId - User ID requesting skip
     * @returns {Object} Validation result
     */
    validateTurnSkip(draft, userId) {
        const errors = [];

        // Check draft status
        if (draft.status !== 'active') {
            errors.push('Draft is not active');
        }

        // Check if user can skip (current captain or manager)
        const currentCaptain = draft.captains[draft.currentTurn];
        if (userId !== currentCaptain && userId !== draft.managerId) {
            errors.push('Only the current captain or draft manager can skip turns');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate draft cancellation
     * @param {Object} draft - Draft object
     * @param {string} userId - User ID requesting cancellation
     * @returns {Object} Validation result
     */
    validateDraftCancellation(draft, userId) {
        const errors = [];

        // Check if user can cancel (manager or captain)
        if (userId !== draft.managerId && !draft.captains.includes(userId)) {
            errors.push('Only the draft manager or captains can cancel the draft');
        }

        // Check draft status
        if (draft.status === 'completed') {
            errors.push('Cannot cancel a completed draft');
        }

        if (draft.status === 'cancelled') {
            errors.push('Draft is already cancelled');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate draft end
     * @param {Object} draft - Draft object
     * @param {string} userId - User ID requesting end
     * @returns {Object} Validation result
     */
    validateDraftEnd(draft, userId) {
        const errors = [];

        // Check if user can end (manager only)
        if (userId !== draft.managerId) {
            errors.push('Only the draft manager can end the draft');
        }

        // Check draft status
        if (draft.status !== 'active') {
            errors.push('Can only end active drafts');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate user permissions for draft actions
     * @param {Object} draft - Draft object
     * @param {string} userId - User ID
     * @param {string} action - Action type
     * @returns {Object} Validation result
     */
    validateUserPermissions(draft, userId, action) {
        const errors = [];

        switch (action) {
            case 'manage':
                if (userId !== draft.managerId) {
                    errors.push('Only the draft manager can perform this action');
                }
                break;

            case 'captain':
                if (!draft.captains.includes(userId)) {
                    errors.push('Only captains can perform this action');
                }
                break;

            case 'current_captain':
                const currentCaptain = draft.captains[draft.currentTurn];
                if (userId !== currentCaptain) {
                    errors.push('Only the current captain can perform this action');
                }
                break;

            case 'manager_or_captain':
                if (userId !== draft.managerId && !draft.captains.includes(userId)) {
                    errors.push('Only the draft manager or captains can perform this action');
                }
                break;

            default:
                errors.push('Unknown action type');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Check if a player is already drafted
     * @param {Object} draft - Draft object
     * @param {string} playerId - Player ID
     * @returns {boolean} Is player drafted
     */
    isPlayerDrafted(draft, playerId) {
        for (const team of draft.teams.values()) {
            if (team.players.some(player => player.id === playerId)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Validate draft settings update
     * @param {Object} currentSettings - Current settings
     * @param {Object} newSettings - New settings
     * @param {string} draftStatus - Draft status
     * @returns {Object} Validation result
     */
    validateSettingsUpdate(currentSettings, newSettings, draftStatus) {
        const errors = [];

        // Can only update settings before draft starts
        if (draftStatus !== 'waiting') {
            errors.push('Cannot update settings after draft has started');
        }

        // Validate individual settings
        if (newSettings.maxCaptains !== undefined) {
            if (!Number.isInteger(newSettings.maxCaptains) || newSettings.maxCaptains < 2 || newSettings.maxCaptains > 10) {
                errors.push('Max captains must be between 2 and 10');
            }
        }

        if (newSettings.rosterSize !== undefined) {
            if (!Number.isInteger(newSettings.rosterSize) || newSettings.rosterSize < 1 || newSettings.rosterSize > 20) {
                errors.push('Roster size must be between 1 and 20');
            }
        }

        if (newSettings.budget !== undefined) {
            if (!Number.isInteger(newSettings.budget) || newSettings.budget < 10 || newSettings.budget > 1000) {
                errors.push('Budget must be between 10 and 1000');
            }
        }

        if (newSettings.turnTime !== undefined) {
            if (!Number.isInteger(newSettings.turnTime) || newSettings.turnTime < 10 || newSettings.turnTime > 300) {
                errors.push('Turn time must be between 10 and 300 seconds');
            }
        }

        if (newSettings.bidTime !== undefined) {
            if (!Number.isInteger(newSettings.bidTime) || newSettings.bidTime < 5 || newSettings.bidTime > 60) {
                errors.push('Bid time must be between 5 and 60 seconds');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate Discord user ID format
     * @param {string} userId - User ID
     * @returns {boolean} Is valid Discord user ID
     */
    isValidDiscordId(userId) {
        return /^\d{17,19}$/.test(userId);
    }

    /**
     * Validate Discord channel ID format
     * @param {string} channelId - Channel ID
     * @returns {boolean} Is valid Discord channel ID
     */
    isValidChannelId(channelId) {
        return /^\d{17,19}$/.test(channelId);
    }

    /**
     * Validate Discord guild ID format
     * @param {string} guildId - Guild ID
     * @returns {boolean} Is valid Discord guild ID
     */
    isValidGuildId(guildId) {
        return /^\d{17,19}$/.test(guildId);
    }
}

module.exports = DraftValidation;
