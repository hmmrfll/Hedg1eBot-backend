const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const mongoose = require('mongoose');
const { welcomeOption } = require('../customMessageOption/options');
const User = require('../models/User');
const token = process.env.TELEGRAM_TOKEN;
const connectDB = require('../config/db');

const bot = new TelegramBot(token, { polling: true });
connectDB();

bot.setMyCommands([{ command: '/start', description: 'Launch Hedgie Bot' }]);

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
} = require('../components/favorites');
const {
    welcomeMessage,
    validateNumberInput,
    generateReferralCode,
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

            // Обработка ввода новой цены уведомления
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

            // Обработка ввода нового процента изменения
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

            // Обработка ввода нового таймфрейма
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

            // Обработка ввода обоих параметров
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

start();
