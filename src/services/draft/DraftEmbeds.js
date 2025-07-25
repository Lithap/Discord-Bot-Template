const { EmbedBuilder } = require('discord.js');

/**
 * Draft Embeds Service
 * Handles all embed generation for draft system
 */
class DraftEmbeds {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        
        // Color scheme for different draft states
        this.colors = {
            waiting: '#FFA500',    // Orange
            countdown: '#FFFF00',  // Yellow
            active: '#00FF00',     // Green
            completed: '#0099FF',  // Blue
            cancelled: '#FF0000'   // Red
        };
    }

    /**
     * Create lobby embed for draft waiting room
     * @param {Object} draft - Draft object
     * @returns {EmbedBuilder} Embed object
     */
    createLobbyEmbed(draft) {
        const embed = new EmbedBuilder()
            .setTitle('🎯 **Draft Lobby**')
            .setColor(this.colors.waiting)
            .setDescription(`**Draft ID:** \`${draft.id}\`\n**Status:** Waiting for captains`)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot • Click "Join as Captain" to participate',
                iconURL: this.config.embeds?.footer?.iconURL
            });

        // Draft settings
        embed.addFields({
            name: '⚙️ **Settings**',
            value: [
                `👥 **Captains:** ${draft.settings.maxCaptains}`,
                `📋 **Roster Size:** ${draft.settings.rosterSize}`,
                `💰 **Budget:** $${draft.settings.budget}`,
                `⏱️ **Turn Time:** ${draft.settings.turnTime}s`
            ].join('\n'),
            inline: true
        });

        // Current captains
        const captainsList = draft.captains.length > 0 
            ? draft.captains.map(id => `<@${id}>`).join('\n')
            : 'None yet';

        embed.addFields({
            name: `👑 **Captains** (${draft.captains.length}/${draft.settings.maxCaptains})`,
            value: captainsList,
            inline: true
        });

        // Progress indicator
        const progress = draft.captains.length / draft.settings.maxCaptains;
        const progressBar = this.createProgressBar(progress, 10);
        
        embed.addFields({
            name: '📊 **Progress**',
            value: `${progressBar} ${Math.round(progress * 100)}%`,
            inline: false
        });

        return embed;
    }

    /**
     * Create countdown embed
     * @param {Object} draft - Draft object
     * @param {number} countdown - Countdown seconds
     * @returns {EmbedBuilder} Embed object
     */
    createCountdownEmbed(draft, countdown) {
        const embed = new EmbedBuilder()
            .setTitle('🚀 **Draft Starting Soon!**')
            .setColor(this.colors.countdown)
            .setDescription(`**Draft begins in ${countdown} seconds!**`)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot • Get ready to draft!',
                iconURL: this.config.embeds?.footer?.iconURL
            });

        // Captains list
        const captainsList = draft.captains.map((id, index) => 
            `${index + 1}. <@${id}>`
        ).join('\n');

        embed.addFields({
            name: '👑 **Draft Order**',
            value: captainsList,
            inline: false
        });

        // Countdown visual
        const countdownBar = this.createCountdownBar(countdown, 10);
        embed.addFields({
            name: '⏰ **Countdown**',
            value: countdownBar,
            inline: false
        });

        return embed;
    }

    /**
     * Create active draft embed
     * @param {Object} draft - Draft object
     * @param {Object} timerStatus - Timer status
     * @returns {EmbedBuilder} Embed object
     */
    createActiveDraftEmbed(draft, timerStatus = null) {
        const currentCaptain = draft.captains[draft.currentTurn];
        
        const embed = new EmbedBuilder()
            .setTitle('⚡ **Draft in Progress**')
            .setColor(this.colors.active)
            .setDescription(`**Round ${draft.round}** • <@${currentCaptain}>'s turn`)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot • Mention players to bid!',
                iconURL: this.config.embeds?.footer?.iconURL
            });

        // Current turn info
        let turnInfo = `👑 **Current Captain:** <@${currentCaptain}>`;
        if (timerStatus && timerStatus.remaining > 0) {
            turnInfo += `\n⏱️ **Time Remaining:** ${timerStatus.remaining}s`;
            
            // Add urgency indicator
            if (timerStatus.remaining <= 10) {
                turnInfo += ' ⚠️';
            }
        }

        embed.addFields({
            name: '🎯 **Current Turn**',
            value: turnInfo,
            inline: false
        });

        // Team rosters
        this.addTeamRosters(embed, draft);

        // Recent activity
        this.addRecentActivity(embed, draft);

        return embed;
    }

    /**
     * Create completed draft embed
     * @param {Object} draft - Draft object
     * @returns {EmbedBuilder} Embed object
     */
    createCompletedEmbed(draft) {
        const embed = new EmbedBuilder()
            .setTitle('🏁 **Draft Completed!**')
            .setColor(this.colors.completed)
            .setDescription('All teams have been finalized!')
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot • Good luck in your matches!',
                iconURL: this.config.embeds?.footer?.iconURL
            });

        // Final rosters
        this.addFinalRosters(embed, draft);

        // Draft statistics
        this.addDraftStats(embed, draft);

        return embed;
    }

    /**
     * Create cancelled draft embed
     * @param {Object} draft - Draft object
     * @param {string} reason - Cancellation reason
     * @returns {EmbedBuilder} Embed object
     */
    createCancelledEmbed(draft, reason = 'Draft was cancelled') {
        const embed = new EmbedBuilder()
            .setTitle('❌ **Draft Cancelled**')
            .setColor(this.colors.cancelled)
            .setDescription(reason)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot • Better luck next time!',
                iconURL: this.config.embeds?.footer?.iconURL
            });

        if (draft.captains.length > 0) {
            embed.addFields({
                name: '👑 **Captains**',
                value: draft.captains.map(id => `<@${id}>`).join('\n'),
                inline: false
            });
        }

        return embed;
    }

    /**
     * Create error embed
     * @param {string} title - Error title
     * @param {string} description - Error description
     * @returns {EmbedBuilder} Embed object
     */
    createErrorEmbed(title, description) {
        return new EmbedBuilder()
            .setTitle(`❌ **${title}**`)
            .setColor(this.colors.cancelled)
            .setDescription(description)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot',
                iconURL: this.config.embeds?.footer?.iconURL
            });
    }

    /**
     * Create success embed
     * @param {string} title - Success title
     * @param {string} description - Success description
     * @returns {EmbedBuilder} Embed object
     */
    createSuccessEmbed(title, description) {
        return new EmbedBuilder()
            .setTitle(`✅ **${title}**`)
            .setColor(this.colors.active)
            .setDescription(description)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot',
                iconURL: this.config.embeds?.footer?.iconURL
            });
    }

    /**
     * Add team rosters to embed
     * @param {EmbedBuilder} embed - Embed object
     * @param {Object} draft - Draft object
     */
    addTeamRosters(embed, draft) {
        for (const [captainId, team] of draft.teams) {
            const playersList = team.players.length > 0
                ? team.players.map(p => `<@${p.id}> ($${p.amount})`).join('\n')
                : 'No players yet';

            const budgetRemaining = team.budget - team.spent;
            const rosterSpots = draft.settings.rosterSize - team.players.length;

            embed.addFields({
                name: `👑 <@${captainId}>'s Team`,
                value: [
                    `**Players (${team.players.length}/${draft.settings.rosterSize}):**`,
                    playersList,
                    `**Budget:** $${budgetRemaining}/${team.budget} remaining`,
                    `**Spots:** ${rosterSpots} remaining`
                ].join('\n'),
                inline: true
            });
        }
    }

    /**
     * Add final rosters to embed
     * @param {EmbedBuilder} embed - Embed object
     * @param {Object} draft - Draft object
     */
    addFinalRosters(embed, draft) {
        for (const [captainId, team] of draft.teams) {
            const playersList = team.players
                .map(p => `<@${p.id}> ($${p.amount})`)
                .join('\n');

            embed.addFields({
                name: `👑 <@${captainId}>'s Final Team`,
                value: [
                    playersList,
                    `**Total Spent:** $${team.spent}/${team.budget}`
                ].join('\n'),
                inline: true
            });
        }
    }

    /**
     * Add recent activity to embed
     * @param {EmbedBuilder} embed - Embed object
     * @param {Object} draft - Draft object
     */
    addRecentActivity(embed, draft) {
        const recentPicks = draft.logs
            .filter(log => log.type === 'pick')
            .slice(-3)
            .reverse()
            .map(log => `🎉 <@${log.captainId}> drafted <@${log.playerId}> for $${log.amount}`)
            .join('\n');

        if (recentPicks) {
            embed.addFields({
                name: '📋 **Recent Picks**',
                value: recentPicks,
                inline: false
            });
        }
    }

    /**
     * Add draft statistics to embed
     * @param {EmbedBuilder} embed - Embed object
     * @param {Object} draft - Draft object
     */
    addDraftStats(embed, draft) {
        const totalPlayers = Array.from(draft.teams.values())
            .reduce((total, team) => total + team.players.length, 0);
        
        const totalSpent = Array.from(draft.teams.values())
            .reduce((total, team) => total + team.spent, 0);

        const duration = draft.completedAt 
            ? Math.round((draft.completedAt - draft.createdAt) / 1000 / 60)
            : 0;

        embed.addFields({
            name: '📊 **Draft Statistics**',
            value: [
                `**Total Players Drafted:** ${totalPlayers}`,
                `**Total Money Spent:** $${totalSpent}`,
                `**Draft Duration:** ${duration} minutes`,
                `**Total Rounds:** ${draft.round}`
            ].join('\n'),
            inline: false
        });
    }

    /**
     * Create progress bar
     * @param {number} progress - Progress (0-1)
     * @param {number} length - Bar length
     * @returns {string} Progress bar
     */
    createProgressBar(progress, length = 10) {
        const filled = Math.round(progress * length);
        const empty = length - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * Create countdown bar
     * @param {number} remaining - Remaining seconds
     * @param {number} total - Total seconds
     * @returns {string} Countdown bar
     */
    createCountdownBar(remaining, total) {
        const progress = (total - remaining) / total;
        const bar = this.createProgressBar(progress, 10);
        return `${bar} ${remaining}s`;
    }

    /**
     * Get embed color for draft status
     * @param {string} status - Draft status
     * @returns {string} Color hex code
     */
    getStatusColor(status) {
        return this.colors[status] || this.colors.waiting;
    }

    /**
     * Create bid confirmation embed
     * @param {string} captainId - Captain ID
     * @param {string} playerId - Player ID
     * @param {number} amount - Bid amount
     * @returns {EmbedBuilder} Embed object
     */
    createBidConfirmationEmbed(captainId, playerId, amount) {
        return new EmbedBuilder()
            .setTitle('💰 **Bid Placed!**')
            .setColor(this.colors.active)
            .setDescription(`<@${captainId}> drafted <@${playerId}> for $${amount}!`)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot',
                iconURL: this.config.embeds?.footer?.iconURL
            });
    }

    /**
     * Create turn skip embed
     * @param {string} captainId - Captain ID
     * @returns {EmbedBuilder} Embed object
     */
    createTurnSkipEmbed(captainId) {
        return new EmbedBuilder()
            .setTitle('⏭️ **Turn Skipped**')
            .setColor(this.colors.active)
            .setDescription(`<@${captainId}>'s turn was skipped.`)
            .setTimestamp()
            .setFooter({ 
                text: 'DBL Bot',
                iconURL: this.config.embeds?.footer?.iconURL
            });
    }
}

module.exports = DraftEmbeds;
