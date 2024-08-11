module.exports = {
    welcomeOption: {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{text: `Hedge Calculator`, callback_data: "hedge_calculator"}],
                [{text: `Favorites`, callback_data: "favorites"},
                    {text: `Alerts`, callback_data: "alerts"}],
            ]
        })
    },
    hedgeCalculatorOption: {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    {text: `BTC`, callback_data: "BTC"},
                    {text: `ETH`, callback_data: "ETH"}
                ],
                [{text: `Back`, callback_data: "/start"}]
            ]
        })
    },
    hedgePriceOption: {
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    {text: `Daily`, callback_data: "daily_save"},
                    {text: `Weekly`, callback_data: "weekly_save"}
                ],
                [
                    {text: `ALL`, callback_data: "all_save"},
                    {text: `Specific`, callback_data: "specific_save"}
                ],
                [{text: `Back`, callback_data: "/start"}]
            ]
        })
    },
    SpecificOptionPrice: {
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({
            inline_keyboard: [

            ]
        })
    }
}