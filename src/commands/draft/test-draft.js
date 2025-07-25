const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embedBuilder = require('../../utils/embedBuilder.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-draft')
        .setDescription('Test the draft system with simulated data')
        .addSubcommand(subcommand =>
            subcommand
                .setName('quick')
                .setDescription('Start a quick test draft (2 captains, 3 players, $1000)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('full')
                .setDescription('Start a full test draft (4 captains, 5 players, $2000)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('demo')
                .setDescription('Show draft system demo and features')
        ),
    
    category: 'draft',
    cooldown: 10,
    permissions: [PermissionFlagsBits.ManageChannels],
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'quick':
                await this.startQuickTest(interaction);
                break;
            case 'full':
                await this.startFullTest(interaction);
                break;
            case 'demo':
                await this.showDemo(interaction);
                break;
        }
    },

    async startQuickTest(interaction) {
        await interaction.deferReply();

        // Check if draft manager exists
        if (!interaction.client.draftManager) {
            const DraftManager = require('../../utils/draftManager.js');
            interaction.client.draftManager = new DraftManager(interaction.client);
        }

        const draftManager = interaction.client.draftManager;

        // Check if draft already exists
        const existingDraft = draftManager.getDraft(interaction.channelId);
        if (existingDraft) {
            const embed = embedBuilder.error('Draft Active', 'A draft is already running in this channel. Use `/draft end` to stop it first.');
            return await interaction.editReply({ embeds: [embed] });
        }

        try {
            // Create test draft
            const draftId = await draftManager.createDraft({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                managerId: interaction.user.id,
                captains: 2,
                rosterSize: 3,
                budget: 1000
            });

            const embed = embedBuilder.success('Test Draft Created!',
                'Quick test draft created with:\n' +
                '• **Auto-detected captains** from role\n' +
                '• **3 players** per team\n' +
                '• **$1,000** budget per captain\n\n' +
                'Draft will auto-start with captains who have the role!'
            );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            interaction.client.logger.error('Test draft creation failed:', error);
            const embed = embedBuilder.error('Test Failed', 'Failed to create test draft. Check console for details.');
            await interaction.editReply({ embeds: [embed] });
        }
    },

    async startFullTest(interaction) {
        await interaction.deferReply();

        // Check if draft manager exists
        if (!interaction.client.draftManager) {
            const DraftManager = require('../../utils/draftManager.js');
            interaction.client.draftManager = new DraftManager(interaction.client);
        }

        const draftManager = interaction.client.draftManager;

        // Check if draft already exists
        const existingDraft = draftManager.getDraft(interaction.channelId);
        if (existingDraft) {
            const embed = embedBuilder.error('Draft Active', 'A draft is already running in this channel. Use `/draft end` to stop it first.');
            return await interaction.editReply({ embeds: [embed] });
        }

        try {
            // Create full test draft
            const draftId = await draftManager.createDraft({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                managerId: interaction.user.id,
                captains: 4,
                rosterSize: 5,
                budget: 2000
            });

            const embed = embedBuilder.success('Full Test Draft Created!',
                'Full test draft created with:\n' +
                '• **Auto-detected captains** from role\n' +
                '• **5 players** per team\n' +
                '• **$2,000** budget per captain\n\n' +
                'This simulates a complete draft experience with auto-start!'
            );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            interaction.client.logger.error('Full test draft creation failed:', error);
            const embed = embedBuilder.error('Test Failed', 'Failed to create full test draft. Check console for details.');
            await interaction.editReply({ embeds: [embed] });
        }
    },

    async showDemo(interaction) {
        await interaction.deferReply();

        const embed = embedBuilder.createEmbed({ color: '#ffd700' });
        embed.setTitle('🏆 **ADVANCED DRAFT SYSTEM** • *Demo & Features*');
        embed.setDescription(`
**The most advanced Discord draft system ever created!** 🚀

This system features **fault-tolerant, auction-style team formation** with cutting-edge Discord.js v14 technology.`);

        embed.addFields(
            {
                name: '🎯 **Core Features**',
                value: `
• **Auction-style bidding** with real money budgets
• **Turn-based captain rotation** with auto-skip protection
• **Live countdown timers** (2min start, 30sec turns, 10sec bid reset)
• **Interactive button interface** - no slash commands during draft
• **Real-time embed updates** with live statistics
• **Crash recovery** with MongoDB persistence`,
                inline: false
            },
            {
                name: '⚡ **Smart Flow**',
                value: `
**1.** Manager creates lobby with settings
**2.** Captains join via interactive buttons
**3.** 2-minute countdown when lobby full
**4.** Turn-based bidding with 30-second timers
**5.** 10-second reset after each successful bid
**6.** Auto-skip protection prevents stalling
**7.** Final rosters sorted by fiscal efficiency`,
                inline: false
            },
            {
                name: '🛡️ **Advanced Protection**',
                value: `
• **Race-free channel locking** (one draft per channel)
• **Atomic budget validation** prevents overspending
• **Regex-hardened currency parsing**
• **Permission-based access control**
• **Comprehensive error handling**
• **Auto-recovery from network issues**`,
                inline: false
            },
            {
                name: '📊 **Final Results**',
                value: `
• **Complete roster breakdown** with pick order
• **Budget efficiency rankings** (most cash left wins)
• **Draft statistics** and performance metrics
• **Pick history** with timestamps and costs
• **Exportable data** for league management`,
                inline: false
            },
            {
                name: '🚀 **Getting Started**',
                value: `
**Quick Test:** \`/test-draft quick\` (2 captains, 3 players)
**Full Test:** \`/test-draft full\` (4 captains, 5 players)
**Live Draft:** \`/draft start\` (custom settings)

*Perfect for esports teams, gaming leagues, and competitive communities!*`,
                inline: false
            }
        );

        embed.setFooter({ text: 'DBL Bot • The Future of Discord Drafting' });
        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
