(() => {
  const GAMES = {
    Whot: { count: 4, icon: '◈', badge: 'WHOT', title: 'Whot!' },
    Dice: { count: 4, icon: '⚄', badge: 'DICE', title: 'Dice' }
  };
  const views = { home: document.querySelector('#home-view'), room: document.querySelector('#room-view') };
  const toastElement = document.querySelector('#toast');
  let toastTimer;
  let socket = null;
  let activeRoom = null;
  let playerId = null;
  let pendingAction = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let shouldReconnect = true;
  const keepaliveTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) send({ type: 'keepalive' });
  }, 4 * 60 * 1000);

  function toast(message) {
    toastElement.textContent = message;
    toastElement.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastElement.classList.remove('show'), 3500);
  }

  function setView(name) {
    Object.entries(views).forEach(([key, element]) => {
      const active = key === name;
      element.classList.toggle('active', active);
      element.hidden = !active;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function configuredSocketUrl() {
    const configured = window.PLAY_TOGETHER_WS_URL;
    if (configured) return configured;
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    }
    return '';
  }

  function connectionLabel(state, detail) {
    document.querySelector('#connection-state').textContent = state;
    document.querySelector('#connection-detail').textContent = detail;
  }

  function connect() {
    const url = configuredSocketUrl();
    if (!url || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    connectionLabel('Connecting', 'Connecting to the room server…');
    try {
      socket = new WebSocket(url);
      socket.addEventListener('open', () => {
        reconnectDelay = 1000;
        connectionLabel('Connected', 'Online room server connected.');
        if (pendingAction) send(pendingAction);
        else if (activeRoom?.code) send({ type: 'join_room', code: activeRoom.code, name: activeRoom.playerName });
      });
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'room_state') {
          activeRoom = message.room;
          playerId = message.selfPlayerId;
          pendingAction = null;
          drawRoom(message.room);
        } else if (message.type === 'error') {
          pendingAction = null;
          toast(message.message || 'That room action could not be completed.');
          if (!activeRoom) setView('home');
        }
      });
      socket.addEventListener('close', () => {
        connectionLabel('Reconnecting', 'The room server disconnected. Trying again…');
        if (shouldReconnect) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 15000);
            connect();
          }, reconnectDelay);
        }
      });
      socket.addEventListener('error', () => connectionLabel('Offline', 'Room server is unavailable.'));
    } catch {
      connectionLabel('Offline', 'Could not connect to the room server.');
      toast('Room server unavailable. Check the WebSocket URL and try again.');
    }
  }

  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else pendingAction = message;
  }

  function beginRoom(action) {
    shouldReconnect = true;
    activeRoom = null;
    playerId = null;
    pendingAction = action;
    setView('room');
    document.querySelector('#room-title').textContent = action.type === 'create_room' ? `${GAMES[action.game].title} room` : 'Joining room…';
    document.querySelector('#room-subtitle').textContent = 'Connecting to your room…';
    document.querySelector('#room-code-display').textContent = action.code || '••••••';
    if (!configuredSocketUrl()) {
      pendingAction = null;
      connectionLabel('Not configured', 'Add the WebSocket server URL in config.js to enable online rooms.');
      toast('Online rooms are not configured on this deployment yet.');
      setView('home');
      return;
    }
    connect();
    if (socket?.readyState === WebSocket.OPEN) send(action);
  }

  function drawRoom(room) {
    const game = GAMES[room.game];
    if (!game) return;
    document.querySelector('#room-title').textContent = `${game.title} room`;
    document.querySelector('#room-subtitle').textContent = 'Your table is online. Share the code to invite friends.';
    document.querySelector('#room-game-badge').textContent = game.badge;
    document.querySelector('#table-game-icon').textContent = game.icon;
    document.querySelector('#table-game-title').textContent = game.title;
    document.querySelector('#table-capacity').textContent = `${room.players.length} / ${game.count} players`;
    document.querySelector('#room-code-display').textContent = room.code;
    document.querySelector('#detail-game').textContent = game.title;
    document.querySelector('#detail-players').textContent = `${game.count} players`;
    document.querySelector('#room-subtitle').textContent = room.players.length >= 2
      ? `${room.players.length} players are at the table. Waiting for the next move.`
      : 'Your table is ready. Share the code to invite friends.';
    const slots = document.querySelector('#player-slots');
    slots.replaceChildren();
    room.players.forEach(player => {
      const slot = document.createElement('span');
      slot.className = `player-slot${player.host ? ' owner' : ''}${player.ready ? ' ready' : ''}`;
      slot.textContent = `${player.name}${player.id === playerId ? ' (YOU)' : ''}${player.host ? ' · HOST' : ''}${player.ready ? ' · READY' : ' · NOT READY'}`;
      slot.setAttribute('aria-label', `${player.name}${player.ready ? ', ready' : ', not ready'}${player.host ? ', host' : ''}`);
      slots.append(slot);
    });
    for (let i = room.players.length; i < game.count; i++) {
      const slot = document.createElement('span');
      slot.className = 'player-slot';
      slot.textContent = 'OPEN SEAT';
      slot.setAttribute('aria-label', 'Open seat');
      slots.append(slot);
    }
    const allReady = room.players.length > 1 && room.players.every(player => player.ready);
    document.querySelector('#table-state-text').textContent = allReady ? 'Everyone is ready' : 'Waiting for your crew';
    document.querySelector('#room-status-title').textContent = allReady ? 'Table ready' : 'Waiting for players';
    document.querySelector('#connection-detail').textContent = `${room.players.length} connected · shared room state is live`;
    const readyButton = document.querySelector('#ready-button');
    const self = room.players.find(player => player.id === playerId);
    readyButton.textContent = self?.ready ? 'I’m not ready' : 'I’m ready';
    readyButton.disabled = !self;
    setView('room');
  }

  document.querySelectorAll('[data-game]').forEach(card => {
    card.addEventListener('click', () => beginRoom({ type: 'create_room', game: card.dataset.game, name: 'Guest' }));
  });

  document.querySelector('#join-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.querySelector('#room-code-input');
    const code = input.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      toast('Enter a valid 6-character room code.');
      input.focus();
      return;
    }
    beginRoom({ type: 'join_room', code, name: 'Guest' });
    input.value = '';
  });

  document.querySelector('#ready-button').addEventListener('click', () => {
    const self = activeRoom?.players.find(player => player.id === playerId);
    if (activeRoom && self) send({ type: 'set_ready', ready: !self.ready });
  });
  function leaveRoom() {
    if (socket?.readyState === WebSocket.OPEN) send({ type: 'leave_room' });
    activeRoom = null;
    playerId = null;
    pendingAction = null;
    setView('home');
    toast('You left the room.');
  }
  document.querySelector('#back-home').addEventListener('click', leaveRoom);
  document.querySelector('#leave-room').addEventListener('click', leaveRoom);
  document.querySelector('#copy-code').addEventListener('click', async () => {
    if (!activeRoom) return;
    try {
      await navigator.clipboard.writeText(activeRoom.code);
      toast('Room code copied. Send it to your friends to join.');
    } catch {
      toast(`Your room code is ${activeRoom.code}. Select and copy it to share.`);
    }
  });

  window.addEventListener('beforeunload', () => {
    shouldReconnect = false;
    clearTimeout(reconnectTimer);
    clearInterval(keepaliveTimer);
    socket?.close();
  });
})();
