/**
 * Draft Repository Service
 * Handles all database operations for drafts
 */
class DraftRepository {
    constructor(databaseService, logger) {
        this.db = databaseService;
        this.logger = logger;
        this.collectionName = 'drafts';
    }

    /**
     * Save a new draft to database
     * @param {Object} draft - Draft object
     * @returns {Promise<boolean>} Success status
     */
    async saveDraft(draft) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, skipping draft save');
                return false;
            }

            // Convert Collection objects to plain objects for storage
            const draftData = this.serializeDraft(draft);
            
            await this.db.create(this.collectionName, draftData);
            
            this.logger.debug(`Draft saved to database: ${draft.id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error saving draft ${draft.id}:`, error);
            return false;
        }
    }

    /**
     * Update an existing draft in database
     * @param {Object} draft - Draft object
     * @returns {Promise<boolean>} Success status
     */
    async updateDraft(draft) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, skipping draft update');
                return false;
            }

            // Convert Collection objects to plain objects for storage
            const draftData = this.serializeDraft(draft);
            
            await this.db.update(this.collectionName, { id: draft.id }, draftData);
            
            this.logger.debug(`Draft updated in database: ${draft.id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error updating draft ${draft.id}:`, error);
            return false;
        }
    }

    /**
     * Get draft by ID from database
     * @param {string} draftId - Draft ID
     * @returns {Promise<Object|null>} Draft object or null
     */
    async getDraftById(draftId) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, cannot retrieve draft');
                return null;
            }

            const draftData = await this.db.findOne(this.collectionName, { id: draftId });
            
            if (!draftData) {
                return null;
            }

            // Convert plain objects back to Collection objects
            return this.deserializeDraft(draftData);
        } catch (error) {
            this.logger.error(`Error retrieving draft ${draftId}:`, error);
            return null;
        }
    }

    /**
     * Get drafts by guild ID
     * @param {string} guildId - Guild ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of draft objects
     */
    async getDraftsByGuild(guildId, options = {}) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, cannot retrieve drafts');
                return [];
            }

            const query = { guildId };
            
            // Add status filter if provided
            if (options.status) {
                query.status = options.status;
            }

            // Add date range filter if provided
            if (options.startDate || options.endDate) {
                query.createdAt = {};
                if (options.startDate) {
                    query.createdAt.$gte = options.startDate;
                }
                if (options.endDate) {
                    query.createdAt.$lte = options.endDate;
                }
            }

            const drafts = await this.db.find(this.collectionName, query, {
                limit: options.limit || 50,
                sort: { createdAt: -1 }
            });

            return drafts.map(draft => this.deserializeDraft(draft));
        } catch (error) {
            this.logger.error(`Error retrieving drafts for guild ${guildId}:`, error);
            return [];
        }
    }

    /**
     * Get active drafts
     * @returns {Promise<Array>} Array of active draft objects
     */
    async getActiveDrafts() {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, cannot retrieve active drafts');
                return [];
            }

            const drafts = await this.db.find(this.collectionName, {
                status: { $in: ['waiting', 'countdown', 'active'] }
            });

            return drafts.map(draft => this.deserializeDraft(draft));
        } catch (error) {
            this.logger.error('Error retrieving active drafts:', error);
            return [];
        }
    }

    /**
     * Delete a draft from database
     * @param {string} draftId - Draft ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteDraft(draftId) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, skipping draft deletion');
                return false;
            }

            await this.db.delete(this.collectionName, { id: draftId });
            
            this.logger.debug(`Draft deleted from database: ${draftId}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting draft ${draftId}:`, error);
            return false;
        }
    }

    /**
     * Get draft statistics for a guild
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Draft statistics
     */
    async getDraftStats(guildId) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, cannot retrieve draft stats');
                return this.getEmptyStats();
            }

            const stats = await this.db.aggregate(this.collectionName, [
                { $match: { guildId } },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalPlayers: { $sum: { $size: '$captains' } }
                    }
                }
            ]);

            // Process aggregation results
            const result = this.getEmptyStats();
            
            for (const stat of stats) {
                switch (stat._id) {
                    case 'completed':
                        result.completed = stat.count;
                        break;
                    case 'cancelled':
                        result.cancelled = stat.count;
                        break;
                    case 'active':
                        result.active = stat.count;
                        break;
                    case 'waiting':
                        result.waiting = stat.count;
                        break;
                }
                result.totalPlayers += stat.totalPlayers;
            }

            result.total = result.completed + result.cancelled + result.active + result.waiting;

            return result;
        } catch (error) {
            this.logger.error(`Error retrieving draft stats for guild ${guildId}:`, error);
            return this.getEmptyStats();
        }
    }

    /**
     * Get user's draft history
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID (optional)
     * @returns {Promise<Array>} Array of draft objects
     */
    async getUserDraftHistory(userId, guildId = null) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, cannot retrieve user draft history');
                return [];
            }

            const query = {
                $or: [
                    { managerId: userId },
                    { captains: userId }
                ]
            };

            if (guildId) {
                query.guildId = guildId;
            }

            const drafts = await this.db.find(this.collectionName, query, {
                limit: 20,
                sort: { createdAt: -1 }
            });

            return drafts.map(draft => this.deserializeDraft(draft));
        } catch (error) {
            this.logger.error(`Error retrieving draft history for user ${userId}:`, error);
            return [];
        }
    }

    /**
     * Clean up old completed/cancelled drafts
     * @param {number} daysOld - Days old threshold
     * @returns {Promise<number>} Number of drafts cleaned up
     */
    async cleanupOldDrafts(daysOld = 30) {
        try {
            if (!this.db.isConnected()) {
                this.logger.warn('Database not connected, skipping draft cleanup');
                return 0;
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await this.db.deleteMany(this.collectionName, {
                status: { $in: ['completed', 'cancelled'] },
                createdAt: { $lt: cutoffDate }
            });

            this.logger.info(`Cleaned up ${result.deletedCount} old drafts`);
            return result.deletedCount;
        } catch (error) {
            this.logger.error('Error cleaning up old drafts:', error);
            return 0;
        }
    }

    /**
     * Serialize draft object for database storage
     * @param {Object} draft - Draft object
     * @returns {Object} Serialized draft
     */
    serializeDraft(draft) {
        const serialized = { ...draft };
        
        // Convert Collection to plain object
        if (draft.teams && typeof draft.teams.toJSON === 'function') {
            serialized.teams = Object.fromEntries(draft.teams);
        } else if (draft.teams) {
            serialized.teams = draft.teams;
        }

        // Ensure dates are Date objects
        if (typeof serialized.createdAt === 'string') {
            serialized.createdAt = new Date(serialized.createdAt);
        }
        if (serialized.completedAt && typeof serialized.completedAt === 'string') {
            serialized.completedAt = new Date(serialized.completedAt);
        }

        return serialized;
    }

    /**
     * Deserialize draft object from database
     * @param {Object} draftData - Raw draft data
     * @returns {Object} Deserialized draft
     */
    deserializeDraft(draftData) {
        const { Collection } = require('discord.js');
        
        const draft = { ...draftData };
        
        // Convert plain object back to Collection
        if (draft.teams && typeof draft.teams === 'object' && !draft.teams.set) {
            const teamsCollection = new Collection();
            for (const [key, value] of Object.entries(draft.teams)) {
                teamsCollection.set(key, value);
            }
            draft.teams = teamsCollection;
        }

        return draft;
    }

    /**
     * Get empty statistics object
     * @returns {Object} Empty stats
     */
    getEmptyStats() {
        return {
            total: 0,
            completed: 0,
            cancelled: 0,
            active: 0,
            waiting: 0,
            totalPlayers: 0
        };
    }

    /**
     * Create database indexes for optimal performance
     */
    async createIndexes() {
        try {
            if (!this.db.isConnected()) {
                return;
            }

            await this.db.createIndex(this.collectionName, { id: 1 }, { unique: true });
            await this.db.createIndex(this.collectionName, { guildId: 1 });
            await this.db.createIndex(this.collectionName, { status: 1 });
            await this.db.createIndex(this.collectionName, { createdAt: -1 });
            await this.db.createIndex(this.collectionName, { managerId: 1 });
            await this.db.createIndex(this.collectionName, { captains: 1 });
            await this.db.createIndex(this.collectionName, { guildId: 1, status: 1 });

            this.logger.debug('Draft repository indexes created');
        } catch (error) {
            this.logger.error('Error creating draft repository indexes:', error);
        }
    }

    /**
     * Shutdown the repository
     */
    async shutdown() {
        this.logger.info('Shutting down DraftRepository service...');
        // No specific cleanup needed for repository
        this.logger.success('DraftRepository service shutdown complete');
    }
}

module.exports = DraftRepository;
