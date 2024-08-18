const User = require('../models/User');

const getFavorites = async (bot, chatId) => {
	try {
		const user = await User.findOne({ telegramId: String(chatId) });
		if (!user || !user.tracks || user.tracks.length === 0) {
			return {
				text: 'You have no favorite options tracked.',
				options: {
					parse_mode: 'HTML',
					reply_markup: JSON.stringify({
						inline_keyboard: [
							[{ text: '< Back', callback_data: 'back_to_main' }],
						],
					}),
				},
			};
		}
		return {
			text: user.tracks
				.map(track => {
					// Capitalize the first letter of the option type
					const optionTypeFormatted = track.optionType.charAt(0).toUpperCase();

					let info = `<b>${track.asset}-${track.expiryDate}-${track.strikePrice}-${optionTypeFormatted}</b>\n\n`;

					// Add alert settings only if there are any values
					let alertSettings = '';
					if (track.notificationPrice > 0 || track.percentChange > 0 || track.timeFrame > 0) {
						alertSettings += `<b>Notification settings:</b>\n`;
						if (track.notificationPrice > 0) {
							alertSettings += `Notification Price: ${track.notificationPrice} $\n`;
						}
						if (track.percentChange > 0) {
							alertSettings += `Percent Change: ${track.percentChange} %\n`;
						}
						if (track.timeFrame > 0) {
							alertSettings += `Time Frame: ${track.timeFrame} min\n`;
						}
						alertSettings += '\n'; // Add a newline for separation after alert settings
					}

					info += alertSettings;

					// Add saved price and option price only if they are greater than zero
					if (track.optionPrice > 0) {
						info += `Saved Price: ${track.optionPrice} $\n`;
					}
					if (track.lastPrice > 0) {
						info += `Option Price: <b>${track.lastPrice} $</b>\n`;
					}

					return info.trim();
				})
				.join('\n\n====================\n\n'),
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [
						...user.tracks.map(track => [
							{
								text: `${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.charAt(0).toUpperCase()}`,
								callback_data: `edit_${track._id}`,
							},
						]),
						[{ text: '< Back', callback_data: 'back_to_main' }],
					],
				}),
			},
		};

	} catch (error) {
		console.error('Error fetching favorites:', error);
		return {
			text: 'There was an error fetching your favorite options. Please try again later.',
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [[{ text: '< Back', callback_data: 'back_to_main' }]],
				}),
			},
		};
	}
};

const getOptionDetails = async (bot, chatId, optionId) => {
	try {
		const user = await User.findOne({ telegramId: String(chatId) });
		if (!user) {
			return {
				text: 'Option not found.',
				options: {
					parse_mode: 'HTML',
					reply_markup: JSON.stringify({
						inline_keyboard: [[{ text: '< Back', callback_data: 'favorites' }]],
					}),
				},
			};
		}
		const option = user.tracks.id(optionId);
		if (!option) {
			return {
				text: 'Option not found.',
				options: {
					parse_mode: 'HTML',
					reply_markup: JSON.stringify({
						inline_keyboard: [[{ text: '< Back', callback_data: 'favorites' }]],
					}),
				},
			};
		}
		return {
			text: `<b>${option.asset}-${option.expiryDate}-${option.strikePrice}-${option.optionType.charAt(0).toUpperCase()}</b>\n\n` +
				`<b>Notification settings:</b>\n` +
				`Notification Price: ${option.notificationPrice} $\n` +
				`Percent Change: ${option.percentChange} %\n` +
				`Time Frame: ${option.timeFrame} min\n\n` +
				`Saved Price: ${option.optionPrice} $\n` +
				`Option Price: <b>${option.lastPrice} $</b>\n`,
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [
						[
							{ text: '✏️ Edit Notification', callback_data: `edit_option_${optionId}` }],
							[{ text: '🗑 Remove', callback_data: `remove_option_${optionId}` },
						],
						[{ text: '< Back', callback_data: 'favorites' }],
					],
				}),
			},
		};

	} catch (error) {
		console.error('Error fetching option details:', error);
		return {
			text: 'There was an error fetching the option details. Please try again later.',
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [[{ text: 'Back', callback_data: 'favorites' }]],
				}),
			},
		};
	}
};

const getEditOptionDetails = async (bot, chatId, optionId) => {
	try {
		const user = await User.findOne({ telegramId: String(chatId) });
		if (!user) {
			return {
				text: 'Option not found.',
				options: {
					parse_mode: 'HTML',
					reply_markup: JSON.stringify({
						inline_keyboard: [[{ text: 'Back', callback_data: 'favorites' }]],
					}),
				},
			};
		}
		const option = user.tracks.id(optionId);
		if (!option) {
			return {
				text: 'Option not found.',
				options: {
					parse_mode: 'HTML',
					reply_markup: JSON.stringify({
						inline_keyboard: [[{ text: 'Back', callback_data: 'favorites' }]],
					}),
				},
			};
		}
		return {
			text: `<b>${option.asset}-${option.expiryDate}-${option.strikePrice}-${option.optionType.charAt(0).toUpperCase()}</b>\n\n` +
				`<b>Notification settings:</b>\n` +
				`Notification Price: ${option.notificationPrice} $\n` +
				`Percent Change: ${option.percentChange} %\n` +
				`Time Frame: ${option.timeFrame} min\n\n` +
				`Saved Price: ${option.optionPrice} $\n` +
				`Option Price: <b>${option.lastPrice} $</b>\n\n` +
				`<b>Choose an option below:</b>\n` +
				`<b>💸 Option price</b> - Change the price at which you receive notifications for this option.\n` +
				`<b>⏰ Changes</b> - Adjust the percentage change and time frame for notifications.\n` +
				`     - 📐 <b>Change %</b> - Configure notifications based on percentage change.\n` +
				`     - ⌛️ <b>Time Frame</b> - Set the time frame within which the percentage change should occur.\n` +
				`     - 📲 <b>Change Both</b> - Configure notifications for both percentage change and time frame.\n` +
				`<b>🗑 Remove Settings</b> - Remove the notification settings for this option.\n`,
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [
						[{ text: '💸 Option price', callback_data: `change_notification_option_price_${optionId}` },
							{ text: '⏰ Changes', callback_data: `change_notification_change_${optionId}` }],
						[{ text: '🗑 Remove Settings', callback_data: `remove_notification_settings_${optionId}` }],
						[{ text: '< Back', callback_data: 'favorites' }],
					],
				}),
			},
		};
	} catch (error) {
		console.error('Error fetching option details:', error);
		return {
			text: 'There was an error fetching the option details. Please try again later.',
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [[{ text: 'Back', callback_data: 'favorites' }]],
				}),
			},
		};
	}
};

const removeOption = async (bot, chatId, optionId) => {
	try {
		await User.updateOne(
			{ telegramId: String(chatId) },
			{ $pull: { tracks: { _id: optionId } } }
		);
		await bot.sendMessage(chatId, 'Option removed successfully.');
	} catch (error) {
		console.error('Error removing option:', error);
		await bot.sendMessage(chatId, 'There was an error removing the option. Please try again later.');
	}
};

const updateNotificationPrice = async (bot, chatId, optionId, notificationPrice) => {
	try {
		await User.updateOne(
			{ telegramId: String(chatId), 'tracks._id': optionId },
			{ $set: { 'tracks.$.notificationPrice': notificationPrice } }
		);
		await bot.sendMessage(chatId, 'Notification option price updated successfully.');
	} catch (error) {
		console.error('Error updating notification option price:', error);
		await bot.sendMessage(chatId, 'There was an error updating the notification option price. Please try again later.');
	}
};

const updatePercentChange = async (bot, chatId, optionId, percentChange) => {
	try {
		await User.updateOne(
			{ telegramId: String(chatId), 'tracks._id': optionId },
			{ $set: { 'tracks.$.percentChange': percentChange } }
		);
		await bot.sendMessage(chatId, 'Percent change updated successfully.');
	} catch (error) {
		console.error('Error updating percent change:', error);
		await bot.sendMessage(chatId, 'There was an error updating the percent change. Please try again later.');
	}
};

const updateTimeFrame = async (bot, chatId, optionId, timeFrame) => {
	try {
		await User.updateOne(
			{ telegramId: String(chatId), 'tracks._id': optionId },
			{ $set: { 'tracks.$.timeFrame': timeFrame } }
		);
		await bot.sendMessage(chatId, 'Time frame updated successfully.');
	} catch (error) {
		console.error('Error updating time frame:', error);
		await bot.sendMessage(chatId, 'There was an error updating the time frame. Please try again later.');
	}
};

const resetNotificationSettings = async (bot, chatId, optionId) => {
	try {
		await User.updateOne(
			{ telegramId: String(chatId), 'tracks._id': optionId },
			{ $set: { 'tracks.$.notificationPrice': 0, 'tracks.$.percentChange': 0, 'tracks.$.timeFrame': 0 } }
		);
		await bot.sendMessage(chatId, 'Notification settings removed successfully.');
	} catch (error) {
		console.error('Error resetting notification settings:', error);
		await bot.sendMessage(chatId, 'There was an error resetting the notification settings. Please try again later.');
	}
};

const updateFavoriteNotificationSettings = async (bot, chatId, userState, field, value) => {
	try {
		const optionId = userState[chatId].currentOptionId;
		if (!optionId || typeof optionId !== 'string') {
			throw new Error('Invalid option ID');
		}

		await User.updateOne(
			{ telegramId: String(chatId), 'tracks._id': optionId },
			{ $set: { [`tracks.$.${field}`]: value } }
		);

		const { text, options } = await getFavorites(bot, chatId);
		userState[chatId].state = null;
		userState[chatId].currentOptionId = null;
		await bot.sendMessage(chatId, text, options);
	} catch (error) {
		console.error(`Error updating ${field}:`, error);
		await bot.sendMessage(chatId, `There was an error updating the ${field}. Please try again later.`);
	}
};


module.exports = {
	getFavorites,
	getOptionDetails,
	getEditOptionDetails,
	removeOption,
	updateNotificationPrice,
	updatePercentChange,
	updateTimeFrame,
	resetNotificationSettings,
	updateFavoriteNotificationSettings
};
