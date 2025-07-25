// DEPRECATED: This file has been replaced by the new modular draft system
// New structure: src/services/draft/
// - DraftCore.js: Core draft logic
// - DraftHandlers.js: Interaction handlers
// - DraftEmbeds.js: Embed generation
// - DraftTimers.js: Timer management
// - DraftValidation.js: Validation logic
// - DraftRepository.js: Data persistence

const { Collection } = require('discord.js');
const embedBuilder = require('./embedBuilder.js');
const { AdvancedComponentBuilder } = require('./componentBuilder.js');

class DraftManager {
    constructor(client) {
        this.client = client;
        this.activeDrafts = new Collection(); // channelId -> draft data
        this.draftMessages = new Collection(); // draftId -> message object
        this.timers = new Collection(); // draftId -> timer objects
        
        // Initialize draft button handlers
        this.initializeHandlers();
    }

    // Initialize button handlers for draft interactions
    initializeHandlers() {
        const handler = this.client.interactionHandler;
        
        // Captain join/leave buttons
        handler.registerButtonHandler('draft', async (interaction, params) => {
            const [action] = params;
            
            switch (action) {
                case 'join_captain':
                    await this.handleJoinCaptain(interaction);
                    break;
                case 'leave_captain':
                    await this.handleLeaveCaptain(interaction);
                    break;
                case 'cancel':
                    await this.handleCancelDraft(interaction);
                    break;
                case 'bid_player':
                    await this.handleBidButton(interaction, params);
                    break;
                case 'skip_turn':
                    await this.handleSkipButton(interaction);
                    break;
                case 'end':
                    await this.handleEndButton(interaction);
                    break;
            }
        });

        // Player selection modal handler
        handler.registerModalHandler('draft_bid', async (interaction, params) => {
            await this.handleBidModal(interaction, params);
        });
    }

    // Handle bid button - opens player selection
    async handleBidButton(interaction, params) {
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        // Check if it's user's turn
        const currentCaptain = draft.captains[draft.currentTurn];
        if (currentCaptain !== interaction.user.id) {
            const embed = embedBuilder.error('Not Your Turn', 'Please wait for your turn to bid.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Create player selection embed
        const embed = embedBuilder.createEmbed({ color: '#5865f2' });
        embed.setTitle('💰 **Select Player to Bid On**');
        embed.setDescription('Choose a player from the server to place your bid:');

        // Get server members (excluding bots and already drafted players)
        const guild = interaction.guild;
        const members = await guild.members.fetch();

        const draftedPlayers = new Set();
        for (const [_, team] of draft.teams) {
            team.players.forEach(p => draftedPlayers.add(p.id));
        }

        const availableMembers = members
            .filter(member => !member.user.bot && !draftedPlayers.has(member.id))
            .first(25); // Discord limit

        if (availableMembers.size === 0) {
            const embed = embedBuilder.error('No Players Available', 'All eligible players have been drafted.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Create user select menu
        const { UserSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

        const userSelect = new UserSelectMenuBuilder()
            .setCustomId('draft_player_select')
            .setPlaceholder('Select a player to bid on...')
            .setMaxValues(1);

        const components = [new ActionRowBuilder().addComponents(userSelect)];

        await interaction.reply({ embeds: [embed], components, ephemeral: true });
    }

    // Handle player selection from dropdown
    async handlePlayerSelect(interaction) {
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        const selectedUserId = interaction.values[0];
        const selectedUser = await this.client.users.fetch(selectedUserId);

        // Create bid amount modal
        const { ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle } = require('discord.js');

        const modal = new ModalBuilder()
            .setCustomId(`draft_bid_${selectedUserId}`)
            .setTitle(`Bid on ${selectedUser.username}`);

        const bidInput = new TextInputBuilder()
            .setCustomId('bid_amount')
            .setLabel('Bid Amount ($)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your bid amount...')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(6);

        const actionRow = new ActionRowBuilder()
            .addComponents(bidInput);

        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    }

    // Handle skip button
    async handleSkipButton(interaction) {
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        await interaction.deferUpdate();

        const result = await this.skipTurn(draft.id, interaction.user.id);

        if (result.success) {
            const channel = await this.client.channels.fetch(interaction.channelId);
            await channel.send(`⏭️ <@${interaction.user.id}> **skipped their turn.**`);
        }
    }

    // Handle end button
    async handleEndButton(interaction) {
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        // Check permissions
        if (interaction.user.id !== draft.managerId &&
            !interaction.member.permissions.has('ManageChannels')) {
            const embed = embedBuilder.error('No Permission', 'Only the draft manager or users with Manage Channels can end the draft.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferUpdate();
        await this.endDraft(draft.id, interaction.user.id);
    }

    // Handle bid modal submission
    async handleBidModal(interaction, params) {
        const [playerId] = params;
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        const bidAmount = parseInt(interaction.fields.getTextInputValue('bid_amount'));

        if (isNaN(bidAmount) || bidAmount <= 0) {
            const embed = embedBuilder.error('Invalid Bid', 'Please enter a valid bid amount.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const result = await this.placeBid(draft.id, interaction.user.id, playerId, bidAmount);

        if (result.success) {
            const embed = embedBuilder.success('Bid Placed!', result.message);
            await interaction.editReply({ embeds: [embed] });

            // Announce the pick
            const player = await this.client.users.fetch(playerId);
            const channel = await this.client.channels.fetch(interaction.channelId);
            await channel.send(`🎉 <@${interaction.user.id}> **drafted** <@${playerId}> **for $${bidAmount}!**`);
        } else {
            const embed = embedBuilder.error('Bid Failed', result.error);
            await interaction.editReply({ embeds: [embed] });
        }
    }

    // Create a new draft session
    async createDraft(options) {
        const draftId = this.generateDraftId();
        
        const draft = {
            id: draftId,
            guildId: options.guildId,
            channelId: options.channelId,
            managerId: options.managerId,
            settings: {
                maxCaptains: options.captains,
                rosterSize: options.rosterSize,
                budget: options.budget,
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

        this.activeDrafts.set(options.channelId, draft);
        
        // Save to database if available
        if (this.client.database && this.client.database.isAvailable()) {
            try {
                await this.client.database.createDraft(draft);
            } catch (error) {
                this.client.logger.error('Failed to save draft to database:', error);
            }
        }

        return draftId;
    }

    // Get draft by channel ID
    getDraft(channelId) {
        return this.activeDrafts.get(channelId);
    }

    // Set draft message reference
    setDraftMessage(draftId, message) {
        this.draftMessages.set(draftId, message);
    }

    // Handle captain joining
    async handleJoinCaptain(interaction) {
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        await interaction.deferUpdate();

        // Check if user is already a captain
        if (draft.captains.includes(interaction.user.id)) {
            return; // Already a captain
        }

        // Check if draft is full
        if (draft.captains.length >= draft.settings.maxCaptains) {
            return; // Draft is full
        }

        // Add captain
        draft.captains.push(interaction.user.id);
        
        // Initialize team for captain
        draft.teams.set(interaction.user.id, {
            captainId: interaction.user.id,
            players: [],
            budget: draft.settings.budget,
            skipsUsed: 0
        });

        // Check if we have enough captains to start countdown
        if (draft.captains.length === draft.settings.maxCaptains) {
            await this.startCountdown(draft.id);
        } else {
            await this.updateLobbyEmbed(draft.id);
        }
    }

    // Handle captain leaving
    async handleLeaveCaptain(interaction) {
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        await interaction.deferUpdate();

        // Remove captain
        const index = draft.captains.indexOf(interaction.user.id);
        if (index > -1) {
            draft.captains.splice(index, 1);
            draft.teams.delete(interaction.user.id);
        }

        await this.updateLobbyEmbed(draft.id);
    }

    // Handle draft cancellation
    async handleCancelDraft(interaction) {
        const draft = this.getDraft(interaction.channelId);
        if (!draft) return;

        // Check if user is manager or has permissions
        if (interaction.user.id !== draft.managerId && 
            !interaction.member.permissions.has('ManageChannels')) {
            return;
        }

        await interaction.deferUpdate();
        await this.endDraft(draft.id, interaction.user.id, true);
    }

    // Handle confirmation of draft start - UPDATED
    async handleConfirmStart(interaction, settings) {
        try {
            const { captains, rosterSize, budget } = settings;

            await interaction.deferUpdate();

            // Auto-detect players with captain role FIRST
            const CAPTAIN_ROLE_ID = '955930297919238194';
            let detectedCaptains = [];

            try {
                const guild = interaction.guild;

                // Fetch all guild members to ensure we get offline members too
                await guild.members.fetch();

                const captainRole = guild.roles.cache.get(CAPTAIN_ROLE_ID);

                if (captainRole) {
                    // Get all members with the captain role (including offline)
                    const captainMembers = captainRole.members.filter(member => !member.user.bot);

                    this.client.logger.info(`Found ${captainMembers.size} members with captain role (including offline)`);

                    // Get all captains with the role (no limit)
                    for (const [_, member] of captainMembers) {
                        detectedCaptains.push(member.id);
                        this.client.logger.debug(`Added captain: ${member.user.tag} (${member.presence?.status || 'offline'})`);
                    }

                    // Shuffle the captains for random draft order
                    detectedCaptains = this.shuffleArray(detectedCaptains);
                } else {
                    this.client.logger.warn(`Captain role ${CAPTAIN_ROLE_ID} not found in guild`);
                }
            } catch (memberError) {
                this.client.logger.error('Failed to auto-detect captains:', memberError);
            }

            // If no captains detected, show error
            if (detectedCaptains.length === 0) {
                const embed = embedBuilder.error('No Captains Found',
                    `No members found with the captain role <@&${CAPTAIN_ROLE_ID}>. Please assign the role to players first.`);
                return await interaction.editReply({ embeds: [embed], components: [] });
            }

            // Create the actual draft with detected captains count
            const actualCaptainCount = detectedCaptains.length;
            const draftId = await this.createDraft({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                managerId: interaction.user.id,
                captains: actualCaptainCount, // Use actual count
                rosterSize: rosterSize,
                budget: budget
            });

            const draft = this.getDraft(interaction.channelId);

            // Add all detected captains
            for (const captainId of detectedCaptains) {
                draft.captains.push(captainId);
                draft.teams.set(captainId, {
                    captainId: captainId,
                    players: [],
                    budget: budget,
                    skipsUsed: 0
                });
            }

            // Create lobby embed (no join/leave buttons)
            const embed = embedBuilder.createEmbed({ color: '#5865f2' });
            embed.setTitle('🏆 **DRAFT STARTING**');
            embed.setDescription(`
**Manager:** <@${interaction.user.id}>
**Auto-detected ${actualCaptainCount} captains!**

**Settings:**
• **${actualCaptainCount}** teams competing
• **${rosterSize}** players per roster
• **$${budget.toLocaleString()}** budget per captain

🚀 **Draft will begin in 10 seconds!**`);

            const captainsList = draft.captains.length > 0 
                ? draft.captains.map((id, i) => `${i + 1}. <@${id}>`).join('\n')
                : 'None detected';

            embed.addFields(
                { name: '👑 **Draft Order**', value: captainsList, inline: true },
                { name: '� **How to Bid**', value: 'Mention a player with amount:\n`@username 50`', inline: true }
            );

            // Only cancel button (no join/leave)
            const components = new AdvancedComponentBuilder()
                .createRow()
                .addDangerButton('draft_cancel', 'Cancel Draft', '🗑️')
                .build();

            embed.setFooter({ text: 'DBL Bot • Advanced Draft System' });
            embed.setTimestamp();

            const message = await interaction.editReply({ embeds: [embed], components });
            this.draftMessages.set(draftId, message);

            // Ping captains
            const channel = interaction.channel;
            const captainPings = draft.captains.map(id => `<@${id}>`).join(' ');
            await channel.send(`🏆 **CAPTAINS ASSEMBLE!** ${captainPings}\n\n🎯 **How to bid:** Mention any player with your bid amount like \`@username 50\`\n⏭️ **To skip:** Use the skip button when it's your turn\n\n🚀 **Draft starting in 10 seconds!**`);

            // Auto-start countdown immediately with shorter timer (10 seconds)
            draft.countdown = 10; // Shorter countdown
            await this.startCountdown(draftId);

        } catch (error) {
            this.client.logger.error('Confirm start error:', error);
            const embed = embedBuilder.error('Start Failed', 'Failed to start the draft. Please try again.');
            await interaction.editReply({ embeds: [embed], components: [] });
        }
    }

    // Handle cancellation of draft start
    async handleCancelStart(interaction) {
        try {
            const embed = embedBuilder.error('Draft Cancelled', 'The draft has been cancelled.');
            await interaction.update({ embeds: [embed], components: [] });
        } catch (error) {
            this.client.logger.error('Cancel start error:', error);
        }
    }

    // Start countdown (10 seconds default)
    async startCountdown(draftId) {
        const draft = this.activeDrafts.get(this.getChannelByDraftId(draftId));
        if (!draft) return;

        draft.status = 'countdown';
        if (!draft.countdown) draft.countdown = 10; // Default to 10 seconds

        // Start countdown timer
        const countdownTimer = setInterval(async () => {
            draft.countdown--;

            if (draft.countdown <= 0) {
                clearInterval(countdownTimer);
                await this.startDraft(draftId);
            } else {
                await this.updateCountdownEmbed(draftId);
            }
        }, 1000);

        this.timers.set(draftId + '_countdown', countdownTimer);
        await this.updateCountdownEmbed(draftId);
    }

    // Start the actual draft
    async startDraft(draftId) {
        const draft = this.activeDrafts.get(this.getChannelByDraftId(draftId));
        if (!draft) return;

        draft.status = 'active';
        draft.currentTurn = 0;
        draft.round = 1;

        await this.startTurn(draftId);
    }

    // Start a captain's turn
    async startTurn(draftId) {
        const draft = this.activeDrafts.get(this.getChannelByDraftId(draftId));
        if (!draft) return;

        const currentCaptain = draft.captains[draft.currentTurn];
        const channel = await this.client.channels.fetch(draft.channelId);

        // Ping current captain
        await channel.send(`<@${currentCaptain}> **Your turn!** Pick your next player or skip your turn.`);

        // Start turn timer (30 seconds)
        const turnTimer = setTimeout(async () => {
            await this.autoSkipTurn(draftId);
        }, draft.settings.turnTime * 1000);

        this.timers.set(draftId + '_turn', turnTimer);
        await this.updateDraftEmbed(draftId);
    }

    // Update lobby embed
    async updateLobbyEmbed(draftId) {
        const draft = this.activeDrafts.get(this.getChannelByDraftId(draftId));
        const message = this.draftMessages.get(draftId);
        if (!draft || !message) return;

        const embed = embedBuilder.createEmbed({ color: '#5865f2' });
        embed.setTitle('🏆 **DRAFT LOBBY**');
        embed.setDescription(`
**Manager:** <@${draft.managerId}>
**Captains Needed:** ${draft.settings.maxCaptains}
**Roster Size:** ${draft.settings.rosterSize} players per team
**Budget:** $${draft.settings.budget.toLocaleString()} per captain

**⏱️ Waiting for captains to join...**
*Draft will start automatically when ${draft.settings.maxCaptains} captains have joined.*`);

        // Show joined captains
        const captainsList = draft.captains.length > 0 
            ? draft.captains.map(id => `<@${id}>`).join('\n')
            : 'None yet';

        embed.addFields(
            { name: '👑 **Captains Joined**', value: captainsList, inline: true },
            { name: '📊 **Progress**', value: `${draft.captains.length} / ${draft.settings.maxCaptains}`, inline: true },
            { name: '⚡ **Status**', value: '🟡 Waiting for Captains', inline: true }
        );

        embed.setFooter({ text: 'DBL Bot • Advanced Draft System' });
        embed.setTimestamp();

        await message.edit({ embeds: [embed] });
    }

    // Update countdown embed
    async updateCountdownEmbed(draftId) {
        const draft = this.activeDrafts.get(this.getChannelByDraftId(draftId));
        const message = this.draftMessages.get(draftId);
        if (!draft || !message) return;

        const minutes = Math.floor(draft.countdown / 60);
        const seconds = draft.countdown % 60;

        const embed = embedBuilder.createEmbed({ color: '#ff6b35' });
        embed.setTitle('🚀 **DRAFT STARTING SOON**');
        embed.setDescription(`
**All captains ready!** Draft begins in:

# ⏰ ${minutes}:${seconds.toString().padStart(2, '0')}

**Captains:** ${draft.captains.map(id => `<@${id}>`).join(' • ')}
**Settings:** ${draft.settings.rosterSize} players • $${draft.settings.budget.toLocaleString()} budget`);

        embed.addFields(
            { name: '📋 **Draft Order**', value: draft.captains.map((id, i) => `${i + 1}. <@${id}>`).join('\n'), inline: true },
            { name: '⚡ **Status**', value: '🔥 Starting Soon', inline: true }
        );

        embed.setFooter({ text: 'DBL Bot • Get ready to draft!' });
        embed.setTimestamp();

        // Remove join/leave buttons during countdown
        const components = new AdvancedComponentBuilder()
            .createRow()
            .addDangerButton('draft_cancel', 'Cancel Draft', '🗑️')
            .build();

        await message.edit({ embeds: [embed], components });
    }

    // Generate unique draft ID
    generateDraftId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    // Shuffle array for random draft order
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Get channel ID by draft ID
    getChannelByDraftId(draftId) {
        for (const [channelId, draft] of this.activeDrafts) {
            if (draft.id === draftId) return channelId;
        }
        return null;
    }

    // Place a bid - FULL IMPLEMENTATION
    async placeBid(draftId, captainId, playerId, amount) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        if (!draft) return { success: false, error: 'Draft not found' };

        // Validate draft is active
        if (draft.status !== 'active') {
            return { success: false, error: 'Draft is not active' };
        }

        // Check if it's the captain's turn
        const currentCaptain = draft.captains[draft.currentTurn];
        if (currentCaptain !== captainId) {
            return { success: false, error: 'It is not your turn' };
        }

        // Get captain's team
        const team = draft.teams.get(captainId);
        if (!team) return { success: false, error: 'Team not found' };

        // Validate budget
        if (amount > team.budget) {
            return { success: false, error: `Insufficient budget. You have $${team.budget} remaining` };
        }

        // Check if player is already drafted
        for (const [_, otherTeam] of draft.teams) {
            if (otherTeam.players.some(p => p.id === playerId)) {
                return { success: false, error: 'Player already drafted' };
            }
        }

        // Check if team is full
        if (team.players.length >= draft.settings.rosterSize) {
            return { success: false, error: 'Your roster is full' };
        }

        // Get player info
        const player = await this.client.users.fetch(playerId);

        // Add player to team
        team.players.push({
            id: playerId,
            username: player.username,
            cost: amount,
            round: draft.round,
            pickNumber: this.getTotalPicks(draft) + 1
        });

        // Deduct budget
        team.budget -= amount;

        // Log the pick
        draft.logs.push({
            type: 'pick',
            captainId: captainId,
            playerId: playerId,
            amount: amount,
            round: draft.round,
            timestamp: new Date()
        });

        // Clear turn timer
        const turnTimer = this.timers.get(draftId + '_turn');
        if (turnTimer) {
            clearTimeout(turnTimer);
            this.timers.delete(draftId + '_turn');
        }

        // Check if captain's roster is full
        if (team.players.length >= draft.settings.rosterSize) {
            // Remove captain from rotation
            const captainIndex = draft.captains.indexOf(captainId);
            draft.captains.splice(captainIndex, 1);

            // Adjust current turn if needed
            if (draft.currentTurn >= draft.captains.length) {
                draft.currentTurn = 0;
            }
        } else {
            // Move to next captain
            this.nextTurn(draft);
        }

        // Check if draft is complete
        if (this.isDraftComplete(draft)) {
            await this.completeDraft(draftId);
            return { success: true, message: 'Draft completed!' };
        }

        // Start 10-second countdown for next turn
        await this.startBidCountdown(draftId);

        return { success: true, message: `Successfully drafted ${player.username} for $${amount}` };
    }

    // Skip turn - FULL IMPLEMENTATION
    async skipTurn(draftId, captainId) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        if (!draft) return { success: false, error: 'Draft not found' };

        // Validate draft is active
        if (draft.status !== 'active') {
            return { success: false, error: 'Draft is not active' };
        }

        // Check if it's the captain's turn
        const currentCaptain = draft.captains[draft.currentTurn];
        if (currentCaptain !== captainId) {
            return { success: false, error: 'It is not your turn' };
        }

        // Get captain's team
        const team = draft.teams.get(captainId);
        if (!team) return { success: false, error: 'Team not found' };

        // Check if captain has already skipped this round
        if (team.skipsUsed >= draft.round) {
            return { success: false, error: 'You can only skip once per round' };
        }

        // Record skip
        team.skipsUsed = draft.round;
        draft.logs.push({
            type: 'skip',
            captainId: captainId,
            round: draft.round,
            timestamp: new Date()
        });

        // Clear turn timer
        const turnTimer = this.timers.get(draftId + '_turn');
        if (turnTimer) {
            clearTimeout(turnTimer);
            this.timers.delete(draftId + '_turn');
        }

        // Move to next captain
        this.nextTurn(draft);

        // Check if round is complete (all captains skipped)
        if (this.isRoundComplete(draft)) {
            draft.round++;
            // Reset skips for new round
            for (const [_, team] of draft.teams) {
                team.skipsUsed = 0;
            }
        }

        // Start next turn
        await this.startTurn(draftId);

        return { success: true, message: 'Turn skipped successfully' };
    }

    // Update draft embed - ENHANCED VERSION
    async updateDraftEmbed(draftId) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        const message = this.draftMessages.get(draftId);
        if (!draft || !message) return;

        const embed = embedBuilder.createEmbed({ color: '#00d26a' });
        embed.setTitle('🏆 **LIVE DRAFT** • *Bidding Active*');

        const currentCaptain = draft.captains[draft.currentTurn];
        const currentTeam = draft.teams.get(currentCaptain);

        embed.setDescription(`
**🎯 Current Turn:** <@${currentCaptain}>
**💰 Budget:** $${currentTeam.budget.toLocaleString()} remaining
**📋 Roster:** ${currentTeam.players.length}/${draft.settings.rosterSize} players
**🔥 Round:** ${draft.round}

**💡 To bid:** \`@username amount\` (e.g. \`@lithap 50\`)
**⏭️ To skip:** Use the skip button below`);

        // Show all teams with their rosters
        let teamsText = '';
        for (const [captainId, team] of draft.teams) {
            const isCurrentTurn = captainId === currentCaptain;
            const indicator = isCurrentTurn ? '👑' : '⚪';
            const budget = `$${team.budget.toLocaleString()}`;
            
            let players = 'No players yet';
            if (team.players.length > 0) {
                players = team.players
                    .map(p => `**${p.username}** ($${p.cost})`)
                    .join(', ');
            }

            teamsText += `${indicator} <@${captainId}> • ${budget}\n${players}\n\n`;
        }

        embed.addFields({
            name: '👥 **Teams & Rosters**',
            value: teamsText,
            inline: false
        });

        // Recent activity
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

        // Action buttons (only skip and end)
        const components = new AdvancedComponentBuilder()
            .createRow()
            .addSecondaryButton('draft_skip_turn', 'Skip Turn', '⏭️')
            .addDangerButton('draft_end', 'End Draft', '🏁')
            .build();

        embed.setFooter({ text: 'DBL Bot • Mention players to bid!' });
        embed.setTimestamp();

        await message.edit({ embeds: [embed], components });
    }

    // End draft
    async endDraft(draftId, userId, cancelled = false) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        if (!draft) return;

        // Clear all timers
        const countdownTimer = this.timers.get(draftId + '_countdown');
        const turnTimer = this.timers.get(draftId + '_turn');
        
        if (countdownTimer) clearInterval(countdownTimer);
        if (turnTimer) clearTimeout(turnTimer);
        
        this.timers.delete(draftId + '_countdown');
        this.timers.delete(draftId + '_turn');

        // Remove from active drafts
        this.activeDrafts.delete(channelId);
        this.draftMessages.delete(draftId);

        // Update final message
        const message = this.draftMessages.get(draftId);
        if (message) {
            const embed = embedBuilder.createEmbed({ 
                color: cancelled ? '#f04747' : '#00d26a' 
            });
            embed.setTitle(cancelled ? '❌ **DRAFT CANCELLED**' : '✅ **DRAFT COMPLETED**');
            embed.setDescription(cancelled ? 'The draft has been cancelled.' : 'The draft has ended successfully.');
            embed.setFooter({ text: 'DBL Bot • Draft System' });
            
            await message.edit({ embeds: [embed], components: [] });
        }
    }

    // Auto-skip turn when timer expires
    async autoSkipTurn(draftId) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        if (!draft || draft.status !== 'active') return;

        const currentCaptain = draft.captains[draft.currentTurn];
        const channel = await this.client.channels.fetch(draft.channelId);

        // Auto-skip the turn
        await channel.send(`⏰ <@${currentCaptain}> **Time's up!** Turn automatically skipped.`);

        // Force skip
        await this.skipTurn(draftId, currentCaptain);
    }

    // Start 10-second countdown after bid
    async startBidCountdown(draftId) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        if (!draft) return;

        const channel = await this.client.channels.fetch(draft.channelId);

        // Send countdown message
        const countdownMsg = await channel.send('⚡ **Next turn in 10 seconds...**');

        let countdown = 10;
        const countdownTimer = setInterval(async () => {
            countdown--;

            if (countdown <= 0) {
                clearInterval(countdownTimer);
                await countdownMsg.delete().catch(() => {});
                await this.startTurn(draftId);
            } else if (countdown <= 3) {
                await countdownMsg.edit(`⚡ **Next turn in ${countdown}...**`).catch(() => {});
            }
        }, 1000);

        this.timers.set(draftId + '_bid_countdown', countdownTimer);
    }

    // Move to next captain
    nextTurn(draft) {
        draft.currentTurn = (draft.currentTurn + 1) % draft.captains.length;

        // If we've gone through all captains, increment round
        if (draft.currentTurn === 0) {
            draft.round++;
        }
    }

    // Check if draft is complete
    isDraftComplete(draft) {
        // Check if all teams are full OR no captains left
        if (draft.captains.length === 0) return true;

        for (const [_, team] of draft.teams) {
            if (team.players.length < draft.settings.rosterSize) {
                return false;
            }
        }
        return true;
    }

    // Check if round is complete (all captains skipped)
    isRoundComplete(draft) {
        for (const captainId of draft.captains) {
            const team = draft.teams.get(captainId);
            if (team.skipsUsed < draft.round) {
                return false;
            }
        }
        return true;
    }

    // Get total picks made
    getTotalPicks(draft) {
        let total = 0;
        for (const [_, team] of draft.teams) {
            total += team.players.length;
        }
        return total;
    }

    // Complete the draft
    async completeDraft(draftId) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        if (!draft) return;

        draft.status = 'completed';

        // Clear all timers
        this.clearAllTimers(draftId);

        // Create final rosters embed
        await this.createFinalRostersEmbed(draftId);

        // Clean up
        this.activeDrafts.delete(channelId);
        this.draftMessages.delete(draftId);
    }

    // Create final rosters embed
    async createFinalRostersEmbed(draftId) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        const channel = await this.client.channels.fetch(draft.channelId);

        // Sort teams by remaining budget (fiscal efficiency)
        const sortedTeams = Array.from(draft.teams.entries())
            .sort(([,a], [,b]) => b.budget - a.budget);

        const embed = embedBuilder.createEmbed({ color: '#ffd700' });
        embed.setTitle('🏆 **FINAL ROSTERS** • *Draft Complete*');
        embed.setDescription(`
**Draft completed successfully!** 🎉
**Total picks made:** ${this.getTotalPicks(draft)}
**Rounds completed:** ${draft.round - 1}

*Teams sorted by remaining budget (fiscal efficiency)*`);

        // Add each team's roster
        for (let i = 0; i < sortedTeams.length; i++) {
            const [captainId, team] = sortedTeams[i];
            const rank = i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';

            const playersList = team.players.length > 0
                ? team.players
                    .sort((a, b) => a.pickNumber - b.pickNumber)
                    .map(p => `${p.pickNumber}. **${p.username}** - $${p.cost}`)
                    .join('\n')
                : 'No players drafted';

            embed.addFields({
                name: `${medal} **Team ${rank}** - <@${captainId}>`,
                value: `**Budget Remaining:** $${team.budget.toLocaleString()}\n**Players:**\n${playersList}`,
                inline: false
            });
        }

        // Add draft statistics
        const totalSpent = sortedTeams.reduce((sum, [,team]) =>
            sum + (draft.settings.budget - team.budget), 0);

        embed.addFields({
            name: '📊 **Draft Statistics**',
            value: `**Total Money Spent:** $${totalSpent.toLocaleString()}\n**Average Pick Cost:** $${Math.round(totalSpent / this.getTotalPicks(draft))}\n**Most Efficient:** <@${sortedTeams[0][0]}> ($${sortedTeams[0][1].budget} left)`,
            inline: false
        });

        embed.setFooter({ text: 'DBL Bot • Advanced Draft System • Thank you for playing!' });
        embed.setTimestamp();

        await channel.send({ embeds: [embed] });
    }

    // Clear all timers for a draft
    clearAllTimers(draftId) {
        const timers = ['_countdown', '_turn', '_bid_countdown'];
        for (const suffix of timers) {
            const timer = this.timers.get(draftId + suffix);
            if (timer) {
                if (suffix === '_countdown') {
                    clearInterval(timer);
                } else {
                    clearTimeout(timer);
                }
                this.timers.delete(draftId + suffix);
            }
        }
    }

    // Create status embed
    async createStatusEmbed(draftId) {
        const channelId = this.getChannelByDraftId(draftId);
        const draft = this.getDraft(channelId);
        if (!draft) {
            return embedBuilder.error('Draft Not Found', 'Could not find the specified draft.');
        }

        const embed = embedBuilder.createEmbed({ color: '#5865f2' });
        embed.setTitle('📊 **DRAFT STATUS**');

        let statusText = '';
        switch (draft.status) {
            case 'waiting':
                statusText = '🟡 Waiting for captains';
                break;
            case 'countdown':
                statusText = '🟠 Starting soon';
                break;
            case 'active':
                statusText = '🔴 Draft in progress';
                break;
            case 'completed':
                statusText = '✅ Draft completed';
                break;
            case 'cancelled':
                statusText = '❌ Draft cancelled';
                break;
            default:
                statusText = '❓ Unknown status';
        }

        embed.setDescription(`
**Status:** ${statusText}
**Manager:** <@${draft.managerId}>
**Settings:** ${draft.settings.maxCaptains} captains • ${draft.settings.rosterSize} players • ${draft.settings.budget === 0 ? 'Free picks' : `$${draft.settings.budget.toLocaleString()} budget`}
**Captains Joined:** ${draft.captains.length}/${draft.settings.maxCaptains}`);

        if (draft.captains.length > 0) {
            const captainsList = draft.captains.map((id, index) => `${index + 1}. <@${id}>`).join('\n');
            embed.addFields({ name: '👑 **Captains**', value: captainsList, inline: false });
        }

        if (draft.status === 'active') {
            const currentCaptain = draft.captains[draft.currentTurn];
            embed.addFields({ 
                name: '⏰ **Current Turn**', 
                value: `<@${currentCaptain}> (Round ${draft.round})`, 
                inline: false 
            });
        }

        embed.setFooter({ text: 'DBL Bot • Draft Status' });
        embed.setTimestamp();

        return embed;
    }
}

module.exports = DraftManager;




