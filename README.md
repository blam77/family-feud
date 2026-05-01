# Family Feud

A browser-based Family Feud game built for virtual (Zoom) team events. No server required — runs entirely in the browser using localStorage and the BroadcastChannel API to sync between two tabs.

## Setup

1. Serve the files from a local server (required for ES modules):
   ```
   npx serve .
   # or
   python3 -m http.server
   ```
2. Open **`host.html`** in one tab/window — this is the host control panel.
3. Open **`board.html`** in a second tab/window — this is the display screen to share with participants.
4. The two tabs connect automatically. A sync pill in the corner shows connection status.

> **Zoom tip:** Share the `board.html` tab (not the whole screen) so participants see only the game board. The host controls stay private.

## How to play

### Setup
- Choose number of teams (2–4) and enter team names.
- Click **Start Game** — the win fanfare plays and the first face-off begins.

### Normal rounds

**Face-off**
- The FACE-OFF banner fades after 5 seconds, revealing the question and answer board.
- On the host panel, reveal up to 2 answers to determine the winner.
- Click **"[Team] won"** to assign control — the question appears on the board for all to see.

**Playing**
- Click **Reveal** next to each answer as teams guess correctly. A ding plays on reveal.
- Click **Strike** (or press `X`) for wrong answers — the red X flashes on screen and a buzzer plays.
- At 3 strikes the game enters **Steal** mode.

**Steal**
- The other team gets one guess.
- **Steal CORRECT** → that team wins the pot.
- **Steal FAILED** → a buzzer + X flash plays, then the controlling team keeps the pot.

**Round end**
- **End Round** → awards points to the controlling team and shows the round end screen.
- From there: **Next Round**, **Fast Money**, or **End Game → show final scores**.

### Fast Money (bonus round)
Played after the main game for a secondary prize.

**Format:**
1. Host reads all 5 questions out loud.
2. Teams break out to discuss for 2 minutes.
3. Everyone returns. One designated rep per team submits answers.
4. Host types each team's submitted answer, selects the matching answer on the board for point value (or **No Match** for 0 pts).
5. Click **Reveal Answer** to flip the answer on the board, then **Reveal Points** to show the score.
6. Team with the highest total across all 5 questions wins.
7. Click **End Game → Show Winner** to display final results.

## Customising questions

Edit `data/questions.json` to change the main game questions:

```json
[
  {
    "question": "Name something people do when bored in a meeting",
    "answers": [
      { "text": "Scroll their phone", "points": 38 },
      { "text": "Daydream", "points": 27 }
    ]
  }
]
```

Edit `data/fast-money.json` for the Fast Money round. Same format, always 5 questions.

- Answers are ranked by points (highest = most popular).
- Odd numbers of answers are fine — the board adds an empty slot for symmetry.

## Sound effects

| File | Plays when |
|------|-----------|
| `family-feud-correct.mp3` | An answer is revealed (normal game only) |
| `family-feud-incorrect.mp3` | Strike button is pressed, or steal fails |
| `family-feud-win.mp3` | Game starts, final scores appear, fast money results appear |

Sounds play from the host tab. To replace them, drop in new `.mp3` files with the same names.

## File structure

```
├── host.html          # Host control panel
├── board.html         # Display board (share this on Zoom)
├── css/
│   └── styles.css
├── js/
│   ├── host.js        # All game logic and host UI
│   ├── board.js       # Board rendering and animations
│   ├── state.js       # Shared state (localStorage + BroadcastChannel)
│   └── rotation.js    # Team rotation / face-off scheduling
├── data/
│   ├── questions.json      # Main game questions
│   └── fast-money.json     # Fast money questions
└── *.mp3              # Sound effects
```
