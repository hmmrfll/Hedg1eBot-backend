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

        // Обновляем lastPrice и удаляем опционы с lastPriceInUSD, равным нулю
        user.tracks = await Promise.all(user.tracks.map(async (track) => {
            const instrumentName = `${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType[0].toUpperCase()}`;
            const lastPriceInUSD = await fetchOptionPriceInUSD(track.asset, instrumentName, track.optionType);

            // Если цена опциона равна нулю, возвращаем null, чтобы его можно было удалить позже
            if (lastPriceInUSD === 0) {
                console.log(`Removing option with instrument name: ${instrumentName} due to last price being 0`);
                return null;
            }

            track.lastPrice = parseFloat(lastPriceInUSD.toFixed(2));
            return track;
        }));

        // Удаляем null-значения (опционы с lastPriceInUSD, равным 0)
        user.tracks = user.tracks.filter(track => track !== null);

        await user.save();
        console.log('Last prices updated successfully for user:', user.username);
    } catch (error) {
        console.error('Error updating last prices:', error);
    }
}


module.exports = { updateLastPricesForUser, fetchOptionPriceInUSD };
