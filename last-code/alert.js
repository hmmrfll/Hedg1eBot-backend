const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const mongoose = require('mongoose');
const { welcomeOption } = require('../customMessageOption/options');
const User = require('../models/User');
const token = process.env.TELEGRAM_TOKEN;
const connectDB = require('../config/db');
const { getExpirationDates, getStrikePrices, fetchOptionPrice, fetchMarketPrice } = require('../service/deribitApi');

const bot = new TelegramBot(token, { polling: true });
connectDB();

bot.setMyCommands([{ command: '/start', description: 'Launch Hedgie Bot' }]);

const userState = {};

const { getAlerts } = require('../components/alerts');
const {
    welcomeMessage,
    generateReferralCode,
    validateNumberInput,
} = require('../customMessageOption/utils');

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

            // Обработка ввода новой цены уведомления для Alerts
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

            // Обработка ввода нового процента изменения для Alerts
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

            // Обработка ввода нового таймфрейма для Alerts
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

            // Обработка ввода обоих параметров для Alerts
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

        if (!userState[chatId]) {
            userState[chatId] = {};
        }

        try {
            if (data === 'alerts') {
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

        // Получаем цену опциона в BTC или ETH
        const optionPriceBTC = await fetchOptionPrice(selectedAsset, `${selectedAsset}-${selectedExpiration}-${selectedStrike}-${selectedOptionType[0].toUpperCase()}`);

        // Получаем текущую рыночную цену BTC или ETH в USD
        const marketPriceUSD = await fetchMarketPrice(selectedAsset);

        // Конвертируем цену опциона в USD
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

        // Reset the notification settings after saving
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

start();
