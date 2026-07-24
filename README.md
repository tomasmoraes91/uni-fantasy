# UniFantasy 🏆

A university sports fantasy league MVP — fantasy team building + match predictions across **futsal, basketball, and volleyball**, all powered by React + Firebase.

## ✨ Features

- 🔐 Email/password auth via Firebase Auth
- ⚽ 🏀 🏐 Three sports, four teams each
- 👥 Build a 5-player fantasy team per sport (max 2 from the same team)
- 👑 Captain feature — captain earns 2× points
- 🔮 Match predictions (winner +2 pts, exact score +4 pts)
- 📊 Auto-calculated rankings — overall and per sport
- 🛡 Admin role for entering match results & player stats
- 📱 Mobile-friendly responsive UI

## 🧰 Tech Stack

| Layer    | Choice                     |
|----------|----------------------------|
| Frontend | React 18 + Vite            |
| Routing  | React Router v6            |
| Backend  | Firebase (Auth + Firestore)|
| Hosting  | Vercel                     |

No traditional backend — all logic runs client-side against Firestore.

---

## 🚀 Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com), create a new project.
2. **Authentication** → Get started → enable **Email/Password**.
3. **Firestore Database** → Create database → start in production mode → pick a region.
4. **Project settings** → **Your apps** → Web (`</>`) → register an app and copy the config.

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your Firebase credentials:

```bash
cp .env.example .env
```

```ini
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 4. Apply Firestore security rules

In the Firebase console → **Firestore** → **Rules**, paste the contents of `firestore.rules` and publish.

### 5. Run locally

```bash
npm run dev
```

Open <http://localhost:5173>.

### 6. Seed initial data

The first time you run the app, the database is empty. Seed it once:

1. Register a user, then log in.
2. Open the browser DevTools console.
3. Paste:
   ```js
   import('/src/utils/seed.js').then(m => m.seed());
   ```
4. You should see `✅ Seed complete: 12 teams, 48 players, 7 matches.`

> **Note:** seeding writes to `teams`, `players`, and `matches`. Because security rules restrict writes to admins, **temporarily** loosen the rules during seed:
> ```
> match /teams/{id}    { allow write: if request.auth != null; }
> match /players/{id}  { allow write: if request.auth != null; }
> match /matches/{id}  { allow write: if request.auth != null; }
> ```
> Restore the original rules after seeding.

### 7. Promote yourself to admin

Find your user document in Firestore → `users/{your-uid}` → change `role` from `"user"` to `"admin"`. Refresh the app — the **Admin** link appears in the nav and you can enter match results.

---

## 🗄 Firestore schema

```
users/{uid}
  uid          string
  email        string
  displayName  string
  role         'user' | 'admin'
  createdAt    number (ms)

teams/{teamId}
  id           string
  name         string
  sport        'futsal' | 'basketball' | 'volleyball'

players/{playerId}
  id           string
  name         string
  teamId       string  → teams/{teamId}
  sport        same as team
  position     string  (e.g. 'GK', 'PG', 'SET')

matches/{matchId}
  id            string
  sport         string
  homeTeamId    string
  awayTeamId    string
  homeTeamName  string  (denormalized for display)
  awayTeamName  string
  date          number (ms)
  status        'scheduled' | 'finished'
  homeScore?    number
  awayScore?    number
  playerStats?  Array<{ playerId, teamId, goals, assists, yellow, red }>
  finishedAt?   number

predictions/{uid_matchId}
  uid          string
  matchId      string  → matches/{matchId}
  homeScore    number
  awayScore    number
  submittedAt  number

user_teams/{uid_sport}
  uid          string
  sport        string
  playerIds    string[]   // exactly 5
  captainId    string|null
  updatedAt    number

scores/{uid}
  uid          string
  displayName  string
  total        number
  bySport      { futsal, basketball, volleyball }  // numbers
  updatedAt    number
```

### Document IDs are deterministic where it matters

- `predictions/{uid}_{matchId}` — one prediction per user per match
- `user_teams/{uid}_{sport}` — one team per user per sport
- `scores/{uid}` — one score doc per user

This avoids accidental duplicates and lets `setDoc` act as upsert.

---

## 🧮 Scoring rules

### Fantasy (per player)

| Event       | Points |
|-------------|--------|
| Goal        | +5     |
| Assist      | +3     |
| Team win    | +2     |
| Yellow card | -1     |
| Red card    | -3     |

If the player is your **captain**, points are doubled.

### Predictions (per match)

| Outcome                          | Points |
|----------------------------------|--------|
| Correct winner / draw            | +2     |
| Exact score                      | +4     |

The exact-score reward replaces (not stacks with) the +2.

All rules live in `src/utils/scoring.js` — change the constants there.

---

## 🔄 How rankings update

When an admin saves a match result via the Admin page, the app calls `recomputeAllScores()` which:

1. Reads every user, every finished match, every saved fantasy team, and every prediction.
2. Sums fantasy + prediction points per sport for each user.
3. Writes one document per user to `scores/{uid}`.

For a small MVP league (dozens of users) this client-side recompute is perfectly fine. If the league grows, move this into a Cloud Function triggered by `onUpdate` of `matches`.

---

## 📁 Project structure

```
uni-fantasy/
├── public/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx
│   │   └── SportTabs.jsx
│   ├── context/
│   │   └── AuthContext.jsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── FantasyTeam.jsx
│   │   ├── Matches.jsx
│   │   ├── Rankings.jsx
│   │   └── Admin.jsx
│   ├── services/
│   │   ├── firebase.js
│   │   ├── auth.js
│   │   └── firestore.js
│   ├── utils/
│   │   ├── scoring.js
│   │   └── seed.js
│   ├── styles/
│   │   └── global.css
│   ├── App.jsx
│   └── main.jsx
├── .env.example
├── firestore.rules
├── vercel.json
├── vite.config.js
├── index.html
└── package.json
```

---

## ☁️ Deploy to Vercel

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Framework preset: **Vite** (auto-detected).
4. Add the same `VITE_FIREBASE_*` env vars under **Environment Variables**.
5. Deploy.

`vercel.json` already rewrites all routes to `index.html` so client-side routing works on refresh.

Don't forget: in the Firebase console → **Authentication → Settings → Authorized domains**, add your `*.vercel.app` domain.

---

## 🧭 Roadmap (post-MVP ideas)

- Cloud Functions to recompute scores server-side
- Real-time ranking via Firestore listeners
- Player photos and team logos
- Match locking — disable predictions once a match starts
- Mini-leagues / private rooms
- Push notifications for results

---

## 📄 License

MIT — do whatever you like.
