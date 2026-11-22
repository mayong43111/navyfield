import { element } from '../ui.ts';
import { paintLobby, worldPoint } from '../lobby-art.ts';
import type { LandPolygon } from '../lobby-art.ts';
import { battles, findBattle } from '../game/battles.ts';
import {
  createLobbyState, createRoom, selectRoom, joinRoom, changeTeam, toggleReady,
  canStart, beginBattle, leaveRoom, findRoom, joinedRoom, LobbyInputError, addShip, selectShip,
  removeShip, moveShip, applyFormation, formationPageCount, FORMATION_PAGE_SIZE, changeShipType
} from '../game/lobby-state.ts';
import type { Screen, Area, Flagship, BattleDeployment } from '../game/lobby-state.ts';
import { findOriginalShip, shipClassNames, nationNames, YAMATO_ID } from '../original-data.ts';
import type { OriginalData } from '../original-data.ts';
import '../lobby.css';

export function createLobby(navigate: (screen: Screen, deployment?: BattleDeployment) => void, land: readonly LandPolygon[], shipPreview: string | ((typeId: string) => string),
  flagship: () => Flagship, data: OriginalData, launchError: (typeId: string) => string | null): {
  show: (screen: Screen) => void;
  getStatus: () => string;
} {
  const state = createLobbyState();
  let screen: Screen = 'warzone';
  let area: Area = 'training';
  let battleId = 'midway';
  let page = 0;
  let formationPage = 0;
  let message = '选择海战地点';
  const events = ['编队日志'];
  const root = document.createElement('div');
  root.className = 'lobby';
  root.hidden = true;
  root.innerHTML = `
    <header class="lobby-top metal"><span>舰队司令部</span><h1 id="lobby-title">战区</h1><b>单机 <a href="./credits.html" target="_blank" rel="noopener">署名 / 许可</a></b></header>
    <section id="warzone-page" class="lobby-screen" aria-label="世界战区选房">
      <div class="channel-controls metal"><button data-area="training" type="button">新手战区</button><button data-area="open" type="button">自由战区</button><button id="room-previous" type="button" aria-label="上一页房间">◀</button><span id="room-page">1 / 1</span><button id="room-next" type="button" aria-label="下一页房间">▶</button><button id="room-new" type="button">＋ 建立房间</button><button data-go="yard" type="button">⚓ 港口 / 船坞</button></div>
      <div class="world-chart-area"><div class="world-chart"><canvas id="lobby-map" aria-label="世界海战地图"></canvas><div id="battle-markers" aria-label="二战海战地点，坐标为战区约位"></div><span class="chart-caption">海战位置示意</span></div></div>
      <aside class="warzone-details glass">
        <h2>海战地点</h2><div id="battle-list"></div>
        <section class="battle-information"><h3 id="battle-name"></h3><time id="battle-date"></time><p id="battle-location"></p><p id="battle-description"></p><a id="battle-source" target="_blank" rel="noopener">战史资料 ↗</a></section>
        <section class="room-inspector"><h2>房间</h2><h3 id="selected-room-title">选择房间</h3><p id="selected-room-info"></p><button id="room-join" type="button" disabled>进入房间排阵</button></section>
      </aside>
      <div id="room-plaques" aria-label="当前海战地点的房间"></div>
      <p id="rooms-empty" class="rooms-empty" hidden>此战区尚无房间，点击「建立房间」。</p>
    </section>
    <section id="prepare-page" class="lobby-screen" aria-label="战前编队布阵">
      <aside class="fleet-tools glass"><h2>编队管理</h2>
        <div class="team-tabs"><button data-team="alpha" type="button"><i class="team-flag alpha"></i>甲队</button><button data-team="bravo" type="button"><i class="team-flag bravo"></i>乙队</button></div>
        <p id="fleet-capacity"></p><label class="fleet-type-label">舰型<select id="fleet-ship-type" aria-label="编队舰型"></select></label><button id="ship-add" type="button">＋ 加入舰艇</button><button id="ship-remove" type="button" disabled>移除所选舰</button>
        <h3>选中舰艇</h3><p id="selected-ship-info">尚未选择</p>
        <h3>分队阵型</h3><div class="formation-presets"><button data-formation="column" type="button">单纵阵</button><button data-formation="line" type="button">横队</button><button data-formation="wedge" type="button">楔形梯队</button></div>
        <table><thead><tr><th>舰种</th><th>甲队</th><th>乙队</th></tr></thead><tbody id="team-counts"></tbody></table>
        
      </aside>
      <div class="formation-toolbar metal"><button id="formation-previous" type="button" aria-label="上一页阵位">◀</button><span id="formation-page"></span><button id="formation-next" type="button">更多阵位 ▶</button></div>
      <div id="formation-grid" aria-label="编队阵位，点舰选中，点空位移动，拖放可交换"></div>
      <p class="formation-help">点空位移动，拖到另一艘舰上交换位置。单舰对战按所选阵位出港。</p>
      <div class="readiness-controls"><button id="room-ready" class="ready-wheel" type="button" aria-pressed="false" disabled>准备</button><button id="room-start" class="ready-wheel" type="button" hidden disabled>出击</button><button id="room-exit" class="exit-wheel" type="button" disabled>退出房间</button></div>
      <div id="prep-empty" class="prep-empty glass"><h2>尚未加入房间</h2><p>请先在战区选择或创建房间。</p><button data-go="warzone" type="button">前往战区</button></div>
      <div class="preparation-bottom"><section class="roster glass"><h2>舰艇名册</h2><div class="roster-scroll"><table><tbody id="room-roster"></tbody></table></div></section><section class="room-log glass"><h2><span id="prepared-room-title">房间日志</span><b id="room-player-count">0 / —</b></h2><ol id="room-events" aria-label="房间事件"></ol></section></div>
    </section>
    <p id="lobby-alert" role="alert" hidden></p>
    <dialog id="room-dialog" class="glass"><form id="room-form"><h2>建立房间</h2><label>房间名称<input id="room-name" maxlength="40" required autocomplete="off"></label><label>战区<select id="room-area"><option value="training">新手战区</option><option value="open">自由战区</option></select></label><label>海战地点<select id="room-battle">${battles.map(battle => `<option value="${battle.id}">${battle.name}</option>`).join('')}</select></label><label>舰艇容量<input id="room-capacity" type="number" min="1" step="1" value="48" required></label><p id="room-validation" role="alert" hidden></p><div><button type="submit">创建并进入</button><button id="room-cancel" type="button">取消</button></div></form></dialog>`;
  element('app', HTMLElement).append(root);
  const map = element('lobby-map', HTMLCanvasElement);
  const plaques = element('room-plaques', HTMLDivElement);
  const grid = element('formation-grid', HTMLDivElement);
  const ready = element('room-ready', HTMLButtonElement);
  const start = element('room-start', HTMLButtonElement);
  const exit = element('room-exit', HTMLButtonElement);
  const join = element('room-join', HTMLButtonElement);
  const dialog = element('room-dialog', HTMLDialogElement);
  const alert = element('lobby-alert', HTMLParagraphElement);
  const roomArea = element('room-area', HTMLSelectElement);
  const roomBattle = element('room-battle', HTMLSelectElement);
  const shipType = element('fleet-ship-type', HTMLSelectElement);
  for (const [nation, name] of nationNames.entries()) {
    const group = document.createElement('optgroup');
    group.label = name;
    for (const ship of data.ships.filter(ship => ship.nation === nation)) {
      const option = document.createElement('option');
      option.value = ship.id;
      option.textContent = `${ship.name} · ${shipClassNames[ship.shipClass] ?? '其他'}`;
      option.disabled = !ship.available;
      group.append(option);
    }
    shipType.append(group);
  }
  shipType.value = YAMATO_ID;
  const pages = (['warzone', 'prepare'] as const).map(name => ({ name, node: element(`${name}-page`, HTMLElement) }));

  function record(text: string): void {
    message = text;
    events.push(text);
    if (events.length > 40) events.shift();
  }
  function inputAction(action: () => void): void {
    try { action(); alert.hidden = true; }
    catch (error) {
      if (!(error instanceof LobbyInputError)) throw error;
      message = alert.textContent = error.message;
      alert.hidden = false;
    }
  }
  function focusShip(id: string): void {
    const ship = selectShip(state, id);
    shipType.value = ship.typeId;
    state.team = ship.team;
    formationPage = Math.floor(ship.slot / FORMATION_PAGE_SIZE);
  }
  function positionText(team: string, slot: number): string {
    return `${team === 'alpha' ? '甲' : '乙'}-${String(slot + 1).padStart(3, '0')}`;
  }
  function chooseBattle(id: string): void {
    findBattle(id);
    battleId = id; page = 0; state.selectedRoomId = null;
    message = `已选择 ${findBattle(id).name} · 选择或建立房间`;
    render();
  }
  for (const [index, battle] of battles.entries()) {
    const marker = document.createElement('button');
    marker.type = 'button'; marker.className = 'world-marker';
    marker.dataset['battle'] = battle.id;
    marker.textContent = String(index + 1);
    marker.title = `${battle.name} · ${battle.date}`;
    marker.setAttribute('aria-label', marker.title);
    const [x, y] = worldPoint(battle.longitude, battle.latitude);
    const [dx, dy] = battle.labelOffset ?? [0, 0];
    marker.style.left = `calc(${x * 100}% + ${dx}px)`;
    marker.style.top = `calc(${y * 100}% + ${dy}px)`;
    marker.addEventListener('click', () => chooseBattle(battle.id));
    element('battle-markers', HTMLDivElement).append(marker);
    const button = document.createElement('button');
    button.type = 'button'; button.dataset['battle'] = battle.id;
    button.textContent = `${String(index + 1).padStart(2, '0')}  ${battle.name}`;
    button.addEventListener('click', () => chooseBattle(battle.id));
    element('battle-list', HTMLDivElement).append(button);
  }

  function render(): void {
    element('lobby-title', HTMLElement).textContent = screen === 'warzone' ? '世界战区' : '战前布阵';
    const battle = findBattle(battleId);
    element('battle-name', HTMLElement).textContent = battle.name;
    element('battle-date', HTMLElement).textContent = battle.date;
    element('battle-location', HTMLElement).textContent = battle.location;
    element('battle-description', HTMLElement).textContent = battle.description;
    element('battle-source', HTMLAnchorElement).href = battle.source;
    for (const selector of ['[data-area]', '[data-battle]']) {
      root.querySelectorAll<HTMLButtonElement>(selector).forEach(button => {
        const active = selector === '[data-area]' ? button.dataset['area'] === area : button.dataset['battle'] === battleId;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    plaques.replaceChildren();
    const rooms = state.rooms.filter(room => room.area === area && room.battleId === battleId);
    const roomPages = Math.max(1, Math.ceil(rooms.length / 6));
    page = Math.max(0, Math.min(page, roomPages - 1));
    element('room-page', HTMLElement).textContent = `${page + 1} / ${roomPages}`;
    element('room-previous', HTMLButtonElement).disabled = page === 0;
    element('room-next', HTMLButtonElement).disabled = page === roomPages - 1;
    element('rooms-empty', HTMLParagraphElement).hidden = rooms.length !== 0;
    for (const room of rooms.slice(page * 6, (page + 1) * 6)) {
      const button = document.createElement('button');
      button.className = 'room-plaque'; button.type = 'button';
      button.dataset['room'] = room.id;
      const title = document.createElement('b'); title.textContent = room.title;
      const count = document.createElement('small'); count.textContent = `${room.ships.length} / ${room.capacity} 艘`;
      button.append(title, count);
      button.classList.toggle('active', state.selectedRoomId === room.id);
      button.setAttribute('aria-pressed', String(state.selectedRoomId === room.id));
      button.addEventListener('click', () => { selectRoom(state, room.id); alert.hidden = true; render(); });
      plaques.append(button);
    }
    const selected = state.selectedRoomId ? findRoom(state, state.selectedRoomId) : null;
    element('selected-room-title', HTMLElement).textContent = selected?.title ?? '选择房间';
    element('selected-room-info', HTMLElement).textContent = selected
      ? `${selected.ships.length} / ${selected.capacity} 艘 · ${findBattle(selected.battleId).name}`
      : '';
    join.disabled = !selected;
    const room = state.joinedRoomId ? findRoom(state, state.joinedRoomId) : null;
    const ships = room?.ships ?? [];
    const selectedShip = ships.find(ship => ship.id === state.selectedShipId);
    if (selectedShip) shipType.value = selectedShip.typeId;
    element('prep-empty', HTMLDivElement).hidden = !!room;
    ready.disabled = !room || ships.length === 0;
    exit.disabled = !room;
    start.disabled = !canStart(state);
    start.hidden = start.disabled;
    ready.classList.toggle('active', state.ready);
    ready.setAttribute('aria-pressed', String(state.ready));
    ready.textContent = state.ready ? '已准备' : '准备';
    element('ship-add', HTMLButtonElement).disabled = !room || ships.length >= room.capacity;
    element('ship-remove', HTMLButtonElement).disabled = !selectedShip;
    element('fleet-capacity', HTMLElement).textContent = room ? `${ships.length} / ${room.capacity} 艘` : '未加入房间';
    element('selected-ship-info', HTMLElement).textContent = selectedShip
      ? `${selectedShip.name} · ${positionText(selectedShip.team, selectedShip.slot)} · 耐久 ${findOriginalShip(data, selectedShip.typeId).durability?.toLocaleString('zh-CN') ?? '—'}`
      : '尚未选择';
    root.querySelectorAll<HTMLButtonElement>('[data-team]').forEach(button => {
      button.disabled = !room;
      button.classList.toggle('active', !!room && button.dataset['team'] === state.team);
      button.setAttribute('aria-pressed', String(!!room && button.dataset['team'] === state.team));
    });
    root.querySelectorAll<HTMLButtonElement>('[data-formation]').forEach(button => {
      button.disabled = !ships.some(ship => ship.team === state.team);
    });
    const counts = element('team-counts', HTMLTableSectionElement);
    counts.replaceChildren();
    for (const shipClass of ['BB', 'BC', 'CV', 'CA', 'CL', 'DD', 'FF', 'SS', 'APA']) {
      const row = document.createElement('tr');
      for (const text of [shipClassNames[shipClass]!, String(ships.filter(ship => ship.team === 'alpha' && findOriginalShip(data, ship.typeId).shipClass === shipClass).length),
        String(ships.filter(ship => ship.team === 'bravo' && findOriginalShip(data, ship.typeId).shipClass === shipClass).length)]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      counts.append(row);
    }
    element('formation-page', HTMLElement).textContent = `第 ${formationPage + 1} / ${room ? formationPageCount(room, state.team, formationPage) : 1} 页 · 48 阵位`;
    element('formation-previous', HTMLButtonElement).disabled = !room || formationPage === 0;
    element('formation-next', HTMLButtonElement).disabled = !room;
    grid.replaceChildren();
    const occupied = new Map(ships.filter(ship => ship.team === state.team).map(ship => [ship.slot, ship]));
    for (let index = 0; index < FORMATION_PAGE_SIZE; index++) {
      const slot = formationPage * FORMATION_PAGE_SIZE + index;
      const ship = occupied.get(slot);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'formation-slot'; button.dataset['slot'] = String(slot);
      button.disabled = !room; button.draggable = !!ship;
      const address = positionText(state.team, slot);
      button.setAttribute('aria-label', ship ? `${address} ${ship.name}` : `${address} 空阵位`);
      const label = document.createElement('small'); label.textContent = address; button.append(label);
      if (ship) {
        button.dataset['ship'] = ship.id;
        button.classList.add('occupied');
        button.classList.toggle('selected', ship.id === state.selectedShipId);
        button.setAttribute('aria-pressed', String(ship.id === state.selectedShipId));
        const image = document.createElement('img');
        image.src = typeof shipPreview === 'string' ? shipPreview : shipPreview(ship.typeId);
        image.alt = ''; image.draggable = false;
        const name = document.createElement('span'); name.textContent = ship.name;
        button.append(image, name);
      }
      grid.append(button);
    }
    element('prepared-room-title', HTMLElement).textContent = room ? `${room.title} · ${findBattle(room.battleId).name}` : '房间日志 · 未加入';
    element('room-player-count', HTMLElement).textContent = room ? `${ships.length} / ${room.capacity} 艘` : '0 / —';
    const roster = element('room-roster', HTMLTableSectionElement);
    roster.replaceChildren();
    for (const ship of ships) {
      const row = document.createElement('tr');
      row.classList.toggle('selected', ship.id === state.selectedShipId);
      const shipClass = document.createElement('td'); shipClass.textContent = shipClassNames[findOriginalShip(data, ship.typeId).shipClass] ?? '其他';
      const name = document.createElement('td');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = ship.name;
      button.addEventListener('click', () => { focusShip(ship.id); render(); });
      name.append(button); row.append(shipClass, name);
      for (const text of [ship.team === 'alpha' ? '甲队' : '乙队', positionText(ship.team, ship.slot)]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      roster.append(row);
    }
    const log = element('room-events', HTMLOListElement);
    log.replaceChildren();
    for (const text of events) {
      const item = document.createElement('li'); item.textContent = text; log.append(item);
    }
    log.scrollTop = log.scrollHeight;
  }

  root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(button => {
    const target = button.dataset['go'];
    if (target !== 'warzone' && target !== 'yard') throw new Error('Invalid lobby route');
    button.addEventListener('click', () => navigate(target));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-area]').forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset['area'];
      if (next !== 'training' && next !== 'open') throw new Error('Invalid battle area');
      area = next; page = 0; state.selectedRoomId = null; render();
    });
  });
  element('room-previous', HTMLButtonElement).addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
  element('room-next', HTMLButtonElement).addEventListener('click', () => { page++; render(); });
  join.addEventListener('click', () => inputAction(() => {
    const room = joinRoom(state, flagship());
    formationPage = 0;
    record(`已进入 ${room.title} · 容量 ${room.capacity} 艘。`);
    navigate('prepare');
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-team]').forEach(button => {
    button.addEventListener('click', () => inputAction(() => {
      const next = button.dataset['team'];
      if (next !== 'alpha' && next !== 'bravo') throw new Error('Invalid preparation team');
      changeTeam(state, next); formationPage = 0; render();
    }));
  });
  element('ship-add', HTMLButtonElement).addEventListener('click', () => inputAction(() => {
    const definition = findOriginalShip(data, shipType.value);
    if (!definition.available) throw new LobbyInputError('此舰型的数值尚未取得。');
    const ship = addShip(state, { name: definition.name, typeId: definition.id });
    focusShip(ship.id); record(`已加入 ${ship.name} · ${positionText(ship.team, ship.slot)}`); render();
  }));
  shipType.addEventListener('change', () => inputAction(() => {
    if (!state.selectedShipId) return;
    const definition = findOriginalShip(data, shipType.value);
    if (!definition.available) throw new LobbyInputError('此舰型的数值尚未取得。');
    changeShipType(state, { name: definition.name, typeId: definition.id });
    record(`已换为 ${definition.name}，取消准备。`); render();
  }));
  element('ship-remove', HTMLButtonElement).addEventListener('click', () => inputAction(() => {
    removeShip(state); record('已移除所选舰，取消准备。'); render();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-formation]').forEach(button => {
    button.addEventListener('click', () => inputAction(() => {
      const formation = button.dataset['formation'];
      if (formation !== 'column' && formation !== 'line' && formation !== 'wedge') throw new Error('Invalid formation preset');
      applyFormation(state, formation); formationPage = 0; record(`已重新排列 ${state.team === 'alpha' ? '甲队' : '乙队'}，取消准备。`); render();
    }));
  });
  element('formation-previous', HTMLButtonElement).addEventListener('click', () => { formationPage = Math.max(0, formationPage - 1); render(); });
  element('formation-next', HTMLButtonElement).addEventListener('click', () => { formationPage++; render(); });
  function slotButton(event: Event): HTMLButtonElement | null {
    return event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-slot]') : null;
  }
  grid.addEventListener('click', event => inputAction(() => {
    const button = slotButton(event);
    if (!button) return;
    const id = button.dataset['ship'];
    if (id) selectShip(state, id);
    else {
      if (!state.selectedShipId) throw new LobbyInputError('请先点舰艇或舰艇表选中，再点击空阵位。');
      moveShip(state, state.selectedShipId, state.team, Number(button.dataset['slot']));
      record('所选舰已移动到新阵位，取消准备。');
    }
    render();
  }));
  grid.addEventListener('dragstart', event => {
    const id = slotButton(event)?.dataset['ship'];
    if (!id || !event.dataTransfer) { event.preventDefault(); return; }
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    selectShip(state, id);
  });
  grid.addEventListener('dragover', event => {
    const button = slotButton(event);
    if (!button || button.disabled) return;
    event.preventDefault(); button.classList.add('drop-target');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });
  grid.addEventListener('dragleave', event => slotButton(event)?.classList.remove('drop-target'));
  grid.addEventListener('drop', event => {
    event.preventDefault();
    inputAction(() => {
      const button = slotButton(event), id = event.dataTransfer?.getData('text/plain');
      if (!button || !id) throw new LobbyInputError('拖放缺少有效舰艇或阵位。');
      moveShip(state, id, state.team, Number(button.dataset['slot']));
      record('已调整阵位。'); render();
    });
  });
  grid.addEventListener('dragend', () => render());
  ready.addEventListener('click', () => inputAction(() => {
    toggleReady(state); record(state.ready ? '当前编队已准备。' : '编队取消准备。'); render();
  }));
  start.addEventListener('click', () => inputAction(() => {
    const room = joinedRoom(state);
    const selected = room.ships.find(ship => ship.id === state.selectedShipId) ?? room.ships[0];
    if (!selected) throw new LobbyInputError('请先选择出击舰艇。');
    const error = launchError(selected.typeId);
    if (error) throw new LobbyInputError(error);
    beginBattle(state); record('舰艇已出击。'); render();
    navigate('battle', { team: selected.team, slot: selected.slot });
  }));
  exit.addEventListener('click', () => {
    leaveRoom(state); record('已退出房间，阵型已保留。'); navigate('warzone');
  });
  element('room-new', HTMLButtonElement).addEventListener('click', () => {
    roomArea.value = area; roomBattle.value = battleId;
    element('room-validation', HTMLParagraphElement).hidden = true;
    dialog.showModal(); element('room-name', HTMLInputElement).focus();
  });
  element('room-cancel', HTMLButtonElement).addEventListener('click', () => dialog.close());
  element('room-form', HTMLFormElement).addEventListener('submit', event => {
    event.preventDefault();
    try {
      const chosenArea = roomArea.value;
      if (chosenArea !== 'training' && chosenArea !== 'open') throw new LobbyInputError('请选择有效战区。');
      const room = createRoom(state, element('room-name', HTMLInputElement).value,
        Number(element('room-capacity', HTMLInputElement).value), chosenArea, roomBattle.value);
      area = chosenArea; battleId = room.battleId;
      page = Math.floor(state.rooms.filter(item => item.area === area && item.battleId === battleId).findIndex(item => item.id === room.id) / 6);
      joinRoom(state, flagship()); formationPage = 0;
      record(`已创建 ${room.title} · 容量 ${room.capacity} 艘。`);
      dialog.close(); navigate('prepare');
    } catch (error) {
      if (!(error instanceof LobbyInputError)) throw error;
      const validation = element('room-validation', HTMLParagraphElement);
      validation.textContent = error.message; validation.hidden = false;
    }
  });
  const observer = new ResizeObserver(() => { if (screen === 'warzone') paintLobby(map, land); });
  observer.observe(map);
  return {
    show(next): void {
      screen = next;
      const isLobby = next === 'warzone' || next === 'prepare';
      root.hidden = !isLobby;
      for (const page of pages) {
        page.node.hidden = page.name !== next;
      }
      if (dialog.open && next !== 'warzone') dialog.close();
      alert.hidden = true;
      if (!isLobby) return;
      message = next === 'warzone' ? '选择海战地点'
        : state.joinedRoomId ? '编队待命' : '战前布阵 · 请先在战区加入房间';
      render();
      if (next === 'warzone') paintLobby(map, land);
    },
    getStatus: () => message
  };
}
