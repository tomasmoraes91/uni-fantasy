# UniFantasy 🏆

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)
![Licença](https://img.shields.io/badge/licença-MIT-blue)

> **Plataforma de fantasy game esportivo** — monte seu time, faça palpites nas partidas e suba no ranking.
> Criado para esportes universitários e **validado num bolão da Copa do Mundo com mais de 100 usuários reais.**

Montagem de times de fantasy + palpites de partidas em **futsal, basquete e vôlei** (mais um modo Copa do Mundo), tudo feito com React + Firebase.

🔗 **Demo ao vivo:** **<https://capitola.web.app/>**

<!--
📸 DICA (Tomás): adicione um print ou GIF do app aqui — é o que mais chama recrutador.
   Coloque a imagem numa pasta "docs" (ex: docs/screenshot.png) e descomente a linha abaixo.
-->
<!-- ![Tela do UniFantasy](docs/screenshot.png) -->

## ✨ Funcionalidades

- 🔐 Login com e-mail/senha via Firebase Auth
- ⚽ 🏀 🏐 Três esportes, quatro times cada
- 👥 Monte um time de fantasy com 5 jogadores por esporte (máximo 2 do mesmo time)
- 👑 Recurso de capitão — o capitão pontua em dobro
- 🔮 Palpites de partidas (acertar o vencedor +2 pts, placar exato +4 pts)
- 📊 Rankings calculados automaticamente — geral e por esporte
- 🛡 Papel de administrador para lançar resultados e estatísticas dos jogadores
- 📱 Interface responsiva, adaptada para celular

## 🧰 Tecnologias

| Camada     | Escolha                     |
|------------|-----------------------------|
| Frontend   | React 18 + Vite             |
| Rotas      | React Router v6             |
| Backend    | Firebase (Auth + Firestore) |
| Hospedagem | Vercel                      |

Sem backend tradicional — toda a lógica roda no cliente, direto contra o Firestore.

---

## 🚀 Começando

### 1. Instale as dependências

```bash
npm install
```

### 2. Crie um projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um novo projeto.
2. **Authentication** → Vamos começar → ative **E-mail/senha**.
3. **Firestore Database** → Criar banco de dados → inicie em modo produção → escolha uma região.
4. **Configurações do projeto** → **Seus apps** → Web (`</>`) → registre um app e copie a config.

### 3. Configure o ambiente

Copie o `.env.example` para `.env` e preencha com as credenciais do seu Firebase:

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

### 4. Aplique as regras de segurança do Firestore

No console do Firebase → **Firestore** → **Regras**, cole o conteúdo de `firestore.rules` e publique.

### 5. Rode localmente

```bash
npm run dev
```

Abra <http://localhost:5173>.

### 6. Popule os dados iniciais (seed)

Na primeira execução, o banco está vazio. Popule uma única vez:

1. Cadastre um usuário e faça login.
2. Abra o console do DevTools do navegador.
3. Cole:
   ```js
   import('/src/utils/seed.js').then(m => m.seed());
   ```
4. Você deve ver `✅ Seed complete: 12 teams, 48 players, 7 matches.`

> **Observação:** o seed escreve em `teams`, `players` e `matches`. Como as regras de segurança só permitem escrita para admins, **afrouxe temporariamente** as regras durante o seed:
> ```
> match /teams/{id}    { allow write: if request.auth != null; }
> match /players/{id}  { allow write: if request.auth != null; }
> match /matches/{id}  { allow write: if request.auth != null; }
> ```
> Restaure as regras originais depois de popular.

### 7. Promova-se a administrador

Encontre o documento do seu usuário no Firestore → `users/{seu-uid}` → mude o `role` de `"user"` para `"admin"`. Recarregue o app — o link **Admin** aparece no menu e você pode lançar resultados.

---

## 🗄 Modelo do Firestore

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
  sport        igual ao do time
  position     string  (ex: 'GK', 'PG', 'SET')

matches/{matchId}
  id            string
  sport         string
  homeTeamId    string
  awayTeamId    string
  homeTeamName  string  (desnormalizado para exibição)
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
  playerIds    string[]   // exatamente 5
  captainId    string|null
  updatedAt    number

scores/{uid}
  uid          string
  displayName  string
  total        number
  bySport      { futsal, basketball, volleyball }  // números
  updatedAt    number
```

### IDs de documento determinísticos onde importa

- `predictions/{uid}_{matchId}` — um palpite por usuário por partida
- `user_teams/{uid}_{sport}` — um time por usuário por esporte
- `scores/{uid}` — um documento de pontuação por usuário

Isso evita duplicatas acidentais e faz o `setDoc` funcionar como upsert (insere ou atualiza).

---

## 🧮 Regras de pontuação

### Fantasy (por jogador)

| Evento             | Pontos |
|--------------------|--------|
| Gol                | +5     |
| Assistência        | +3     |
| Vitória do time    | +2     |
| Cartão amarelo     | -1     |
| Cartão vermelho    | -3     |

Se o jogador for o seu **capitão**, os pontos são dobrados.

### Palpites (por partida)

| Resultado                     | Pontos |
|-------------------------------|--------|
| Vencedor / empate correto     | +2     |
| Placar exato                  | +4     |

A recompensa do placar exato **substitui** (não soma com) os +2.

Todas as regras ficam em `src/utils/scoring.js` — mude as constantes por lá.

---

## 🔄 Como os rankings são atualizados

Quando um admin salva o resultado de uma partida na página Admin, o app chama `recomputeAllScores()`, que:

1. Lê todos os usuários, todas as partidas encerradas, todos os times de fantasy salvos e todos os palpites.
2. Soma os pontos de fantasy + palpites por esporte, para cada usuário.
3. Grava um documento por usuário em `scores/{uid}`.

Para uma liga pequena de MVP (dezenas de usuários), esse recálculo no cliente é perfeitamente suficiente. Se a liga crescer, mova isso para uma Cloud Function disparada pelo `onUpdate` de `matches`.

---

## 📁 Estrutura do projeto

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

## ☁️ Deploy na Vercel

1. Suba o repositório para o GitHub.
2. Acesse [vercel.com](https://vercel.com) → **New Project** → importe o repositório.
3. Preset de framework: **Vite** (detectado automaticamente).
4. Adicione as mesmas variáveis `VITE_FIREBASE_*` em **Environment Variables**.
5. Faça o deploy.

O `vercel.json` já redireciona todas as rotas para o `index.html`, então o roteamento no cliente funciona mesmo ao recarregar a página.

Não esqueça: no console do Firebase → **Authentication → Settings → Authorized domains**, adicione o seu domínio `*.vercel.app`.

---

## 🧭 Roadmap (ideias pós-MVP)

- Cloud Functions para recalcular pontuações no servidor
- Ranking em tempo real via listeners do Firestore
- Fotos dos jogadores e escudos dos times
- Travamento de partida — bloquear palpites quando a partida começa
- Mini-ligas / salas privadas
- Notificações push de resultados

---

## 📄 Licença

MIT — faça o que quiser.
