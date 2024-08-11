const mongoose = require('mongoose')

// Схема для отслеживаемых опционов
const trackSchema = new mongoose.Schema({
	optionId: String,
	asset: String,
	expiryDate: String,
	strikePrice: Number,
	optionType: String,
	optionPrice: Number,
	notificationPrice: { type: Number, default: 0 },
	percentChange: { type: Number, default: 0 },
	lastPrice: { type: Number, default: 0 },
	timeFrame: { type: Number, default: 0 },
})

// Схема для пользователя
const userSchema = new mongoose.Schema({
	telegramId: { type: String, required: true, unique: true },
	username: { type: String, required: true },
	referralCode: { type: String, unique: true },
	referrerChatId: { type: Number, default: null },
	tracks: [trackSchema],
	referrals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
})

module.exports = mongoose.model('User', userSchema)
