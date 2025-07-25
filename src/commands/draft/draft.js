const { SlashCommandBuilder, PermissionFlagsBits, InteractionResponseType } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder.js');
const { AdvancedComponentBuilder } = require('../../utils/componentBuilder.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('draft')
        .setDescription('Advanced auction-style team formation system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new draft session')
                .addIntegerOption(option =>
                    option
                        .setName('captains')
                        .setDescription('Number of captains (2-8)')
                        .setRequired(true)
                        .setMinValue(2)
                        .setMaxValue(8)
                )
                .addIntegerOption(option =>
                    option
                        .setName('roster_size')
                        .setDescription('Players per team (any amount)')
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option
                        .setName('budget')
                        .setDescription('Budget per captain ($0+)')
                        .setRequired(true)
                        .setMinValue(0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop the current draft session')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current draft status')
        ),
    
    category: 'draft',
    cooldown: 3,
    
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            // Get or create draft manager instance
            if (!interaction.client.draftManager) {
                const DraftManager = require('../../utils/draftManager.js');
                interaction.client.draftManager = new DraftManager(interaction.client);
            }
            
            const draftManager = interaction.client.draftManager;
            
            switch (subcommand) {
                case 'start':
                    await this.handleStart(interaction, draftManager);
                    break;
                case 'stop':
                    await this.handleStop(interaction, draftManager);
                    break;
                case 'status':
                    await this.handleStatus(interaction, draftManager);
                    break;
                default:
                    const embed = embedBuilder.error('Unknown Command', 'Unknown subcommand provided.');
                    await interaction.reply({ embeds: [embed], flags: 64 });
            }
        } catch (error) {
            interaction.client.logger.error('Draft command error:', error);
            const embed = embedBuilder.error('Command Error', 'An error occurred while executing the draft command.');
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [embed], flags: 64 });
            } else {
                await interaction.followUp({ embeds: [embed], flags: 64 });
            }
        }
    },

    async handleStart(interaction, draftManager) {
        // Check permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const embed = embedBuilder.error('No Permission', 'You need **Manage Channels** permission to start a draft.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Check if draft already exists in this channel
        const existingDraft = draftManager.getDraft(interaction.channelId);
        if (existingDraft) {
            const embed = embedBuilder.error('Draft Active', 'A draft is already running in this channel. Use `/draft end` to stop it first.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const captains = interaction.options.getInteger('captains');
        const rosterSize = interaction.options.getInteger('roster_size');
        const budget = interaction.options.getInteger('budget');

        await interaction.deferReply();

        // Create confirmation embed
        const embed = embedBuilder.createEmbed({ color: '#ffd700' });
        embed.setTitle('🏆 **CONFIRM DRAFT SETTINGS**');
        embed.setDescription(`
**Manager:** <@${interaction.user.id}>
**Captains:** Auto-detected from role <@&955930297919238194>
**Roster Size:** ${rosterSize} players per team
**Budget:** $${budget.toLocaleString()} per captain

**Total Prize Pool:** $${(captains * budget).toLocaleString()}

⚡ **Captains will be auto-detected and draft will start immediately!**
Are you sure you want to start this draft?`);

        embed.addFields(
            { name: '⚙️ **Settings**', value: `Auto-captains • ${rosterSize} players • $${budget.toLocaleString()}`, inline: true },
            { name: '🎯 **Mode**', value: 'Auto-Start Auction Draft', inline: true },
            { name: '⏱️ **Duration**', value: '~15-30 minutes', inline: true }
        );

        // Create confirmation buttons with settings embedded in the ID
        const components = new AdvancedComponentBuilder()
            .createRow()
            .addSuccessButton(`draft_confirm_start_${captains}_${rosterSize}_${budget}`, 'Yes, Start Draft!', '✅')
            .addDangerButton('draft_cancel_start', 'Cancel', '❌')
            .build();

        embed.setFooter({ text: 'DBL Bot • Advanced Draft System' });
        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed], components });

        // Log draft creation attempt
        interaction.client.logger.info(`Draft confirmation shown in ${interaction.guild.name} by ${interaction.user.tag}`);
    },

    async handleStop(interaction, draftManager) {
        try {
            // Check if user has manager role
            const MANAGER_ROLE_ID = '1313557033974239264';
            if (!interaction.member.roles.cache.has(MANAGER_ROLE_ID)) {
                const embed = embedBuilder.error('No Permission', 'You need the Manager role to stop a draft.');
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            const draft = draftManager.getDraft(interaction.channelId);
            
            if (!draft) {
                const embed = embedBuilder.error('No Active Draft', 'There is no active draft in this channel.');
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            await interaction.deferReply();

            await draftManager.endDraft(draft.id, interaction.user.id, true);
            
            const embed = embedBuilder.success('Draft Stopped', 'The draft has been stopped by the manager.');
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            interaction.client.logger.error('Stop draft error:', error);
            const embed = embedBuilder.error('Stop Draft Error', 'An error occurred while stopping the draft.');
            
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], flags: 64 });
            }
        }
    },

    async handleStatus(interaction, draftManager) {
        try {
            const draft = draftManager.getDraft(interaction.channelId);
            
            if (!draft) {
                const embed = embedBuilder.error('No Active Draft', 'There is no active draft in this channel.');
                return await interaction.reply({ embeds: [embed], flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });

            const embed = await draftManager.createStatusEmbed(draft.id);
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            interaction.client.logger.error('Draft status error:', error);
            const embed = embedBuilder.error('Status Error', 'Failed to get draft status.');
            
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], flags: 64 });
            }
        }
    }
};






