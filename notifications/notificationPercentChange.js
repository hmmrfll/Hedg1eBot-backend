const User = require('../models/User');
const { fetchOptionPriceInUSD } = require('./updateLastPrice');

let originalPriceData = {};

async function checkPercentChangeNotifications(bot) {
    try {
        const users = await User.find({});

        for (const user of users) {
            for (const track of user.tracks) {
                const { percentChange, timeFrame, asset, expiryDate, strikePrice, optionType, optionId } = track;

                // Пропускаем, если уведомление уже отправлено и ждет действия пользователя
                if (track.notificationPending || (percentChange === 0 && timeFrame === 0)) {
                    continue;
                }

                const optionInstrumentName = `${asset}-${expiryDate}-${strikePrice}-${optionType.charAt(0).toUpperCase()}`;
                const currentOptionPrice = await fetchOptionPriceInUSD(asset, optionInstrumentName, optionType);

                if (!currentOptionPrice || currentOptionPrice === 0) {
                    console.log(`Received a zero or invalid price for ${optionInstrumentName}. Skipping notification.`);
                    continue; // Пропустить итерацию, если цена равна нулю
                }

                console.log(`\nChecking option: ${optionInstrumentName}`);
                console.log(`Current Option Price: ${currentOptionPrice}`);

                // Проверка на нулевую или недоступную цену
                if (currentOptionPrice === 0) {
                    console.log(`Received a zero price for ${optionInstrumentName}. Skipping calculation.`);
                    continue; // Пропустить итерацию, если цена равна нулю
                }

                if (!originalPriceData[optionId]) {
                    originalPriceData[optionId] = {
                        price: currentOptionPrice,
                        time: Date.now()
                    };
                    console.log(`Initial price set for ${optionInstrumentName}: ${originalPriceData[optionId].price}`);
                    continue; // Пропускаем первую итерацию, так как только что установили начальную цену
                }

                const initialPrice = originalPriceData[optionId].price || currentOptionPrice;
                const initialTime = originalPriceData[optionId].time;

                // Если цена не изменилась с момента последней проверки, пропускаем итерацию
                if (initialPrice === currentOptionPrice) {
                    console.log(`Price did not change for ${optionInstrumentName}. Skipping.`);
                    continue;
                }

                const priceDifference = currentOptionPrice - initialPrice;
                const percentageChange = ((priceDifference / initialPrice) * 100).toFixed(2);

                console.log(`Price Difference: ${priceDifference}`);
                console.log(`Percentage Change: ${percentageChange}%`);

                const currentTime = Date.now();
                const timeElapsed = (currentTime - initialTime) / 60000; // переводим время в минуты

                console.log(`Time Frame: ${timeFrame} minutes`);
                console.log(`Time Elapsed: ${timeElapsed} minutes`);

                let notify = false;

                if (timeFrame > 0) {
                    if (timeElapsed >= timeFrame) {
                        console.log(`Time frame exceeded. Checking for percent change...`);

                        if (Math.abs(percentageChange) >= percentChange || (percentChange === 0 && Math.abs(percentageChange) >= 10)) {
                            notify = true;
                        } else {
                            console.log('No significant change detected within the timeframe.');
                        }

                        originalPriceData[optionId].price = currentOptionPrice;
                        originalPriceData[optionId].time = currentTime;
                    } else {
                        console.log('Time frame not exceeded yet.');
                    }
                } else {
                    if (Math.abs(percentageChange) >= percentChange) {
                        notify = true;
                    } else {
                        console.log('No significant change detected.');
                    }
                }

                if (notify) {
                    const direction = percentageChange > 0 ? 'increased' : 'decreased';
                    const message = `<b>${asset}-${expiryDate}-${strikePrice}-${optionType.toUpperCase()}</b> ${direction} by <b>${Math.abs(percentageChange)}%</b>.`;

                    console.log(`Notification triggered: ${message}`);

                    // Создаем клавиатуру с короткими названиями кнопок
                    const inlineKeyboard = {
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [
                                    { text: '♻️ Keep', callback_data: `keep_notification_${track._id}` },
                                    { text: '🗑 Remove', callback_data: `remove_notification_change_${track._id}` },
                                ],
                                [{ text: '✏️ Edit', callback_data: `edit_option_${track._id}` }]
                            ]
                        })
                    };

                    // Отправляем сообщение с кнопками
                    await bot.sendMessage(
                        user.telegramId,
                        message + `\n\n<b>Choose one of the following options:</b>\n` +
                        `"<b>Keep</b>" • Keep the current settings. \n` +
                        `"<b>Remove</b>" • Remove the notification settings.\n` +
                        `"<b>Edit</b>" • Edit the notification settings.`,
                        {
                            parse_mode: 'HTML',
                            ...inlineKeyboard
                        }
                    );

                    // Устанавливаем флаг ожидания действия от пользователя
                    track.notificationPending = true;
                    await user.save();

                    // Очищаем сохраненные данные для этого опциона
                    delete originalPriceData[optionId];
                }
            }
        }
    } catch (error) {
        console.error('Error checking percent change notifications:', error);
    }
}

module.exports = { checkPercentChangeNotifications };
