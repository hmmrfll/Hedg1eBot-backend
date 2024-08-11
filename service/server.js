const express = require('express')
const mongoose = require('mongoose')
const connectDB = require('../db') // Подключение к базе данных
const User = require('../models/User') // Модель пользователя

const app = express()
app.use(express.json()) // Для парсинга JSON в теле запроса

// Подключение к базе данных
connectDB()

// GET - Получение всех пользователей
app.get('/users', async (req, res) => {
	try {
		const users = await User.find()
		res.json(users)
	} catch (err) {
		res.status(500).json({ message: err.message })
	}
})

// GET - Получение пользователя по Telegram ID
app.get('/users/:telegramId', async (req, res) => {
	try {
		const user = await User.findOne({ telegramId: req.params.telegramId })
		if (!user) return res.status(404).json({ message: 'User not found' })
		res.json(user)
	} catch (err) {
		res.status(500).json({ message: err.message })
	}
})

// PUT - Обновление пользователя по Telegram ID
app.put('/users/:telegramId', async (req, res) => {
	try {
		const user = await User.findOneAndUpdate(
			{ telegramId: req.params.telegramId },
			req.body,
			{ new: true }
		)
		if (!user) return res.status(404).json({ message: 'User not found' })
		res.json(user)
	} catch (err) {
		res.status(400).json({ message: err.message })
	}
})

// DELETE - Удаление пользователя по Telegram ID
app.delete('/users/:telegramId', async (req, res) => {
	try {
		const user = await User.findOneAndDelete({
			telegramId: req.params.telegramId,
		})
		if (!user) return res.status(404).json({ message: 'User not found' })
		res.json({ message: 'User deleted' })
	} catch (err) {
		res.status(500).json({ message: err.message })
	}
})

// POST - Добавление отслеживаемого опциона для пользователя
app.post('/users/:telegramId/tracks', async (req, res) => {
	const {
		optionId,
		asset,
		expiryDate,
		strikePrice,
		optionType,
		optionPrice,
		notificationPrice,
		percentChange,
		lastPrice,
		notificationThreshold,
	} = req.body
	try {
		const user = await User.findOne({ telegramId: req.params.telegramId })
		if (!user) return res.status(404).json({ message: 'User not found' })

		const track = {
			optionId,
			asset,
			expiryDate,
			strikePrice,
			optionType,
			optionPrice,
			notificationPrice,
			percentChange,
			lastPrice,
			notificationThreshold,
		}

		user.tracks.push(track)
		await user.save()
		res.status(201).json(track)
	} catch (err) {
		res.status(400).json({ message: err.message })
	}
})

// PUT - Обновление отслеживаемого опциона для пользователя
app.put('/users/:telegramId/tracks/:optionId', async (req, res) => {
	const { optionId } = req.params
	const updates = req.body
	try {
		const user = await User.findOne({ telegramId: req.params.telegramId })
		if (!user) return res.status(404).json({ message: 'User not found' })

		const track = user.tracks.id(optionId)
		if (!track) return res.status(404).json({ message: 'Track not found' })

		Object.assign(track, updates)
		await user.save()
		res.json(track)
	} catch (err) {
		res.status(400).json({ message: err.message })
	}
})

// DELETE - Удаление отслеживаемого опциона для пользователя
app.delete('/users/:telegramId/tracks/:optionId', async (req, res) => {
	const { optionId } = req.params
	try {
		const user = await User.findOne({ telegramId: req.params.telegramId })
		if (!user) return res.status(404).json({ message: 'User not found' })

		const track = user.tracks.id(optionId)
		if (!track) return res.status(404).json({ message: 'Track not found' })

		track.remove()
		await user.save()
		res.json({ message: 'Track deleted' })
	} catch (err) {
		res.status(400).json({ message: err.message })
	}
})

// Запуск сервера
const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
