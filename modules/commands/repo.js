const { SlashCommandBuilder } = require('discord.js');
const { Octokit } = require('@octokit/rest');
const GitHub = new Octokit();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('repo')
		.setDescription('Authorise a repository to use https://bouncytorch.xyz/ as a webhook.')
		.addSubcommand(command => command
			.setName('add')
			.setDescription('Add a new webhook record.')
			.addStringOption(option => option
				.setName('owner')
				.setDescription('Repository owner username.')
				.setRequired(true))
			.addStringOption(option => option
				.setName('repo')
				.setDescription('Repository name.')
				.setRequired(true))
			.addChannelOption(option => option
				.setName('hook_channel')
				.setDescription('Discord channel, to which hook messages will go to.'))),
	execute(interaction, db) {
		const user = interaction.options.getString('owner'),
			repo = interaction.options.getString('repo');
		let channel;
		if (!interaction.options.getChannel('hook_channel')) {
			channel = interaction.channel.id;
		} else channel = interaction.options.getChannel('hook_channel').id;

		db.query('SELECT * FROM recorded_webhooks WHERE `author` = ? AND `name` = ? AND `discord_channel`', [user, repo, channel], (err, results) => {
			if (err) throw err;
			if (results.length == 0) {
				db.query('INSERT INTO recorded_webhooks (name, author, discord_channel, allowed_events) VALUES (?, ?, ?, \'push, ping\')', [repo, user, channel], (err, results) => {
					if (err) throw err;
					interaction.reply(`Webhook recorded. To enable the webhoot, proceed to your repo (https://github.com/${user}/${repo}), navigate to \`Settings -> Webhooks\`, create a new one leading to \`https://bouncytorch.xyz/webhooks/${repo}\`, and switch Content Type to \`application/json\`.`, { files: [{ attachment: 'https://i.imgur.com/8bz8SHQ.png', name: 'msg.png' }] });
				});
			}
			else interaction.reply('Record already exists.');
		});
	},
};