# Slot command specification from supplied video

The video shows a Fruit Bonanza slot-machine UI in a WhatsApp-like message. It has a gold/brown machine frame, a `FRUIT BONANZA` title, a `JACKPOT - 10,000 CREDITS` banner, and three dashboard values: `CREDITS`, `BET`, and `BEST WIN`. The visible example starts at 560 credits, bet 10, and best win 60.

The reels form a 3-row by 5-column grid. Visible symbols include cherries, lemons, diamonds, red 7s, golden bells, and BAR symbols. The spin animation is vertical, blurred, and continuous, with reels stopping sequentially from left to right. The interface has `BET +` and `SPIN` controls. The visible winning example changes the status to `WIN +100`, credits from 560 to 660, and best win from 60 to 100.

The video does not clearly prove the exact paytable, bet increment, or loss message. Those parts should be implemented with sensible defaults and documented. The pasted code is a browser-style rich HTML slot-machine payload using a GenAI unified-response wrapper; it is not directly executable as a normal Baileys `sendMessage` payload. The command should therefore use a WhatsApp-compatible interactive-message/button wrapper while preserving the visible game behavior.
