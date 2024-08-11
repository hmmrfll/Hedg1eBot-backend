// utils.js

const { welcomeOption } = require('./options')

const welcomeMessage = async (bot, chatId, username, messageId) => {
	if (messageId) {
		try {
			await bot.editMessageText(
				`Welcome! @${username}, you've joined Hedgie Bot. This bot helps traders and investors automate market tracking and analysis.`,
				{
					chat_id: chatId,
					message_id: messageId,
					reply_markup: welcomeOption.reply_markup,
				}
			)
		} catch (error) {
			if (error.response.body.error_code === 400) {
				await bot.sendMessage(
					chatId,
					`Welcome! @${username}, you've joined Hedgie Bot. This bot helps traders and investors automate market tracking and analysis.`,
					welcomeOption
				)
			} else {
				throw error
			}
		}
	} else {
		await bot.sendMessage(
			chatId,
			`Welcome! @${username}, you've joined Hedgie Bot. This bot helps traders and investors automate market tracking and analysis.`,
			welcomeOption
		)
	}
}

const generateUniqueId = () => {
	return Math.random().toString(36).substring(2, 15)
}

const validateNumberInput = input => {
	input = input.replace(',', '.')
	if (!/^[0-9.]+$/.test(input)) {
		return null
	}
	const number = parseFloat(input)
	if (isNaN(number)) {
		return null
	}
	return number
}

const generateReferralCode = () => {
	return Math.random().toString(36).substr(2, 9)
}

const getOptionTypeFromCallbackData = data => {
	switch (data) {
		case 'daily_save':
			return 'Daily'
		case 'weekly_save':
			return 'Weekly'
		case 'specific_save':
			return 'Specific'
		default:
			return ''
	}
}

module.exports = {
	welcomeMessage,
	generateUniqueId,
	validateNumberInput,
	generateReferralCode,
	getOptionTypeFromCallbackData,
}
