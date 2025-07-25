/**
 * Draft Timers Service
 * Manages all timer-related functionality for drafts
 */
class DraftTimers {
    constructor(eventBus, logger) {
        this.eventBus = eventBus;
        this.logger = logger;
        
        // Timer storage: draftId -> { timerType -> timerId }
        this.timers = new Map();
        
        // Timer metadata: draftId -> { timerType -> metadata }
        this.timerMetadata = new Map();
    }

    /**
     * Start countdown timer for draft start
     * @param {string} draftId - Draft ID
     * @param {number} seconds - Countdown duration in seconds
     */
    startCountdown(draftId, seconds = 10) {
        this.stopTimer(draftId, 'countdown'); // Stop existing countdown

        const metadata = {
            type: 'countdown',
            duration: seconds,
            remaining: seconds,
            startTime: Date.now()
        };

        this.setTimerMetadata(draftId, 'countdown', metadata);

        // Start countdown with 1-second intervals
        const timerId = setInterval(() => {
            metadata.remaining--;
            
            // Emit countdown update
            this.eventBus.emitEvent('draft.countdown.update', {
                draftId,
                remaining: metadata.remaining,
                total: metadata.duration
            }, { source: 'DraftTimers' });

            if (metadata.remaining <= 0) {
                this.stopTimer(draftId, 'countdown');
                
                // Emit countdown finished
                this.eventBus.emitEvent('draft.countdown.finished', {
                    draftId
                }, { source: 'DraftTimers' });
            }
        }, 1000);

        this.setTimer(draftId, 'countdown', timerId);
        
        this.logger.debug(`Countdown started for draft ${draftId}: ${seconds} seconds`);
    }

    /**
     * Start turn timer for captain's turn
     * @param {string} draftId - Draft ID
     * @param {number} seconds - Turn duration in seconds
     */
    startTurnTimer(draftId, seconds = 30) {
        this.stopTimer(draftId, 'turn'); // Stop existing turn timer

        const metadata = {
            type: 'turn',
            duration: seconds,
            remaining: seconds,
            startTime: Date.now()
        };

        this.setTimerMetadata(draftId, 'turn', metadata);

        // Start turn timer with 1-second intervals
        const timerId = setInterval(() => {
            metadata.remaining--;
            
            // Emit turn timer update
            this.eventBus.emitEvent('draft.turn.timer.update', {
                draftId,
                remaining: metadata.remaining,
                total: metadata.duration
            }, { source: 'DraftTimers' });

            // Warning at 10 seconds
            if (metadata.remaining === 10) {
                this.eventBus.emitEvent('draft.turn.timer.warning', {
                    draftId,
                    remaining: metadata.remaining
                }, { source: 'DraftTimers' });
            }

            if (metadata.remaining <= 0) {
                this.stopTimer(draftId, 'turn');
                
                // Emit turn timer expired
                this.eventBus.emitEvent('draft.timer.expired', {
                    draftId,
                    timerType: 'turn'
                }, { source: 'DraftTimers' });
            }
        }, 1000);

        this.setTimer(draftId, 'turn', timerId);
        
        this.logger.debug(`Turn timer started for draft ${draftId}: ${seconds} seconds`);
    }

    /**
     * Start bid countdown timer (after a bid is placed)
     * @param {string} draftId - Draft ID
     * @param {number} seconds - Bid countdown duration in seconds
     */
    startBidCountdown(draftId, seconds = 10) {
        this.stopTimer(draftId, 'bid'); // Stop existing bid timer

        const metadata = {
            type: 'bid',
            duration: seconds,
            remaining: seconds,
            startTime: Date.now()
        };

        this.setTimerMetadata(draftId, 'bid', metadata);

        // Start bid countdown with 1-second intervals
        const timerId = setInterval(() => {
            metadata.remaining--;
            
            // Emit bid countdown update
            this.eventBus.emitEvent('draft.bid.countdown.update', {
                draftId,
                remaining: metadata.remaining,
                total: metadata.duration
            }, { source: 'DraftTimers' });

            if (metadata.remaining <= 0) {
                this.stopTimer(draftId, 'bid');
                
                // Emit bid countdown finished (move to next turn)
                this.eventBus.emitEvent('draft.bid.countdown.finished', {
                    draftId
                }, { source: 'DraftTimers' });
            }
        }, 1000);

        this.setTimer(draftId, 'bid', timerId);
        
        this.logger.debug(`Bid countdown started for draft ${draftId}: ${seconds} seconds`);
    }

    /**
     * Start a custom timer
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     * @param {number} seconds - Duration in seconds
     * @param {Function} callback - Callback function when timer expires
     */
    startCustomTimer(draftId, timerType, seconds, callback) {
        this.stopTimer(draftId, timerType); // Stop existing timer

        const metadata = {
            type: timerType,
            duration: seconds,
            remaining: seconds,
            startTime: Date.now(),
            custom: true
        };

        this.setTimerMetadata(draftId, timerType, metadata);

        const timerId = setTimeout(() => {
            this.stopTimer(draftId, timerType);
            
            if (callback && typeof callback === 'function') {
                try {
                    callback(draftId, timerType);
                } catch (error) {
                    this.logger.error(`Error in custom timer callback for ${draftId}:`, error);
                }
            }
            
            // Emit custom timer expired
            this.eventBus.emitEvent('draft.custom.timer.expired', {
                draftId,
                timerType
            }, { source: 'DraftTimers' });
        }, seconds * 1000);

        this.setTimer(draftId, timerType, timerId);
        
        this.logger.debug(`Custom timer started for draft ${draftId} (${timerType}): ${seconds} seconds`);
    }

    /**
     * Stop a specific timer
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     */
    stopTimer(draftId, timerType) {
        const draftTimers = this.timers.get(draftId);
        if (!draftTimers || !draftTimers[timerType]) {
            return;
        }

        clearInterval(draftTimers[timerType]);
        clearTimeout(draftTimers[timerType]);
        delete draftTimers[timerType];

        // Clean up metadata
        const draftMetadata = this.timerMetadata.get(draftId);
        if (draftMetadata && draftMetadata[timerType]) {
            delete draftMetadata[timerType];
        }

        this.logger.debug(`Timer stopped for draft ${draftId} (${timerType})`);
    }

    /**
     * Stop all timers for a draft
     * @param {string} draftId - Draft ID
     */
    stopAllTimers(draftId) {
        const draftTimers = this.timers.get(draftId);
        if (!draftTimers) {
            return;
        }

        for (const timerType in draftTimers) {
            clearInterval(draftTimers[timerType]);
            clearTimeout(draftTimers[timerType]);
        }

        this.timers.delete(draftId);
        this.timerMetadata.delete(draftId);

        this.logger.debug(`All timers stopped for draft ${draftId}`);
    }

    /**
     * Get timer status
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     * @returns {Object|null} Timer status
     */
    getTimerStatus(draftId, timerType) {
        const metadata = this.getTimerMetadata(draftId, timerType);
        if (!metadata) {
            return null;
        }

        const elapsed = Math.floor((Date.now() - metadata.startTime) / 1000);
        const remaining = Math.max(0, metadata.duration - elapsed);

        return {
            type: metadata.type,
            duration: metadata.duration,
            elapsed,
            remaining,
            isActive: this.isTimerActive(draftId, timerType),
            progress: elapsed / metadata.duration
        };
    }

    /**
     * Get all active timers for a draft
     * @param {string} draftId - Draft ID
     * @returns {Object} Active timers
     */
    getActiveTimers(draftId) {
        const draftTimers = this.timers.get(draftId);
        const draftMetadata = this.timerMetadata.get(draftId);
        
        if (!draftTimers || !draftMetadata) {
            return {};
        }

        const activeTimers = {};
        for (const timerType in draftTimers) {
            activeTimers[timerType] = this.getTimerStatus(draftId, timerType);
        }

        return activeTimers;
    }

    /**
     * Check if a timer is active
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     * @returns {boolean} Is timer active
     */
    isTimerActive(draftId, timerType) {
        const draftTimers = this.timers.get(draftId);
        return draftTimers && draftTimers[timerType] !== undefined;
    }

    /**
     * Pause a timer (for future implementation)
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     */
    pauseTimer(draftId, timerType) {
        // Implementation for pausing timers
        // This would require storing the remaining time and stopping the interval
        this.logger.debug(`Timer pause requested for draft ${draftId} (${timerType})`);
        // TODO: Implement timer pausing functionality
    }

    /**
     * Resume a paused timer (for future implementation)
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     */
    resumeTimer(draftId, timerType) {
        // Implementation for resuming timers
        this.logger.debug(`Timer resume requested for draft ${draftId} (${timerType})`);
        // TODO: Implement timer resuming functionality
    }

    /**
     * Set timer ID
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     * @param {number} timerId - Timer ID
     */
    setTimer(draftId, timerType, timerId) {
        if (!this.timers.has(draftId)) {
            this.timers.set(draftId, {});
        }
        this.timers.get(draftId)[timerType] = timerId;
    }

    /**
     * Set timer metadata
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     * @param {Object} metadata - Timer metadata
     */
    setTimerMetadata(draftId, timerType, metadata) {
        if (!this.timerMetadata.has(draftId)) {
            this.timerMetadata.set(draftId, {});
        }
        this.timerMetadata.get(draftId)[timerType] = metadata;
    }

    /**
     * Get timer metadata
     * @param {string} draftId - Draft ID
     * @param {string} timerType - Timer type
     * @returns {Object|null} Timer metadata
     */
    getTimerMetadata(draftId, timerType) {
        const draftMetadata = this.timerMetadata.get(draftId);
        return draftMetadata ? draftMetadata[timerType] : null;
    }

    /**
     * Get statistics about all timers
     * @returns {Object} Timer statistics
     */
    getStats() {
        const totalDrafts = this.timers.size;
        let totalActiveTimers = 0;
        const timerTypes = new Set();

        for (const draftTimers of this.timers.values()) {
            for (const timerType in draftTimers) {
                totalActiveTimers++;
                timerTypes.add(timerType);
            }
        }

        return {
            totalDrafts,
            totalActiveTimers,
            timerTypes: Array.from(timerTypes)
        };
    }

    /**
     * Shutdown the timer service
     */
    async shutdown() {
        this.logger.info('Shutting down DraftTimers service...');
        
        // Stop all active timers
        for (const draftId of this.timers.keys()) {
            this.stopAllTimers(draftId);
        }
        
        this.timers.clear();
        this.timerMetadata.clear();
        
        this.logger.success('DraftTimers service shutdown complete');
    }
}

module.exports = DraftTimers;
