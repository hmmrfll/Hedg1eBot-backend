module.exports = {
    welcomeOption: {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{text: `💼 Hedge Calculator`, callback_data: "hedge_calculator"}],
                [{text: `⭐️ Favorites`, callback_data: "favorites"},
                    {text: `🔔 Alerts`, callback_data: "alerts"}],
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
                [{text: `< Back`, callback_data: "back_to_main"}]
            ]
        })
    },
    hedgePriceOption: {
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    {text: `🗓 Daily`, callback_data: "daily_save"},
                    {text: `📮 Weekly`, callback_data: "weekly_save"},
                    {text: `📆 Monthly`, callback_data: "monthly_save"} // Add Monthly button
                ],
                [
                    {text: `🎰 ALL`, callback_data: "all_save"},
                    {text: `🧩 Specific`, callback_data: "specific_save"}
                ],
                [{text: `< Back`, callback_data: "back_to_main"}]
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