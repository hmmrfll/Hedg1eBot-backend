const User = require('../models/User');
const { fetchOptionPrice, fetchMarketPrice } = require('../service/deribitApi');

const getAlerts = async (bot, chatId) => {
    try {
        const user = await User.findOne({ telegramId: String(chatId) });
        if (!user || !user.tracks || user.tracks.length === 0) {
            return {
                text: 'You have no alerts set up.',
                options: {
                    parse_mode: 'HTML',
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: 'Back', callback_data: 'back_to_main' }],
                        ],
                    }),
                },
            };
        }

        const alertTracks = user.tracks.filter(track =>
            track.notificationPrice !== 0 || track.percentChange !== 0 || track.timeFrame !== 0
        );

        if (alertTracks.length === 0) {
            return {
                text: 'You have no alerts set up.',
                options: {
                    parse_mode: 'HTML',
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: 'Back', callback_data: 'back_to_main' }],
                        ],
                    }),
                },
            };
        }

        return {
            text: alertTracks
                .map(track =>
                    `Asset: ${track.asset}\nExpiry Date: ${track.expiryDate}\nStrike Price: ${track.strikePrice}\nOption Type: ${track.optionType}\nOption Price: ${track.optionPrice} $\nNotification Price: ${track.notificationPrice} $\nPercent Change: ${track.percentChange} %\nLast Price: ${track.lastPrice} $\nTime Frame: ${track.timeFrame}`
                )
                .join('\n\n'),
            options: {
                parse_mode: 'HTML',
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Create Alerts', callback_data: 'create_alerts' }, { text: 'Remove Alerts', callback_data: 'remove_alerts' }],
                        [{ text: 'Back', callback_data: 'back_to_main' }],
                    ],
                }),
            },
        };
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return {
            text: 'There was an error fetching your alerts. Please try again later.',
            options: {
                parse_mode: 'HTML',
                reply_markup: JSON.stringify({
                    inline_keyboard: [[{ text: 'Back', callback_data: 'back_to_main' }]],
                }),
            },
        };
    }
};

const handleRemoveAlerts = async (bot, chatId, userState) => {
    try {
        const user = await User.findOne({ telegramId: String(chatId) });
        const alertTracks = user.tracks.filter(track =>
            track.notificationPrice !== 0 || track.percentChange !== 0 || track.timeFrame !== 0
        );

        if (!userState[chatId]) {
            userState[chatId] = {};
        }

        userState[chatId].selectedAlertTracks = [];

        const options = {
            parse_mode: 'HTML',
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    ...alertTracks.map(track => [
                        {
                            text: `${userState[chatId].selectedAlertTracks.includes(track._id.toString()) ? '✅ ' : ''}${track.asset} ${track.expiryDate}`,
                            callback_data: `toggle_alert_${track._id}`,
                        },
                    ]),
                    [{ text: 'Remove selected alerts', callback_data: 'remove_selected_alerts' }],
                    [{ text: 'Back', callback_data: 'back_to_alerts' }],
                ],
            }),
        };

        await bot.sendMessage(chatId, 'Select alerts to remove:', options);
    } catch (error) {
        console.error('Error handling remove alerts:', error);
        await bot.sendMessage(chatId, 'There was an error processing your request. Please try again later.');
    }
};

const removeSelectedAlerts = async (bot, chatId, userState) => {
    try {
        await User.updateOne(
            { telegramId: String(chatId) },
            { $pull: { tracks: { _id: { $in: userState[chatId].selectedAlertTracks } } } }
        );

        userState[chatId].selectedAlertTracks = [];

        await bot.sendMessage(chatId, 'Selected alerts have been removed.');
        const { text, options } = await getAlerts(bot, chatId);
        await bot.sendMessage(chatId, text, options);
    } catch (error) {
        console.error('Error removing selected alerts:', error);
        await bot.sendMessage(chatId, 'There was an error removing the selected alerts. Please try again later.');
    }
};

const saveAlertNotificationSettings = async (bot, chatId, userState) => {
    try {
        const user = await User.findOne({ telegramId: String(chatId) });
        if (!user) return;

        const {
            selectedAsset,
            selectedExpiration,
            selectedStrike,
            selectedOptionType,
            notificationType,
            currentNotificationPrice,
            currentPercentChange,
            currentTimeFrame,
        } = userState[chatId];

        if (!selectedAsset || !selectedExpiration || !selectedStrike || !selectedOptionType) return;

        const optionPriceBTC = await fetchOptionPrice(selectedAsset, `${selectedAsset}-${selectedExpiration}-${selectedStrike}-${selectedOptionType[0].toUpperCase()}`);
        const marketPriceUSD = await fetchMarketPrice(selectedAsset);
        const optionPriceUSD = optionPriceBTC * marketPriceUSD;

        const newTrack = {
            asset: selectedAsset,
            expiryDate: selectedExpiration,
            strikePrice: selectedStrike,
            optionType: selectedOptionType,
            optionPrice: parseFloat(optionPriceUSD.toFixed(2)),
            notificationPrice: notificationType === 'price' || notificationType === 'both' ? currentNotificationPrice : 0,
            percentChange: notificationType === 'percent_change' || notificationType === 'both' ? currentPercentChange : 0,
            timeFrame: currentTimeFrame || 0,
            lastPrice: 0,
        };

        user.tracks.push(newTrack);
        await user.save();

        // Сброс настроек уведомлений после сохранения
        userState[chatId].currentNotificationPrice = null;
        userState[chatId].currentPercentChange = null;
        userState[chatId].currentTimeFrame = null;
        userState[chatId].selectedAsset = null;
        userState[chatId].selectedExpiration = null;
        userState[chatId].selectedStrike = null;
        userState[chatId].selectedOptionType = null;
        userState[chatId].notificationType = null;

        const { text: alertText, options: alertOptions } = await getAlerts(bot, chatId);
        await bot.sendMessage(chatId, alertText, alertOptions);
    } catch (error) {
        console.error('Error saving notification settings:', error);
        await bot.sendMessage(chatId, 'There was an error saving the notification settings. Please try again later.');
    }
};

const resetAlertNotificationSettings = async (bot, chatId, optionId) => {
    try {
        const user = await User.findOne({ telegramId: String(chatId) });
        if (!user) return;

        const option = user.tracks.id(optionId);
        if (!option) return;

        option.notificationPrice = 0;
        option.percentChange = 0;
        option.timeFrame = 0;
        await user.save();
    } catch (error) {
        console.error('Error resetting notification settings:', error);
    }
};

module.exports = {
    getAlerts,
    handleRemoveAlerts,
    removeSelectedAlerts,
    saveAlertNotificationSettings,
    resetAlertNotificationSettings,
};
