# ENQOPAZYON Ichimoku Gold Bot

This is an advanced Ichimoku Equilibrium trading dashboard optimized for Gold (XAU/USD). The strategy is based on mathematical indexing of the five Ichimoku lines to identify market equilibrium and wave targets.

## Features

- **Equilibrium Indexing**: Assigns a percentage weight (20% each) to all five Ichimoku lines (Tenkan, Kijun, Span A, Span B, Chikou) to form a Master Index.
- **Wave Theory Calculations**: Implements Hosoda's V, N, and E wave calculations to predict price reversal points.
- **P/Y Wave Metrics**: Automatically measures market "Squeeze" (P-Wave) and "Expansion" (Y-Wave) to avoid bad entries during high volatility.
- **52-Candle Focus**: Concentrates on the core equilibrium window as defined by Senkou Span B (52 bars).
- **Timeframe Switching**: Supports 30-Minute and 4-Hour analysis.
- **Bento Grid Layout**: A polished, modern technical dashboard interface.

## Strategy Logic

1. **Convergence**: Look for the "P-Wave" (Index < 1) where all five lines converge.
2. **Expansion**: Wait for the Master Index to exceed 80% (Price trending away from equilibrium).
3. **Reversal**: Exit or hedge when price hits one of the N, V, or E calculation targets.

## Tech Stack

- **React 19** with **Vite**
- **Tailwind CSS 4** (Bento Design Theme)
- **Recharts** for technical charting
- **Motion** for smooth UI feedback
- **Lucide React** for technical iconography

## Running the App

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Build for production: `npm run build`

---
*Disclaimer: This tool is for educational and simulation purposes only. Trading gold carries significant risk.*
