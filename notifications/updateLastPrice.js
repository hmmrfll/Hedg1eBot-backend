const axios = require('axios');
const User = require('../models/User');
const { fetchOptionPrice, fetchMarketPrice } = require('../service/deribitApi'); // Предполагается, что ваши API методы находятся в этом файле

async function fetchOptionPriceInUSD(asset, instrumentName) {
    const optionPrice = await fetchOptionPrice(asset, instrumentName);
    const marketPrice = await fetchMarketPrice(asset);
    const optionPriceInUSD = optionPrice * marketPrice;
    return optionPriceInUSD;
}

async function updateLastPricesForUser(userId) {
    try {
        const user = await User.findById(userId);

        if (!user || !user.tracks || user.tracks.length === 0) {
            console.log('No options found for this user.');
            return;
        }

        for (let track of user.tracks) {
            const instrumentName = `${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType[0].toUpperCase()}`;
            const lastPriceInUSD = await fetchOptionPriceInUSD(track.asset, instrumentName, track.optionType);
            track.lastPrice = parseFloat(lastPriceInUSD.toFixed(2));
        }

        await user.save();
        console.log('Last prices updated successfully for user:', user.username);
    } catch (error) {
        console.error('Error updating last prices:', error);
    }
}

module.exports = { updateLastPricesForUser, fetchOptionPriceInUSD };
