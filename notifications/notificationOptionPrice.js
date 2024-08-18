const User = require('../models/User');
const { fetchOptionPriceInUSD } = require('./updateLastPrice');

async function checkNotificationPrices(bot) {
    try {
        const users = await User.find({ "tracks.notificationPrice": { $gt: 0 } });

        for (const user of users) {
            for (const track of user.tracks) {
                // Если уведомление уже было удалено, пропускаем этот трек
                if (track.notificationPrice === 0 || track.notificationPending) {
                    continue;
                }

                const optionInstrumentName = `${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.charAt(0).toUpperCase()}`;
                const currentOptionPrice = await fetchOptionPriceInUSD(track.asset, optionInstrumentName, track.optionType);

                if (!currentOptionPrice || currentOptionPrice === 0) {
                    console.log(`Received a zero or invalid price for ${optionInstrumentName}. Skipping notification.`);
                    continue; // Пропустить итерацию, если цена равна нулю
                }

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
                    const roundedPrice = currentOptionPrice.toFixed(2);
                    console.log(`Notification triggered for ${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.toUpperCase()}`);

                    // Используем MongoDB `_id` для поиска трека
                    const inlineKeyboard = {
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [
                                    { text: '♻️ Keep', callback_data: `keep_notification_${track._id}` },
                                    { text: '🗑 Remove', callback_data: `remove_notification_price_${track._id}` },
                                ],
                                [{ text: '✏️ Edit', callback_data: `edit_option_${track._id}` }]
                            ]
                        })
                    };

                    await bot.sendMessage(
                        user.telegramId,
                        `<b>${track.asset}-${track.expiryDate}-${track.strikePrice}-${track.optionType.toUpperCase()}</b> reached the notification price of <b>$${roundedPrice}</b>.\n\n` +
                        `<b>Choose one of the following options:</b>\n` +
                        `"<b>Keep</b>" • Keep the current settings. \n` +
                        `"<b>Remove</b>" • Remove the notification settings.\n` +
                        `"<b>Edit</b>" • Edit the notification settings.`,
                        {
                            parse_mode: 'HTML',
                            ...inlineKeyboard
                        }
                    );

                    // Отмечаем, что уведомление отправлено и ожидает действий пользователя
                    track.notificationPending = true;
                    await user.save();
                }
            }
        }
    } catch (error) {
        console.error('Error checking notification prices:', error);
    }
}

module.exports = {
    checkNotificationPrices,
};
