const mongoose = require('mongoose')
require('dotenv').config()

const connectDB = async () => {
	try {
		// Удалите параметр useNewUrlParser
		await mongoose.connect(process.env.MONGODB_URI)
		console.log('MongoDB connected...')
	} catch (err) {
		console.error(err.message)
		process.exit(1)
	}
}

module.exports = connectDB