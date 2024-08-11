const axios = require('axios');
const moment = require('moment-timezone');


/**
 * Рассчитывает минимальную цену страйка без округления.
 * @param {number} purchasePrice - Цена закупки актива.
 * @param {number} allowedLoss - Процент допустимой потери.
 * @returns {number} - Рассчитанная минимальная цена страйка.
 */
const calculateStrikePrice = (purchasePrice, allowedLoss) => {
    return purchasePrice * (1 - allowedLoss / 100);
};

// Функция для получения текущей рыночной цены актива
async function fetchMarketPrice(asset) {
    try {
        const response = await axios.get(
            `https://www.deribit.com/api/v2/public/ticker`,
            {
                params: { instrument_name: `${asset.toUpperCase()}-PERPETUAL` },
            }
        );

        if (
            response.data &&
            response.data.result &&
            response.data.result.last_price !== undefined
        ) {
            return response.data.result.last_price;
        } else {
            throw new Error('No market price available.');
        }
    } catch (error) {
        console.error('Error fetching market price:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Функция для получения списка доступных инструментов
async function getAvailableInstruments(asset, date) {
    try {
        const response = await axios.get(
            `https://www.deribit.com/api/v2/public/get_instruments`,
            {
                params: { currency: asset, kind: 'option', expired: false },
            }
        );

        if (response.data && response.data.result) {
            // Фильтруем инструменты по дате истечения
            return response.data.result.filter(instrument =>
                moment(instrument.expiration_timestamp).format('DMMMYY').toUpperCase() === date
            );
        } else {
            throw new Error('No instruments available.');
        }
    } catch (error) {
        console.error('Error fetching available instruments:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Функция для получения цены опциона с Deribit
async function fetchOptionPrice(asset, instrumentName) {
    try {
        const response = await axios.get(
            `https://www.deribit.com/api/v2/public/ticker`,
            {
                params: { instrument_name: instrumentName },
            }
        );

        if (
            response.data &&
            response.data.result &&
            response.data.result.best_ask_price !== undefined
        ) {
            return response.data.result.best_ask_price;
        } else {
            return 0;
        }
    } catch (error) {
        console.error('Error fetching option price:', error.response ? error.response.data : error.message);
        return 0;
    }
}

// Функция для получения ближайших 3 дат и всех будущих пятниц с учетом временной зоны Лондона
function getNextThreeDatesAndFridays() {
    const dates = [];
    const fridays = [];
    let currentDate = moment.tz('Europe/London').startOf('day');

    // Проверка текущего времени и добавление ближайшей даты
    if (moment.tz('Europe/London').hour() >= 9) {
        currentDate = currentDate.add(1, 'days');
    }

    // Добавление трех ближайших дат
    for (let i = 0; i < 3; i++) {
        dates.push(currentDate.clone());
        currentDate = currentDate.add(1, 'days');
    }

    // Перезапуск currentDate для поиска будущих пятниц
    currentDate = moment.tz('Europe/London').startOf('day');
    if (moment.tz('Europe/London').hour() >= 9) {
        currentDate = currentDate.add(1, 'days');
    }

    // Добавление будущих пятниц
    let fridayCount = 0;
    while (fridayCount < 4) {
        if (currentDate.day() === 5) {
            const isInNextThreeDays = dates.some(date => date.isSame(currentDate, 'day'));
            if (!isInNextThreeDays) {
                fridays.push(currentDate.clone());
                fridayCount++;
            }
        }
        currentDate = currentDate.add(1, 'days');
    }

    return { dates, fridays };
}

// Функция для нахождения ближайшего доступного страйка для конкретной даты
function findClosestStrike(strikePrice, availableStrikes) {
    let closestStrike = availableStrikes[0];
    let minDifference = Math.abs(closestStrike - strikePrice);

    for (const strike of availableStrikes) {
        const difference = Math.abs(strike - strikePrice);
        if (difference < minDifference) {
            closestStrike = strike;
            minDifference = difference;
        }
    }

    return closestStrike;
}

// Функция для получения предложений по хеджированию
async function getHedgeSuggestions(asset, purchasePrice, quantity, allowedLoss) {
    console.log(`Data for hedge calculation:\nAsset: ${asset}\nPurchase Price: ${purchasePrice}\nQuantity: ${quantity}\nAllowed Loss: ${allowedLoss}`);

    const strikePrice = calculateStrikePrice(purchasePrice, allowedLoss);
    console.log(`Calculated strike price: ${strikePrice}`);

    const { dates, fridays } = getNextThreeDatesAndFridays();

    // Получение текущей рыночной цены актива
    const marketPrice = await fetchMarketPrice(asset);

    const dailySuggestions = [];
    const weeklySuggestions = [];

    // Обрабатываем каждую дату
    for (const date of dates) {
        try {
            const formattedDate = moment(date).format('DMMMYY').toUpperCase();
            const availableInstruments = await getAvailableInstruments(asset, formattedDate);

            // Получаем доступные страйки для текущей даты
            const availableStrikes = Array.from(new Set(availableInstruments.map(i => i.strike))).sort((a, b) => a - b);

            if (availableStrikes.length === 0) {
                console.log(`No available strikes for date ${formattedDate}`);
                continue;
            }

            // Находим ближайший страйк
            const closestStrike = findClosestStrike(strikePrice, availableStrikes);
            console.log(`Date: ${formattedDate} | Chosen closest strike: ${closestStrike} for calculated strike price: ${strikePrice}`);
            const instrumentName = `${asset.toUpperCase()}-${formattedDate}-${closestStrike}-P`;

            // Проверяем наличие инструмента
            if (availableInstruments.some(i => i.instrument_name === instrumentName)) {
                const optionPrice = await fetchOptionPrice(asset, instrumentName);
                const hedgeCost = optionPrice * marketPrice * quantity;
                dailySuggestions.push({
                    expiration: formattedDate,
                    hedgeCost: hedgeCost,
                    chosenStrike: closestStrike
                });
            } else {
                console.log(`Instrument not found: ${instrumentName}`);
            }
        } catch (error) {
            console.error(`Error fetching option price for date ${date.format('DMMMYY').toUpperCase()}:`, error);
        }
    }

    // Обрабатываем каждую пятницу
    for (const friday of fridays) {
        try {
            const formattedDate = moment(friday).format('DMMMYY').toUpperCase();
            const availableInstruments = await getAvailableInstruments(asset, formattedDate);

            // Получаем доступные страйки для текущей пятницы
            const availableStrikes = Array.from(new Set(availableInstruments.map(i => i.strike))).sort((a, b) => a - b);

            if (availableStrikes.length === 0) {
                console.log(`No available strikes for date ${formattedDate}`);
                continue;
            }

            // Находим ближайший страйк
            const closestStrike = findClosestStrike(strikePrice, availableStrikes);
            console.log(`Date: ${formattedDate} | Chosen closest strike: ${closestStrike} for calculated strike price: ${strikePrice}`);
            const instrumentName = `${asset.toUpperCase()}-${formattedDate}-${closestStrike}-P`;

            // Проверяем наличие инструмента
            if (availableInstruments.some(i => i.instrument_name === instrumentName)) {
                const optionPrice = await fetchOptionPrice(asset, instrumentName);
                const hedgeCost = optionPrice * marketPrice * quantity;
                weeklySuggestions.push({
                    expiration: formattedDate,
                    hedgeCost: hedgeCost,
                    chosenStrike: closestStrike
                });
            } else {
                console.log(`Instrument not found: ${instrumentName}`);
            }
        } catch (error) {
            console.error(`Error fetching option price for date ${friday.format('DMMMYY').toUpperCase()}:`, error);
        }
    }

    return { daily: dailySuggestions, weekly: weeklySuggestions };
}


// Функция для получения списка дат истечения
async function getExpirationDates(asset) {
    try {
        const response = await axios.get(
            `https://www.deribit.com/api/v2/public/get_instruments`,
            {
                params: { currency: asset, kind: 'option', expired: false },
            }
        );

        if (response.data && response.data.result) {
            const expirationDates = Array.from(new Set(response.data.result.map(instrument =>
                moment(instrument.expiration_timestamp).format('DMMMYY').toUpperCase()
            )));
            return expirationDates;
        } else {
            throw new Error('No expiration dates available.');
        }
    } catch (error) {
        console.error('Error fetching expiration dates:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Функция для получения цен страйков
async function getStrikePrices(asset, expirationDate) {
    try {
        const response = await axios.get(
            `https://www.deribit.com/api/v2/public/get_instruments`,
            {
                params: { currency: asset, kind: 'option', expired: false },
            }
        );

        if (response.data && response.data.result) {
            // Фильтруем инструменты по дате истечения
            const strikePrices = Array.from(new Set(response.data.result
                .filter(instrument => moment(instrument.expiration_timestamp).format('DMMMYY').toUpperCase() === expirationDate)
                .map(instrument => instrument.strike)
            ));
            return strikePrices;
        } else {
            throw new Error('No strike prices available.');
        }
    } catch (error) {
        console.error('Error fetching strike prices:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Функция для получения цены опциона с Deribit

// Функция для получения цены опциона в USD
async function fetchOptionPriceInUSD(asset, instrumentName, optionType) {
    const optionPrice = await fetchOptionPrice(asset, instrumentName);
    const marketPrice = await fetchMarketPrice(asset);
    const optionPriceInUSD = optionPrice * marketPrice;
    return optionPriceInUSD;
}

// Экспортируем функции
module.exports = {
    fetchMarketPrice,
    getExpirationDates,
    getStrikePrices,
    fetchOptionPrice,
    fetchOptionPriceInUSD,
    calculateStrikePrice,
    getHedgeSuggestions
};
