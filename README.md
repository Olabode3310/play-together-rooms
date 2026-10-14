# Play Together

A free-to-play Whot and Dice lobby with shareable online waiting rooms. The static frontend is built for Vercel or Netlify; the lightweight Node WebSocket server can run locally or on Render. There are no accounts, wallets, payments, or real-money features.

## Run locally

Requires Node.js 20 or newer. In this folder:

```sh
npm start
```

Open `http://localhost:3001`. The same Node process serves the frontend and WebSocket endpoint. Run the integration checks with `npm test`.

## Cross-device room behavior

- Choose Whot or Dice to create an online room with a six-character code.
- Friends enter that code from any device to join the room.
- The server broadcasts player membership and ready status to everyone in the room.
- Rooms are held in server memory and are removed when empty. A server restart clears all rooms.
- Game rules, turns, and persistent identities are not implemented yet.

## Deployment

Deploy the static site to Vercel as before, and deploy `server/index.js` to Render as a Node Web Service. Then put the Render `wss://.../ws` endpoint in `config.js` and redeploy Vercel. Full setup and free-tier limitations are in [DEPLOY.md](DEPLOY.md).

## Project structure

```text
multiplayer-gaming-platform/
  index.html             # static lobby and room screens
  styles.css             # responsive styling
  app.js                 # WebSocket client and room UI
  config.js              # public frontend WebSocket endpoint
  server/index.js        # dependency-free Node room server
  tests/server.test.cjs  # cross-client WebSocket integration checks
  render.yaml            # Render service blueprint
  package.json           # start and test commands
  vercel.json            # static deployment security headers
  netlify.toml            # static publish directory and headers
```

Everything is free to play. The multiplayer service only synchronizes room membership and readiness in this phase.
