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
    const monthly = [];
    let currentDate = moment.tz('Europe/London').startOf('day');

    // Check current time and add the nearest date
    if (moment.tz('Europe/London').hour() >= 9) {
        currentDate = currentDate.add(1, 'days');
    }

    // Add the next three closest dates
    for (let i = 0; i < 3; i++) {
        dates.push(currentDate.clone());
        currentDate = currentDate.add(1, 'days');
    }

    // Reset currentDate for finding future Fridays
    currentDate = moment.tz('Europe/London').startOf('day');
    if (moment.tz('Europe/London').hour() >= 9) {
        currentDate = currentDate.add(1, 'days');
    }

    // Add future Fridays (weekly)
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

    // Add last Friday of each upcoming month (Monthly expiration)
    for (let i = 0; i < 2; i++) { // Adjust number of months to look ahead
        const nextMonth = moment().add(i, 'months').endOf('month');
        const lastFriday = nextMonth.day(-2); // Find last Friday of the month
        monthly.push(lastFriday);
    }

    return { dates, fridays, monthly };
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

const fetchAvailableExpirations = async (asset) => {
    try {
        const response = await axios.get(`https://www.deribit.com/api/v2/public/get_instruments?currency=${asset}&kind=option`);
        const instruments = response.data.result;

        // Extract unique expiration dates from instruments
        const expirations = Array.from(new Set(instruments.map(i => moment.unix(i.expiration_timestamp / 1000).format('DMMMYY').toUpperCase())));

        return expirations;
    } catch (error) {
        console.error(`Error fetching available expirations from Deribit:`, error);
        return [];
    }
};


// Функция для получения предложений по хеджированию
async function getHedgeSuggestions(asset, purchasePrice, quantity, allowedLoss) {
    const strikePrice = allowedLoss > 0
        ? purchasePrice + (purchasePrice * (allowedLoss / 100))
        : purchasePrice - (purchasePrice * (Math.abs(allowedLoss) / 100));

    // Fetch available expiration dates from Deribit
    const availableExpirations = await fetchAvailableExpirations(asset);

    const { dates, fridays } = getNextThreeDatesAndFridays();

    const marketPrice = await fetchMarketPrice(asset);

    const dailySuggestions = [];
    const weeklySuggestions = [];
    const monthlySuggestions = [];

    // Process Daily suggestions
    for (const date of dates) {
        const formattedDate = moment(date).format('DMMMYY').toUpperCase();
        if (!availableExpirations.includes(formattedDate)) continue; // Skip if not in available expirations

        const availableInstruments = await getAvailableInstruments(asset, formattedDate);
        if (availableInstruments.length > 0) {
            const availableStrikes = Array.from(new Set(availableInstruments.map(i => i.strike))).sort((a, b) => a - b);
            const closestStrike = findClosestStrike(strikePrice, availableStrikes);
            const instrumentName = `${asset.toUpperCase()}-${formattedDate}-${closestStrike}-P`;

            if (availableInstruments.some(i => i.instrument_name === instrumentName)) {
                const optionPrice = await fetchOptionPrice(asset, instrumentName);
                const hedgeCost = optionPrice * marketPrice * quantity;
                dailySuggestions.push({
                    expiration: formattedDate,
                    hedgeCost: hedgeCost,
                    chosenStrike: closestStrike
                });
            }
        }
    }

    // Process Weekly suggestions
    for (const friday of fridays) {
        const formattedDate = moment(friday).format('DMMMYY').toUpperCase();
        if (!availableExpirations.includes(formattedDate)) continue; // Skip if not in available expirations

        const availableInstruments = await getAvailableInstruments(asset, formattedDate);
        if (availableInstruments.length > 0) {
            const availableStrikes = Array.from(new Set(availableInstruments.map(i => i.strike))).sort((a, b) => a - b);
            const closestStrike = findClosestStrike(strikePrice, availableStrikes);
            const instrumentName = `${asset.toUpperCase()}-${formattedDate}-${closestStrike}-P`;

            if (availableInstruments.some(i => i.instrument_name === instrumentName)) {
                const optionPrice = await fetchOptionPrice(asset, instrumentName);
                const hedgeCost = optionPrice * marketPrice * quantity;
                weeklySuggestions.push({
                    expiration: formattedDate,
                    hedgeCost: hedgeCost,
                    chosenStrike: closestStrike
                });
            }
        }
    }

    // Process first 3 Monthly suggestions (dates that are not in Daily or Weekly)
    const dailyAndWeeklyExpirations = [...dailySuggestions, ...weeklySuggestions].map(s => s.expiration);
    const monthlyExpirations = availableExpirations
        .filter(exp => !dailyAndWeeklyExpirations.includes(exp))
        .slice(0, 3); // Take only the first 3 available monthly expirations

    for (const monthlyExpiration of monthlyExpirations) {
        const availableInstruments = await getAvailableInstruments(asset, monthlyExpiration);

        if (availableInstruments.length > 0) {
            const availableStrikes = Array.from(new Set(availableInstruments.map(i => i.strike))).sort((a, b) => a - b);
            const closestStrike = findClosestStrike(strikePrice, availableStrikes);
            const instrumentName = `${asset.toUpperCase()}-${monthlyExpiration}-${closestStrike}-P`;

            if (availableInstruments.some(i => i.instrument_name === instrumentName)) {
                const optionPrice = await fetchOptionPrice(asset, instrumentName);
                const hedgeCost = optionPrice * marketPrice * quantity;
                monthlySuggestions.push({
                    expiration: monthlyExpiration,
                    hedgeCost: hedgeCost,
                    chosenStrike: closestStrike
                });
            }
        }
    }

    return { daily: dailySuggestions, weekly: weeklySuggestions, monthly: monthlySuggestions };
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
