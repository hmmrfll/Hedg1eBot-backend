const TelegramBot = require("node-telegram-bot-api");
require('dotenv').config();
const mongoose = require('mongoose');
const { welcomeOption, hedgeCalculatorOption, hedgePriceOption } = require('./customMessageOption/options');
const { getHedgeSuggestions } = require('./service/deribitApi');
const User = require('./models/User');
const token = process.env.TELEGRAM_TOKEN;
const connectDB = require('./config/db');
const { getExpirationDates, getStrikePrices, fetchOptionPrice, fetchMarketPrice } = require('./service/deribitApi');

const bot = new TelegramBot(token, { polling: true });
connectDB();

bot.setMyCommands([
    { command: '/start', description: 'Launch Hedgie Bot' }
]);

const userState = {};

const {
    getFavorites,
    getOptionDetails,
    getEditOptionDetails,
    removeOption,
    updateNotificationPrice,
    updatePercentChange,
    updateTimeFrame,
    resetNotificationSettings,
} = require('./components/favorites');
const { getAlerts } = require('./components/alerts');
const {
    welcomeMessage,
    validateNumberInput,
    generateReferralCode,
} = require('./customMessageOption/utils');

const start = () => {
    bot.on('message', async (msg) => {
        const text = msg.text;
        const chatId = msg.chat.id;
        const username = msg.chat.username;

        if (!userState[chatId]) {
            userState[chatId] = {};
        }

        try {
            if (text.startsWith('/start')) {
                const referrerChatId = text.split(' ')[1];
                userState[chatId].state = null;

                const newUser = await User.findOneAndUpdate(
                    { telegramId: String(chatId) },
                    {
                        telegramId: String(chatId),
                        username: username,
                        referralCode: generateReferralCode(),
                        referrerChatId: referrerChatId || null,
                    },
                    { upsert: true, new: true }
                );

                if (referrerChatId) {
                    await User.findOneAndUpdate(
                        { telegramId: referrerChatId },
                        { $push: { referrals: newUser._id } }
                    );
                }

                return welcomeMessage(bot, chatId, username);
            }

            // Hedge Calculator States
            if (userState[chatId].state === 'waitingForPurchasePrice') {
                const purchasePrice = validateNumberInput(text);
                if (purchasePrice === null) {
                    return bot.sendMessage(chatId, 'Please enter a valid purchase price (e.g., 1.6, 22.3, 0.78).');
                }
                userState[chatId].purchasePrice = purchasePrice;
                userState[chatId].state = 'waitingForQuantity';
                return askQuantity(chatId);
            }

            if (userState[chatId].state === 'waitingForQuantity') {
                const quantity = validateNumberInput(text);
                if (quantity === null) {
                    return bot.sendMessage(chatId, 'Please enter a valid quantity (e.g., 1, 10, 100).');
                }
                userState[chatId].quantity = quantity;
                userState[chatId].state = 'waitingForAllowedLoss';
                return askAllowedLoss(chatId);
            }

            if (userState[chatId].state === 'waitingForAllowedLoss') {
                const allowedLoss = validateNumberInput(text);
                if (allowedLoss === null) {
                    return bot.sendMessage(chatId, 'Please enter a valid allowed loss percentage (e.g., 0.5, 1.5, 10).');
                }
                userState[chatId].allowedLoss = allowedLoss;
                userState[chatId].state = null;
                return confirmData(chatId, userState[chatId]);
            }

            // Favorites and Alerts States
            if (userState[chatId].state === 'waitingForNotificationPriceFavorites') {
                const notificationPrice = validateNumberInput(text);
                if (notificationPrice === null) {
                    return bot.sendMessage(
                        chatId,
                        'Please enter a valid notification option price (e.g., 1.6, 22.3, 0.78).'
                    );
                }
                const optionId = userState[chatId].currentOptionId;
                await updateNotificationPrice(bot, chatId, optionId, notificationPrice);
                userState[chatId].state = null;
                userState[chatId].currentOptionId = null;
                const { text: editText, options: editOptions } = await getEditOptionDetails(bot, chatId, optionId);
                return bot.sendMessage(chatId, editText, editOptions);
            }

            if (userState[chatId].state === 'waitingForNotificationPriceAlerts') {
                const notificationPrice = validateNumberInput(text);
                if (notificationPrice === null) {
                    return bot.sendMessage(
                        chatId,
                        'Please enter a valid notification option price (e.g., 1.6, 22.3, 0.78).'
                    );
                }
                userState[chatId].currentNotificationPrice = parseFloat(notificationPrice.toFixed(2));
                if (userState[chatId].notificationType === 'both') {
                    userState[chatId].state = 'waitingForPercentChangeAlerts';
                    return bot.sendMessage(chatId, 'Enter percent change for notice:');
                } else {
                    await saveNotificationSettings(chatId);
                    const { text: alertText, options: alertOptions } = await getAlerts(bot, chatId);
                    userState[chatId].state = null;
                    userState[chatId].currentOptionId = null;
                    return bot.sendMessage(chatId, alertText, alertOptions);
                }
            }

            if (userState[chatId].state === 'waitingForPercentChangeFavorites') {
                const percentChange = validateNumberInput(text);
                if (percentChange === null) {
                    return bot.sendMessage(
                        chatId,
                        'Please enter a valid percent change (e.g., 1.6, 22.3, 0.78).'
                    );
                }
                const optionId = userState[chatId].currentOptionId;
                await updatePercentChange(bot, chatId, optionId, percentChange);
                userState[chatId].state = null;
                userState[chatId].currentOptionId = null;
                const { text: editText, options: editOptions } = await getEditOptionDetails(bot, chatId, optionId);
                return bot.sendMessage(chatId, editText, editOptions);
            }

            if (userState[chatId].state === 'waitingForPercentChangeAlerts') {
                const percentChange = validateNumberInput(text);
                if (percentChange === null) {
                    return bot.sendMessage(
                        chatId,
                        'Please enter a valid percent change (e.g., 1.6, 22.3, 0.78).'
                    );
                }
                userState[chatId].currentPercentChange = parseFloat(percentChange.toFixed(2));
                if (userState[chatId].notificationType === 'both') {
                    userState[chatId].state = 'waitingForTimeFrameAlerts';
                    return bot.sendMessage(chatId, 'Enter time frame for notice:');
                } else {
                    await saveNotificationSettings(chatId);
                    const { text: alertText, options: alertOptions } = await getAlerts(bot, chatId);
                    userState[chatId].state = null;
                    userState[chatId].currentOptionId = null;
                    return bot.sendMessage(chatId, alertText, alertOptions);
                }
            }

            if (userState[chatId].state === 'waitingForTimeFrameFavorites') {
                const timeFrame = validateNumberInput(text);
                if (timeFrame === null) {
                    return bot.sendMessage(
                        chatId,
                        'Please enter a valid time frame (e.g., 1, 10, 100).'
                    );
                }
                const optionId = userState[chatId].currentOptionId;
                await updateTimeFrame(bot, chatId, optionId, timeFrame);
                userState[chatId].state = null;
                userState[chatId].currentOptionId = null;
                const { text: editText, options: editOptions } = await getEditOptionDetails(bot, chatId, optionId);
                return bot.sendMessage(chatId, editText, editOptions);
            }

            if (userState[chatId].state === 'waitingForTimeFrameAlerts') {
                const timeFrame = validateNumberInput(text);
                if (timeFrame === null) {
                    return bot.sendMessage(
                        chatId,
                        'Please enter a valid time frame (e.g., 1, 10, 100).'
                    );
                }
                userState[chatId].currentTimeFrame = parseFloat(timeFrame.toFixed(2));
                await saveNotificationSettings(chatId);
                const { text: alertText, options: alertOptions } = await getAlerts(bot, chatId);
                userState[chatId].state = null;
                userState[chatId].currentOptionId = null;
                return bot.sendMessage(chatId, alertText, alertOptions);
            }

            if (userState[chatId].state === 'waitingForBothFavorites') {
                if (!userState[chatId].awaitingSecondInput) {
                    const percentChange = validateNumberInput(text);
                    if (percentChange === null) {
                        return bot.sendMessage(
                            chatId,
                            'Please enter a valid percent change (e.g., 1.6, 22.3, 0.78).'
                        );
                    }
                    userState[chatId].currentPercentChange = percentChange;
                    userState[chatId].awaitingSecondInput = true;
                    return bot.sendMessage(chatId, 'Enter time frame:');
                } else {
                    const timeFrame = validateNumberInput(text);
                    if (timeFrame === null) {
                        return bot.sendMessage(
                            chatId,
                            'Please enter a valid time frame (e.g., 1, 10, 100).'
                        );
                    }
                    const optionId = userState[chatId].currentOptionId;
                    await updatePercentChange(bot, chatId, optionId, userState[chatId].currentPercentChange);
                    await updateTimeFrame(bot, chatId, optionId, timeFrame);
                    userState[chatId].state = null;
                    userState[chatId].currentOptionId = null;
                    userState[chatId].awaitingSecondInput = false;
                    const { text: editText, options: editOptions } = await getEditOptionDetails(bot, chatId, optionId);
                    return bot.sendMessage(chatId, editText, editOptions);
                }
            }

            if (userState[chatId].state === 'waitingForBothAlerts') {
                if (!userState[chatId].awaitingSecondInput) {
                    const percentChange = validateNumberInput(text);
                    if (percentChange === null) {
                        return bot.sendMessage(
                            chatId,
                            'Please enter a valid percent change (e.g., 1.6, 22.3, 0.78).'
                        );
                    }
                    userState[chatId].currentPercentChange = parseFloat(percentChange.toFixed(2));
                    userState[chatId].awaitingSecondInput = true;
                    return bot.sendMessage(chatId, 'Enter time frame:');
                } else {
                    const timeFrame = validateNumberInput(text);
                    if (timeFrame === null) {
                        return bot.sendMessage(
                            chatId,
                            'Please enter a valid time frame (e.g., 1, 10, 100).'
                        );
                    }
                    userState[chatId].currentTimeFrame = parseFloat(timeFrame.toFixed(2));
                    await saveNotificationSettings(chatId);
                    const { text: alertText, options: alertOptions } = await getAlerts(bot, chatId);
                    userState[chatId].state = null;
                    userState[chatId].currentOptionId = null;
                    userState[chatId].awaitingSecondInput = false;
                    return bot.sendMessage(chatId, alertText, alertOptions);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    bot.on('callback_query', async (query) => {
        const data = query.data;
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const username = query.from.username;

        if (!userState[chatId]) {
            userState[chatId] = {};
        }

        try {
            if (data.startsWith('edit_option_')) {
                const optionId = data.replace('edit_option_', '');
                const { text, options } = await getEditOptionDetails(bot, chatId, optionId);
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options,
                });
            } else if (data.startsWith('change_notification_option_price_')) {
                const optionId = data.replace('change_notification_option_price_', '');
                userState[chatId].state = 'waitingForNotificationPriceFavorites';
                userState[chatId].currentOptionId = optionId;
                return bot.sendMessage(chatId, 'Enter notification option price for notice (to deactivate the setting, enter 0):');
            } else if (data.startsWith('change_notification_change_')) {
                const optionId = data.replace('change_notification_change_', '');
                const newInlineKeyboard = {
                    inline_keyboard: [
                        [
                            { text: 'Change %', callback_data: `change_percent_${optionId}` },
                            { text: 'Time Frame', callback_data: `change_time_frame_${optionId}` },
                            { text: 'Change Both', callback_data: `change_both_${optionId}` }
                        ],
                        [{ text: 'Back', callback_data: `back_to_edit_option_${optionId}` }]
                    ]
                };
                return bot.editMessageReplyMarkup(newInlineKeyboard, {
                    chat_id: chatId,
                    message_id: messageId,
                });
            } else if (data.startsWith('change_percent_')) {
                const optionId = data.replace('change_percent_', '');
                userState[chatId].state = 'waitingForPercentChangeFavorites';
                userState[chatId].currentOptionId = optionId;
                return bot.sendMessage(chatId, 'Enter percent change for notice:');
            } else if (data.startsWith('change_time_frame_')) {
                const optionId = data.replace('change_time_frame_', '');
                userState[chatId].state = 'waitingForTimeFrameFavorites';
                userState[chatId].currentOptionId = optionId;
                return bot.sendMessage(chatId, 'Enter time frame for notice:');
            } else if (data.startsWith('change_both_')) {
                const optionId = data.replace('change_both_', '');
                userState[chatId].state = 'waitingForBothFavorites';
                userState[chatId].currentOptionId = optionId;
                return bot.sendMessage(chatId, 'Enter percent change for notice:');
            } else if (data.startsWith('back_to_edit_option_')) {
                const optionId = data.replace('back_to_edit_option_', '');
                const { text, options } = await getEditOptionDetails(bot, chatId, optionId);
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options,
                });
            } else if (data.startsWith('edit_')) {
                const optionId = data.replace('edit_', '');
                const { text, options } = await getOptionDetails(bot, chatId, optionId);
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options,
                });
            } else if (data.startsWith('remove_option_')) {
                const optionId = data.replace('remove_option_', '');
                await removeOption(bot, chatId, optionId);
                const { text, options } = await getFavorites(bot, chatId);
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options,
                });
            } else if (data.startsWith('remove_notification_settings_')) {
                const optionId = data.replace('remove_notification_settings_', '');
                await resetNotificationSettings(bot, chatId, optionId);
                const { text, options } = await getFavorites(bot, chatId);
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options,
                });
            } else if (data === 'favorites') {
                const { text, options } = await getFavorites(bot, chatId);
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options,
                });
            } else if (data === 'alerts') {
                const { text: alertText, options: alertOptions } = await getAlerts(bot, chatId);
                const alertKeyboard = {
                    inline_keyboard: [
                        [{ text: 'Create Alerts', callback_data: 'create_alerts' }],
                        [{ text: 'Remove Alerts', callback_data: 'remove_alerts' }],
                        [{ text: 'Back', callback_data: 'back_to_main' }],
                    ],
                };
                await bot.editMessageText(alertText, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: JSON.stringify(alertKeyboard),
                });
            } else if (data.startsWith('remove_alert_')) {
                const optionId = data.replace('remove_alert_', '');
                await resetNotificationSettings(bot, chatId, optionId);
                const { text, options } = await getAlerts(bot, chatId);
                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options,
                });
            } else if (data === 'remove_alerts') {
                const user = await User.findOne({ telegramId: String(chatId) });
                const alertTracks = user.tracks.filter(track =>
                    track.notificationPrice !== 0 || track.percentChange !== 0 || track.timeFrame !== 0
                );
                const removeInlineKeyboard = {
                    inline_keyboard: [
                        ...alertTracks.map(track => [
                            {
                                text: `${
                                    userState[chatId].selectedAlerts && userState[chatId].selectedAlerts.includes(track._id) ? '✅' : ''
                                } ${track.asset} ${track.expiryDate}`,
                                callback_data: `remove_alert_${track._id}`,
                            },
                        ]),
                        [{ text: 'Back', callback_data: 'alerts' }],
                    ],
                };
                await bot.editMessageReplyMarkup(removeInlineKeyboard, {
                    chat_id: chatId,
                    message_id: messageId,
                });
            } else if (data === 'create_alerts') {
                const createAlertKeyboard = {
                    inline_keyboard: [
                        [
                            { text: 'BTC', callback_data: 'create_alert_BTC' },
                            { text: 'ETH', callback_data: 'create_alert_ETH' }
                        ],
                        [{ text: 'Back', callback_data: 'alerts' }],
                    ],
                };
                await bot.editMessageText('Select asset for notifications:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: createAlertKeyboard,
                });
            } else if (data.startsWith('create_alert_')) {
                const asset = data.replace('create_alert_', '');
                userState[chatId].selectedAsset = asset;
                const expirationDates = await getExpirationDates(asset);
                userState[chatId].expirationDates = expirationDates;
                userState[chatId].expirationPage = 0;

                const expirationKeyboard = {
                    inline_keyboard: [
                        ...expirationDates.slice(0, 5).map(date => [
                            { text: date, callback_data: `select_expiration_${date}` }
                        ]),
                        expirationDates.length > 5 ? [{ text: '->>', callback_data: 'next_expirations' }] : [],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the date of the expiration:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: expirationKeyboard,
                });
            } else if (data === 'next_expirations') {
                userState[chatId].expirationPage = (userState[chatId].expirationPage || 0) + 1;
                const start = userState[chatId].expirationPage * 5;
                const end = start + 5;
                const expirationDates = userState[chatId].expirationDates.slice(start, end);
                const expirationKeyboard = {
                    inline_keyboard: [
                        ...expirationDates.map(date => [
                            { text: date, callback_data: `select_expiration_${date}` }
                        ]),
                        expirationDates.length === 5 ? [{ text: '->>', callback_data: 'next_expirations' }] : [],
                        start > 0 ? [{ text: '<<-', callback_data: 'prev_expirations' }] : [],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the date of the expiration:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: expirationKeyboard,
                });
            } else if (data === 'prev_expirations') {
                userState[chatId].expirationPage = (userState[chatId].expirationPage || 1) - 1;
                const start = userState[chatId].expirationPage * 5;
                const end = start + 5;
                const expirationDates = userState[chatId].expirationDates.slice(start, end);
                const expirationKeyboard = {
                    inline_keyboard: [
                        ...expirationDates.map(date => [
                            { text: date, callback_data: `select_expiration_${date}` }
                        ]),
                        expirationDates.length === 5 ? [{ text: '->>', callback_data: 'next_expirations' }] : [],
                        start > 0 ? [{ text: '<<-', callback_data: 'prev_expirations' }] : [],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the date of the expiration:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: expirationKeyboard,
                });
            } else if (data.startsWith('select_expiration_')) {
                const expirationDate = data.replace('select_expiration_', '');
                userState[chatId].selectedExpiration = expirationDate;
                const strikePrices = await getStrikePrices(userState[chatId].selectedAsset, expirationDate);
                userState[chatId].strikePrices = strikePrices;
                userState[chatId].strikePage = 0;

                const strikeKeyboard = {
                    inline_keyboard: [
                        ...strikePrices.slice(0, 10).map(price => [
                            { text: price.toString(), callback_data: `select_strike_${price}` }
                        ]),
                        strikePrices.length > 10 ? [{ text: '->>', callback_data: 'next_strikes' }] : [],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the strike price:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: strikeKeyboard,
                });
            } else if (data === 'next_strikes') {
                userState[chatId].strikePage = (userState[chatId].strikePage || 0) + 1;
                const start = userState[chatId].strikePage * 10;
                const end = start + 10;
                const strikePrices = userState[chatId].strikePrices.slice(start, end);
                const strikeKeyboard = {
                    inline_keyboard: [
                        ...strikePrices.map(price => [
                            { text: price.toString(), callback_data: `select_strike_${price}` }
                        ]),
                        strikePrices.length === 10 ? [{ text: '->>', callback_data: 'next_strikes' }] : [],
                        start > 0 ? [{ text: '<<-', callback_data: 'prev_strikes' }] : [],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the strike price:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: strikeKeyboard,
                });
            } else if (data === 'prev_strikes') {
                userState[chatId].strikePage = (userState[chatId].strikePage || 1) - 1;
                const start = userState[chatId].strikePage * 10;
                const end = start + 10;
                const strikePrices = userState[chatId].strikePrices.slice(start, end);
                const strikeKeyboard = {
                    inline_keyboard: [
                        ...strikePrices.map(price => [
                            { text: price.toString(), callback_data: `select_strike_${price}` }
                        ]),
                        strikePrices.length === 10 ? [{ text: '->>', callback_data: 'next_strikes' }] : [],
                        start > 0 ? [{ text: '<<-', callback_data: 'prev_strikes' }] : [],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the strike price:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: strikeKeyboard,
                });
            } else if (data.startsWith('select_strike_')) {
                const strikePrice = data.replace('select_strike_', '');
                userState[chatId].selectedStrike = strikePrice;

                const optionTypeKeyboard = {
                    inline_keyboard: [
                        [
                            { text: 'Call', callback_data: 'select_option_type_call' },
                            { text: 'Put', callback_data: 'select_option_type_put' }
                        ],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select option type:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: optionTypeKeyboard,
                });
            } else if (data.startsWith('select_option_type_')) {
                const optionType = data.replace('select_option_type_', '');
                userState[chatId].selectedOptionType = optionType;

                const notificationTypeKeyboard = {
                    inline_keyboard: [
                        [
                            { text: 'Notification option price', callback_data: 'select_notification_option_price' },
                            { text: 'Notification change %', callback_data: 'select_notification_change' }
                        ],
                        [{ text: 'Both', callback_data: 'select_both_notification' }],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the notification type:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: notificationTypeKeyboard,
                });
            } else if (data === 'select_notification_option_price') {
                userState[chatId].notificationType = 'price';
                userState[chatId].state = 'waitingForNotificationPriceAlerts';
                return bot.sendMessage(chatId, 'Enter notification option price for notice (to deactivate the setting, enter 0):');
            } else if (data === 'select_notification_change') {
                userState[chatId].notificationType = 'percent_change';
                const changeTypeKeyboard = {
                    inline_keyboard: [
                        [
                            { text: 'Change %', callback_data: 'change_percent' },
                            { text: 'Time Frame', callback_data: 'change_time_frame' }
                        ],
                        [{ text: 'Both', callback_data: 'change_both' }],
                        [{ text: 'Back', callback_data: 'create_alerts' }],
                    ],
                };
                await bot.editMessageText('Select the change type:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: changeTypeKeyboard,
                });
            } else if (data === 'change_percent') {
                userState[chatId].state = 'waitingForPercentChangeAlerts';
                return bot.sendMessage(chatId, 'Enter percent change for notice:');
            } else if (data === 'change_time_frame') {
                userState[chatId].state = 'waitingForTimeFrameAlerts';
                return bot.sendMessage(chatId, 'Enter time frame for notice:');
            } else if (data === 'change_both') {
                userState[chatId].state = 'waitingForBothAlerts';
                return bot.sendMessage(chatId, 'Enter percent change for notice:');
            } else if (data === 'select_both_notification') {
                userState[chatId].notificationType = 'both';
                userState[chatId].state = 'waitingForNotificationPriceAlerts';
                return bot.sendMessage(chatId, 'Enter notification option price for notice (to deactivate the setting, enter 0):');
            } else if (data === 'back_to_main') {
                await bot.editMessageText(
                    `Welcome! @${query.from.username}, you've joined Hedgie Bot. This bot helps traders and investors automate market tracking and analysis.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: welcomeOption.reply_markup,
                    }
                );
            } else if (data === "hedge_calculator") {
                await bot.sendMessage(chatId, `This calculator will help you find hedging points for your assets:`, hedgeCalculatorOption);
            } else if (data === "BTC" || data === "ETH") {
                userState[chatId].asset = data;
                userState[chatId].state = 'waitingForPurchasePrice';
                return askPurchasePrice(chatId, data);
            } else if (data === "daily_save" || data === "weekly_save") {
                const optionType = getOptionTypeFromCallbackData(data);
                const suggestions = optionType === 'Daily' ? userState[chatId].dailySuggestions : userState[chatId].weeklySuggestions;

                if (suggestions && !userState[chatId].isSaving) {
                    userState[chatId].isSaving = true;
                    await saveTracks(chatId, suggestions, userState[chatId].asset, parseFloat(userState[chatId].quantity), username, messageId);
                    userState[chatId].isSaving = false;
                } else {
                    await bot.answerCallbackQuery(query.id, { text: 'No options to save.' });
                }
            } else if (data === "all_save") {
                const allSuggestions = [...userState[chatId].dailySuggestions, ...userState[chatId].weeklySuggestions];
                if (allSuggestions.length > 0 && !userState[chatId].isSaving) {
                    userState[chatId].isSaving = true;
                    await saveTracks(chatId, allSuggestions, userState[chatId].asset, parseFloat(userState[chatId].quantity), username, messageId);
                    userState[chatId].isSaving = false;
                } else {
                    await bot.answerCallbackQuery(query.id, { text: 'No options to save.' });
                }
            } else if (data === "specific_save") {
                const allSuggestions = [...userState[chatId].dailySuggestions, ...userState[chatId].weeklySuggestions];
                const uniqueDates = Array.from(new Set(allSuggestions.map(s => s.expiration)));

                const specificOptionPrice = {
                    parse_mode: 'HTML',
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            ...uniqueDates.map(date => [{
                                text: `${userState[chatId].selectedDates.includes(date) ? '✅' : ''} ${date}`,
                                callback_data: `specific_${date}`
                            }]),
                            [{ text: 'Save selected', callback_data: 'save_selected' }],
                            [{ text: 'Back', callback_data: 'back_to_main' }]
                        ]
                    })
                };

                await bot.editMessageReplyMarkup(specificOptionPrice.reply_markup, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else if (data.startsWith("specific_")) {
                const date = data.replace("specific_", "");
                if (!userState[chatId].selectedDates.includes(date)) {
                    userState[chatId].selectedDates.push(date);
                } else {
                    userState[chatId].selectedDates = userState[chatId].selectedDates.filter(d => d !== date);
                }
                const allSuggestions = [...userState[chatId].dailySuggestions, ...userState[chatId].weeklySuggestions];
                const uniqueDates = Array.from(new Set(allSuggestions.map(s => s.expiration)));

                const specificOptionPrice = {
                    parse_mode: 'HTML',
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            ...uniqueDates.map(date => [{
                                text: `${userState[chatId].selectedDates.includes(date) ? '✅' : ''} ${date}`,
                                callback_data: `specific_${date}`
                            }]),
                            [{ text: 'Save selected', callback_data: 'save_selected' }],
                            [{ text: 'Back', callback_data: 'back_to_main' }]
                        ]
                    })
                };

                await bot.editMessageReplyMarkup(specificOptionPrice.reply_markup, { chat_id: chatId, message_id: messageId });
            } else if (data === 'save_selected') {
                const selectedDates = userState[chatId].selectedDates;
                const specificSuggestions = [...userState[chatId].dailySuggestions, ...userState[chatId].weeklySuggestions].filter(s => selectedDates.includes(s.expiration));

                if (specificSuggestions.length > 0 && !userState[chatId].isSaving) {
                    userState[chatId].isSaving = true;
                    await saveTracks(chatId, specificSuggestions, userState[chatId].asset, parseFloat(userState[chatId].quantity), username, messageId);
                    userState[chatId].isSaving = false;
                } else {
                    await bot.answerCallbackQuery(query.id, { text: 'No options to save.' });
                }
            } else {
                console.log('Unhandled callback_query data:', data);
            }
        } catch (error) {
            console.error('Error processing callback_query:', error);
        }
    });
};

async function saveNotificationSettings(chatId) {
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

        userState[chatId].currentNotificationPrice = null;
        userState[chatId].currentPercentChange = null;
        userState[chatId].currentTimeFrame = null;
        userState[chatId].selectedAsset = null;
        userState[chatId].selectedExpiration = null;
        userState[chatId].selectedStrike = null;
        userState[chatId].selectedOptionType = null;
        userState[chatId].notificationType = null;
    } catch (error) {
        console.error('Error saving notification settings:', error);
    }
}

const askPurchasePrice = async (chatId, asset) => {
    await bot.sendMessage(chatId, `You've selected ${asset}. Enter the purchase price:`);
};

const askQuantity = async (chatId) => {
    await bot.sendMessage(chatId, 'Enter the quantity:');
};

const askAllowedLoss = async (chatId) => {
    await bot.sendMessage(chatId, 'Enter the optimal allowed loss (%):');
};

const confirmData = async (chatId, data) => {
    try {
        const purchasePrice = parseFloat(data.purchasePrice);
        const quantity = parseFloat(data.quantity);
        const allowedLoss = parseFloat(data.allowedLoss);

        const suggestions = await getHedgeSuggestions(data.asset, purchasePrice, quantity, allowedLoss);

        const dailyMessage = suggestions.daily.map(s => `Expiration: ${s.expiration} (${s.chosenStrike}), Hedge: ${(s.hedgeCost).toFixed(2)} $`).join('\n');
        const weeklyMessage = suggestions.weekly.map(s => `Expiration: ${s.expiration} (${s.chosenStrike}), Hedge: ${(s.hedgeCost).toFixed(2)} $`).join('\n');

        const message = `Your data has been collected:

Asset: ${data.asset}
Purchase price: ${purchasePrice} $
Quantity: ${quantity} ${data.asset}
Allowed loss (%): ${allowedLoss}%

<b>Hedge suggestions (Daily):</b>
${dailyMessage}

<b>Hedge suggestions (Weekly):</b>
${weeklyMessage}
`;

        await bot.sendMessage(chatId, message, hedgePriceOption);

        userState[chatId].dailySuggestions = suggestions.daily;
        userState[chatId].weeklySuggestions = suggestions.weekly;
        userState[chatId].selectedDates = [];

    } catch (error) {
        console.error('Error getting hedge suggestions:', error);
        await bot.sendMessage(chatId, 'There was an error calculating the hedge suggestions. Please try again later.');
    }
};

const saveTracks = async (chatId, suggestions, asset, quantity, username, messageId) => {
    try {
        const tracks = suggestions.map(suggestion => ({
            optionId: generateUniqueId(),
            asset: asset,
            expiryDate: suggestion.expiration,
            strikePrice: suggestion.chosenStrike,
            optionType: 'Put',
            optionPrice: Math.round((suggestion.hedgeCost / quantity) * 100) / 100,
        }));

        await User.updateOne(
            { telegramId: String(chatId) },
            { $push: { tracks: { $each: tracks } } }
        );

        delete userState[chatId].dailySuggestions;
        delete userState[chatId].weeklySuggestions;
        delete userState[chatId].selectedDates;

        await welcomeMessage(chatId, username, messageId);
    } catch (error) {
        console.error("Error saving tracks:", error);
        await bot.sendMessage(chatId, 'Error saving options. Please try again later.');
    }
};

const generateUniqueId = () => {
    return Math.random().toString(36).substring(2, 15);
};

start();
