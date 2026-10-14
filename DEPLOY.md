# Deploy Play Together

The browser lobby remains a static Vercel site. A small Node service holds temporary room state and carries WebSocket updates. Rooms are free-to-play; this preview has no login, wallet, payments, or real-money features.

## Run locally

Install Node.js 20 or newer, open a terminal in this project folder, then run:

```sh
npm start
```

Open `http://localhost:3001`. The local server hosts both the static files and `/ws`, so the frontend connects automatically. To check the room service, open `http://localhost:3001/health`.

Run the service tests with `npm test`.

## Deploy the room server to Render

1. Put this project folder in a GitHub repository. If the repository root is its parent folder, set the Render root directory to `outputs/multiplayer-gaming-platform`; otherwise use `.`.
2. In Render, choose **New + → Blueprint** and select the repository containing `render.yaml`. If the project folder is a subdirectory, choose **New + → Web Service**, set the root directory to that folder, runtime to Node, build command to `npm install`, and start command to `npm start`.
3. In the service environment settings, set `ALLOWED_ORIGINS` to the exact Vercel site origin, without a trailing slash. The included Blueprint uses `https://play-together-lobby-vercel.vercel.app`.
4. Deploy and wait for the service to become live. Check its `https://<service-name>.onrender.com/health` address; it should return `{"ok":true,"rooms":0}`.

## Connect Vercel to the room server

1. Copy the Render service hostname. In `config.js`, set `window.PLAY_TOGETHER_WS_URL` to its secure WebSocket endpoint, for example:

   ```js
   window.PLAY_TOGETHER_WS_URL = 'wss://play-together-rooms.onrender.com/ws';
   ```

   Use the actual hostname Render assigned. The `wss://` scheme is required for an HTTPS Vercel site.
2. Save and deploy the project folder to the existing Vercel project (or push the change to the connected Git repository and let Vercel redeploy). Keep `index.html` at the static site's root; this project has no build output folder.
3. Open the Vercel URL in two separate browser sessions/devices. Create a Whot or Dice room in one, enter the six-character code in the other, and confirm both screens show the same players. Ready changes should appear on both screens.

If you use a different Vercel domain or a Vercel preview URL, add that exact origin to the Render service's `ALLOWED_ORIGINS` environment variable as well (comma-separated for multiple origins), then redeploy/restart Render.

## Free-tier behavior and scope

The Render free service can spin down after inactivity and has limited free hours. Its room state is held in memory, so rooms disappear when the service restarts or redeploys. After a quiet period, the first connection may take a while to wake the service. This setup is suitable for an early shared-room preview, not durable production rooms. Whot/Dice game rules and synchronized turns are not implemented yet; only room membership and readiness are shared.
