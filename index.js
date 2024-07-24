const TelegramBot = require("node-telegram-bot-api");
require('dotenv').config();
const mongoose = require('mongoose');
const { welcomeOption, hedgeCalculatorOption, hedgePriceOption } = require('./options');
const { getHedgeSuggestions } = require('./deribitApi');
const User = require('./models/User'); // Импортируйте вашу модель User
const token = process.env.TELEGRAM_TOKEN;
const connectDB = require('./db'); // Подключение к базе данных

const bot = new TelegramBot(token, { polling: true });
connectDB();

bot.setMyCommands([
    { command: '/start', description: 'Launch Hedgie Bot' }
]);

const userState = {}; // Переместим userState в глобальную область видимости

const welcomeMessage = async (chatId, username) => {
    await bot.sendMessage(chatId, `Welcome! @${username}, you've joined Hedgie Bot. This bot helps traders and investors automate market tracking and analysis.`, welcomeOption);
};

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

        // Сохранение данных
        userState[chatId].dailySuggestions = suggestions.daily;
        userState[chatId].weeklySuggestions = suggestions.weekly;
        userState[chatId].selectedDates = []; // Для хранения выбранных дат

    } catch (error) {
        console.error('Error getting hedge suggestions:', error);
        await bot.sendMessage(chatId, 'There was an error calculating the hedge suggestions. Please try again later.');
    }
};

const saveTracks = async (chatId, suggestions, asset, quantity) => {
    try {
        const tracks = suggestions.map(suggestion => ({
            optionId: generateUniqueId(),
            asset: asset,
            expiryDate: suggestion.expiration, // Сохраняем строку даты без изменений
            strikePrice: suggestion.chosenStrike,
            optionType: 'Put', // Устанавливаем 'Put'
            optionPrice: Math.round((suggestion.hedgeCost / quantity) * 100) / 100, // Делим на количество
        }));

        await User.updateOne(
            { telegramId: String(chatId) },
            { $push: { tracks: { $each: tracks } } }
        );

        await bot.sendMessage(chatId, 'Options saved successfully.');

        // Удаление состояния после сохранения
        delete userState[chatId].dailySuggestions;
        delete userState[chatId].weeklySuggestions;
        delete userState[chatId].selectedDates;
    } catch (error) {
        console.error("Error saving tracks:", error);
        await bot.sendMessage(chatId, 'Error saving options. Please try again later.');
    }
};

const getFavorites = async (chatId) => {
    try {
        const user = await User.findOne({ telegramId: String(chatId) });
        if (!user || !user.tracks || user.tracks.length === 0) {
            return "You have no favorite options tracked.";
        }
        return user.tracks.map(track =>
            `Asset: ${track.asset}\nExpiry Date: ${track.expiryDate}\nStrike Price: ${track.strikePrice}\nOption Type: ${track.optionType}\nOption Price: ${track.optionPrice} $`
        ).join('\n\n');
    } catch (error) {
        console.error("Error fetching favorites:", error);
        return "There was an error fetching your favorite options. Please try again later.";
    }
};

const start = () => {
    bot.on('message', async (msg) => {
        const text = msg.text;
        const chatId = msg.chat.id;
        const username = msg.chat.username;

        if (!userState[chatId]) {
            userState[chatId] = {};
        }

        try {
            if (text.startsWith("/start")) {
                const referrerChatId = text.split(' ')[1]; // Получаем referrerChatId из команды

                userState[chatId].state = null;

                // Сохранение пользователя в базе данных при отправке команды /start
                const newUser = await User.findOneAndUpdate(
                    { telegramId: String(chatId) },
                    { telegramId: String(chatId), username: username, referralCode: generateReferralCode(), referrerChatId: referrerChatId || null },
                    { upsert: true, new: true }
                );

                // Если указан referrerChatId, обновляем информацию о рефералах
                if (referrerChatId) {
                    await User.findOneAndUpdate(
                        { telegramId: referrerChatId },
                        { $push: { referrals: newUser._id } }
                    );
                }

                return welcomeMessage(chatId, username);
            }

            if (userState[chatId].state === 'waitingForPurchasePrice') {
                userState[chatId].purchasePrice = text;
                userState[chatId].state = 'waitingForQuantity';
                return askQuantity(chatId);
            }

            if (userState[chatId].state === 'waitingForQuantity') {
                userState[chatId].quantity = text;
                userState[chatId].state = 'waitingForAllowedLoss';
                return askAllowedLoss(chatId);
            }

            if (userState[chatId].state === 'waitingForAllowedLoss') {
                userState[chatId].allowedLoss = text;
                userState[chatId].state = null;
                return confirmData(chatId, userState[chatId]);
            }

        } catch (error) {
            console.error("Error processing message:", error);
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
            if (data === "hedge_calculator") {
                await bot.sendMessage(chatId, `This calculator will help you find hedging points for your assets:`, hedgeCalculatorOption);
            } else if (data === "/start") {
                userState[chatId].state = null;
                await welcomeMessage(chatId, query.from.username);
            } else if (data === "BTC" || data === "ETH") {
                userState[chatId].asset = data;
                userState[chatId].state = 'waitingForPurchasePrice';
                return askPurchasePrice(chatId, data);
            } else if (data === "daily_save" || data === "weekly_save") {
                const optionType = getOptionTypeFromCallbackData(data);
                const suggestions = optionType === 'Daily' ? userState[chatId].dailySuggestions : userState[chatId].weeklySuggestions;

                if (suggestions && !userState[chatId].isSaving) {
                    userState[chatId].isSaving = true; // Устанавливаем флаг сохранения
                    await saveTracks(chatId, suggestions, userState[chatId].asset, parseFloat(userState[chatId].quantity));
                    userState[chatId].isSaving = false; // Сбрасываем флаг после сохранения
                } else {
                    await bot.answerCallbackQuery(query.id, { text: 'No options to save.' });
                }
            } else if (data === "all_save") {
                const allSuggestions = [...userState[chatId].dailySuggestions, ...userState[chatId].weeklySuggestions];
                if (allSuggestions.length > 0 && !userState[chatId].isSaving) {
                    userState[chatId].isSaving = true; // Устанавливаем флаг сохранения
                    await saveTracks(chatId, allSuggestions, userState[chatId].asset, parseFloat(userState[chatId].quantity));
                    userState[chatId].isSaving = false; // Сбрасываем флаг после сохранения
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
                            ...uniqueDates.map(date => [{ text: date, callback_data: `specific_${date}` }]),
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
                    userState[chatId].isSaving = true; // Устанавливаем флаг сохранения
                    await saveTracks(chatId, specificSuggestions, userState[chatId].asset, parseFloat(userState[chatId].quantity));
                    userState[chatId].isSaving = false; // Сбрасываем флаг после сохранения

                    // Возвращаемся к стартовому сообщению
                    await bot.editMessageText(`Welcome! @${query.from.username}, you've joined Hedgie Bot. This bot helps traders and investors automate market tracking and analysis.`, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: welcomeOption.reply_markup
                    });
                } else {
                    await bot.answerCallbackQuery(query.id, { text: 'No options to save.' });
                }
            } else if (data === 'back_to_main') {
                await bot.editMessageText(`Welcome! @${query.from.username}, you've joined Hedgie Bot. This bot helps traders and investors automate market tracking and analysis.`, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML',
                    reply_markup: welcomeOption.reply_markup
                });
            } else if (data === 'favorites') {
                const favoritesMessage = await getFavorites(chatId);
                const favoritesOptions = {
                    parse_mode: 'HTML',
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: 'Back', callback_data: 'back_to_main' }]
                        ]
                    })
                };

                await bot.editMessageText(favoritesMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...favoritesOptions
                });
            } else {
                console.log("Unhandled callback_query data:", data);
            }
        } catch (error) {
            console.error("Error processing callback_query:", error);
        }
    });
};

const generateReferralCode = () => {
    return Math.random().toString(36).substr(2, 9);
};

const getOptionTypeFromCallbackData = (data) => {
    switch (data) {
        case 'daily_save':
            return 'Daily';
        case 'weekly_save':
            return 'Weekly';
        case 'specific_save':
            return 'Specific';
        default:
            return '';
    }
};

const generateUniqueId = () => {
    return Math.random().toString(36).substring(2, 15);
};

start();
