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
							[{ text: 'Back', callback_data: 'back_to_main' }],
						],
					}),
				},
			};
		}
		return {
			text: user.tracks
				.map(
					track =>
						`Asset: ${track.asset}\nExpiry Date: ${track.expiryDate}\nStrike Price: ${track.strikePrice}\nOption Type: ${track.optionType}\nOption Price: ${track.optionPrice} $\nNotification Price: ${track.notificationPrice} $\nPercent Change: ${track.percentChange} %\nLast Price: ${track.lastPrice} $\nTime Frame: ${track.timeFrame}`
				)
				.join('\n\n'),
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [
						...user.tracks.map(track => [
							{
								text: `${track.asset} ${track.expiryDate}`,
								callback_data: `edit_${track._id}`,
							},
						]),
						[{ text: 'Back', callback_data: 'back_to_main' }],
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
					inline_keyboard: [[{ text: 'Back', callback_data: 'back_to_main' }]],
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
			text: `Asset: ${option.asset}\nExpiry Date: ${option.expiryDate}\nStrike Price: ${option.strikePrice}\nOption Type: ${option.optionType}\nOption Price: ${option.optionPrice} $\nNotification Price: ${option.notificationPrice} $\nPercent Change: ${option.percentChange} %\nLast Price: ${option.lastPrice} $\nTime Frame: ${option.timeFrame}`,
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [
						[
							{ text: 'Edit', callback_data: `edit_option_${optionId}` },
							{ text: 'Remove', callback_data: `remove_option_${optionId}` },
						],
						[{ text: 'Back', callback_data: 'favorites' }],
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
			text: `Asset: ${option.asset}\nExpiry Date: ${option.expiryDate}\nStrike Price: ${option.strikePrice}\nOption Type: ${option.optionType}\nOption Price: ${option.optionPrice} $\nNotification Price: ${option.notificationPrice} $\nPercent Change: ${option.percentChange} %\nLast Price: ${option.lastPrice} $\nTime Frame: ${option.timeFrame}`,
			options: {
				parse_mode: 'HTML',
				reply_markup: JSON.stringify({
					inline_keyboard: [
						[{ text: 'Change notification Option Price', callback_data: `change_notification_option_price_${optionId}` }],
						[{ text: 'Change notification change %', callback_data: `change_notification_change_${optionId}` }],
						[{ text: 'Remove notification settings', callback_data: `remove_notification_settings_${optionId}` }],
						[{ text: 'Back', callback_data: 'favorites' }],
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
