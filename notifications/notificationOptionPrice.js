const User = require('../models/User');
const { fetchOptionPriceInUSD } = require('./updateLastPrice'); // Импортируем метод из updateLastPrice

// Функция, которая проверяет цены опционов и отправляет уведомления
async function checkNotificationPrices(bot) {
    try {
        const users = await User.find({ "tracks.notificationPrice": { $gt: 0 } });

        for (const user of users) {
            for (const track of user.tracks) {
                if (track.notificationPrice > 0) {
                    const optionInstrumentName = `${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.charAt(0).toUpperCase()}`;
                    const currentOptionPrice = await fetchOptionPriceInUSD(track.asset, optionInstrumentName, track.optionType);

                    console.log(`Checking ${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.toUpperCase()}`);
                    console.log(`Current Option Price: ${currentOptionPrice}`);
                    console.log(`Notification Price: ${track.notificationPrice}`);

                    let notify = false;

                    if (track.optionType.toLowerCase() === 'put' && currentOptionPrice <= track.notificationPrice) {
                        notify = true;
                    } else if (track.optionType.toLowerCase() === 'call' && currentOptionPrice >= track.notificationPrice) {
                        notify = true;
                    }

                    if (notify) {
                        const roundedPrice = currentOptionPrice.toFixed(2); // Округляем до 2 знаков после запятой
                        console.log(`Notification triggered for ${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.toUpperCase()}`);
                        await bot.sendMessage(
                            user.telegramId,
                            `${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.toUpperCase()} reached the notification price of $${roundedPrice}. (Notification price reset, please set a new one.)`
                        );

                        // Сбрасываем цену уведомления после отправки уведомления
                        track.notificationPrice = 0;
                        await user.save();
                    } else {
                        console.log('No notification triggered.');
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking notification prices:', error);
    }
}

// Экспортируем функцию
module.exports = {
    checkNotificationPrices,
};
