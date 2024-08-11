const {
	hedgeCalculatorOption,
	hedgePriceOption,
} = require('../customMessageOption/options')
const { getHedgeSuggestions } = require('../service/deribitApi')
const User = require('../models/User')
const {
	welcomeMessage,
	generateUniqueId,
} = require('../customMessageOption/utils')

const askPurchasePrice = async (bot, chatId, asset) => {
	await bot.sendMessage(
		chatId,
		`You've selected ${asset}. Enter the purchase price:`
	)
}

const askQuantity = async (bot, chatId) => {
	await bot.sendMessage(chatId, 'Enter the quantity:')
}

const askAllowedLoss = async (bot, chatId) => {
	await bot.sendMessage(chatId, 'Enter the optimal allowed loss (%):')
}

const confirmData = async (bot, chatId, data) => {
	try {
		const purchasePrice = parseFloat(data.purchasePrice)
		const quantity = parseFloat(data.quantity)
		const allowedLoss = parseFloat(data.allowedLoss)

		const suggestions = await getHedgeSuggestions(
			data.asset,
			purchasePrice,
			quantity,
			allowedLoss
		)

		const dailyMessage = suggestions.daily
			.map(
				s =>
					`Expiration: ${s.expiration} (${
						s.chosenStrike
					}), Hedge: ${s.hedgeCost.toFixed(2)} $`
			)
			.join('\n')
		const weeklyMessage = suggestions.weekly
			.map(
				s =>
					`Expiration: ${s.expiration} (${
						s.chosenStrike
					}), Hedge: ${s.hedgeCost.toFixed(2)} $`
			)
			.join('\n')

		const message = `Your data has been collected:

Asset: ${data.asset}
Purchase price: ${purchasePrice} $
Quantity: ${quantity} ${data.asset}
Allowed loss (%): ${allowedLoss}%

<b>Hedge suggestions (Daily):</b>
${dailyMessage}

<b>Hedge suggestions (Weekly):</b>
${weeklyMessage}
`

		await bot.sendMessage(chatId, message, hedgePriceOption)

		data.dailySuggestions = suggestions.daily
		data.weeklySuggestions = suggestions.weekly
		data.selectedDates = []
	} catch (error) {
		console.error('Error getting hedge suggestions:', error)
		await bot.sendMessage(
			chatId,
			'There was an error calculating the hedge suggestions. Please try again later.'
		)
	}
}

const saveTracks = async (
	bot,
	chatId,
	suggestions,
	asset,
	quantity,
	username,
	messageId,
	data
) => {
	try {
		const tracks = suggestions.map(suggestion => ({
			optionId: generateUniqueId(),
			asset: asset,
			expiryDate: suggestion.expiration,
			strikePrice: suggestion.chosenStrike,
			optionType: 'Put',
			optionPrice: Math.round((suggestion.hedgeCost / quantity) * 100) / 100,
		}))

		await User.updateOne(
			{ telegramId: String(chatId) },
			{ $push: { tracks: { $each: tracks } } }
		)

		delete data.dailySuggestions
		delete data.weeklySuggestions
		delete data.selectedDates

		await welcomeMessage(bot, chatId, username, messageId)
	} catch (error) {
		console.error('Error saving tracks:', error)
		await bot.sendMessage(
			chatId,
			'Error saving options. Please try again later.'
		)
	}
}

module.exports = {
	askPurchasePrice,
	askQuantity,
	askAllowedLoss,
	confirmData,
	saveTracks,
}
