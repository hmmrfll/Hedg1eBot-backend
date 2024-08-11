const User = require('../models/User');
const { fetchOptionPriceInUSD } = require('./updateLastPrice');

let originalPriceData = {};

async function checkPercentChangeNotifications(bot) {
    try {
        const users = await User.find({});

        for (const user of users) {
            for (const track of user.tracks) {
                const { percentChange, timeFrame, asset, expiryDate, strikePrice, optionType, optionId } = track;

                if (percentChange > 0 || timeFrame > 0) {
                    const optionInstrumentName = `${asset}-${expiryDate}-${strikePrice}-${optionType.charAt(0).toUpperCase()}`;
                    const currentOptionPrice = await fetchOptionPriceInUSD(asset, optionInstrumentName, optionType);

                    console.log(`\nChecking option: ${optionInstrumentName}`);
                    console.log(`Current Option Price: ${currentOptionPrice}`);

                    if (!originalPriceData[optionId] || originalPriceData[optionId].price === 0) {
                        originalPriceData[optionId] = {
                            price: currentOptionPrice,
                            time: Date.now()
                        };
                        console.log(`Initial price set for ${optionInstrumentName}: ${originalPriceData[optionId].price}`);
                        continue; // Пропускаем первую итерацию, так как только что установили начальную цену
                    }

                    const initialPrice = originalPriceData[optionId].price;
                    const initialTime = originalPriceData[optionId].time;

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
                        const message = `${asset}-${expiryDate}-${strikePrice}-${optionType.toUpperCase()} ${direction} by ${Math.abs(percentageChange)}%. (Notification reset, please set new parameters.)`;

                        console.log(`Notification triggered: ${message}`);
                        await bot.sendMessage(user.telegramId, message);

                        track.percentChange = 0;
                        track.timeFrame = 0;
                        await user.save();

                        delete originalPriceData[optionId];
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking percent change notifications:', error);
    }
}

module.exports = { checkPercentChangeNotifications };
