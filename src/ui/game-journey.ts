import type { ApplicationState, Screen } from '../domain/application.ts';
import type { TargetContent } from '../domain/target-content.ts';

export function createGameJourney(actions: {
  navigate: (screen: Screen) => void; launch: () => void; retry: () => void; cancelPending?: () => void;
}, content: TargetContent) {
  const app = document.getElementById('app')!;
  const root = document.createElement('div'); root.className = 'game-journey';
  root.innerHTML = `
    <header class="journey-header"><button class="journey-brand" type="button" data-route="home">大海战 <small>NAVAL COMMAND</small></button>
      <nav aria-label="主导航"><button type="button" data-route="home">首页</button><button type="button" data-route="yard">港口</button><button type="button" data-route="warzone">战区 / 高级编队</button><button type="button" id="journey-help">操作指南</button></nav>
      <span class="journey-mode">单机 · 同型舰对决</span></header>
    <div class="journey-location" aria-label="当前位置"><span id="journey-location"></span><span>选择舰艇 → 战前准备 → 海上对决 → 战果归港</span></div>
    <section class="journey-page home-page" data-page="home" aria-labelledby="home-title" hidden>
      <div class="home-emblem" aria-hidden="true">⚓</div><p class="journey-eyebrow">舰队司令部 / SINGLE PLAYER</p><h1 id="home-title" tabindex="-1">掌舵出港，决胜海疆。</h1>
      <p class="journey-lead">十二艘舰艇，不同的战术。选择你的旗舰，掌握航行与瞄准，以协同火力赢得海上对决。</p>
      <div class="journey-actions"><button class="journey-primary" type="button" data-route="yard">进入港口 · 选择舰艇</button><button type="button" id="home-help">首次出航指南</button></div>
      <div class="home-features"><article><b>01 / 港口整备</b><p>查看舰艇定位、武器与备弹，选定本次出击舰。</p></article><article><b>02 / 真实操舰</b><p>规划航线、调整动力，指挥主炮、鱼雷或航空组。</p></article><article><b>03 / 单舰演习</b><p>迎战同型电脑舰艇，以机动和火力掌控战局。</p></article></div>
      <p class="journey-muted">前往高级战区浏览战史海图、安排编队；本次对决仅出动所选旗舰。 <a href="./credits.html" target="_blank" rel="noopener">制作署名 / 资源许可 ↗</a></p>
    </section>
    <section class="journey-page briefing-page" data-page="briefing" aria-labelledby="briefing-title" hidden>
      <p class="journey-eyebrow">SORTIE ORDERS / 战前准备</p><h1 id="briefing-title" tabindex="-1">出击命令</h1><p class="journey-lead">当前港口舰艇与配装已确认。准备完成后开始单机同型舰对决。</p>
      <div class="briefing-grid"><article class="journey-card"><h2 id="briefing-ship"></h2><dl id="briefing-loadout"></dl><p id="briefing-stock" class="journey-muted"></p></article>
      <article class="journey-card"><h2>任务简报</h2><dl id="briefing-mission"></dl><p>击沉敌舰获胜，本舰沉没判负；双方沉没或达到战斗时限则平局。</p><p>对手为电脑控制的同型舰。每次出击前，舰体与弹药、鱼雷、舰载机均完成整备。</p></article></div>
      <div class="journey-card briefing-controls"><h2>出航要领</h2><p><kbd>右键</kbd> 设定航线　<kbd>F / V</kbd> 调整动力　<kbd>左键</kbd> 锁定方向与仰角　<kbd>空格</kbd> 手动开火　<kbd>C</kbd> 全部/前/后炮组　<kbd>Z</kbd> 弹种/用途　<kbd>X</kbd> 齐射/渐次　<kbd>Home</kbd> 视角回舰</p><p>先在武器面板选择炮组与控制方式；自动组自行攻击。鱼雷与航空组使用各自模式，炮塔就绪并进入射界后才能开火。</p></div>
      <p id="sortie-countdown" role="status" aria-live="polite"></p><div class="journey-actions"><button type="button" class="journey-primary" id="sortie-start">确认出击</button><button type="button" id="sortie-cancel" hidden>取消倒计时</button><button type="button" data-route="yard">返回港口调整</button></div>
    </section>
    <section class="journey-page results-page" data-page="results" aria-labelledby="results-title" hidden>
      <p class="journey-eyebrow">AFTER ACTION REPORT / 本场战报</p><h1 id="results-title" tabindex="-1"></h1><p id="results-summary" class="journey-lead"></p><dl id="results-statistics" class="results-grid"></dl>
      <p class="journey-muted">归港后可查看主炮余弹、调整配装。再次出击时，舰体和全部弹药将重新整备。进度仅在当前页面保留。</p>
      <div class="journey-actions"><button type="button" class="journey-primary" data-route="yard">返回港口 · 整备舰艇</button><button type="button" id="sortie-retry">重新整备 · 再战</button><button type="button" data-route="home">返回首页</button></div>
    </section>
    <p id="journey-alert" role="alert" hidden></p>
    <dialog id="journey-help-dialog" aria-labelledby="help-title"><h2 id="help-title">舰桥操作指南</h2><p>单机演习 · 指南打开时战斗暂停。键鼠操作推荐在桌面设备上进行。</p><ol><li>港口：泊位名册选择舰艇，查看定位与配装。R 重置港口视角与弹仓，也可点击「重置弹仓」。每次出击按规则重新整备弹池。</li><li>准备：核对当前舰艇、库存与地图，确认后倒计时出击；可以随时取消。</li><li>航行：右键设定航线；F 增加动力、V 减少动力。A / D 转舵，边缘移屏，Home 返回本舰（本游戏镜头键）。</li><li>射击：先选择武器组与用途，左键锁定海图方向与仰角，空格开火。舰船移动或转向后仍保持原射击方向，不追踪原点击位置；再次左键才重新瞄准。手动舰炮 C 按全部→前→后选择炮组，Z 循环当前炮的可用弹种/用途，X 切换齐射/渐次；切换会停止按住开火，Z 后重新预瞄。两用炮对空使用 HE，与对舰共享备弹，无独立 AA 弹池。按住空格用于手动渐次射击；Ctrl 开关炮塔加速。自动组可在面板启停。C/Z/X 不用于鱼雷、航空或自动组。</li><li>战果：查看击沉、命中、伤害与剩余耐久。归港调整配装或重新整备再战。</li></ol><p>高级编队用于安排旗舰阵位；仅所选舰艇参与单机对决。</p><button type="button" id="journey-help-close">明白，返回</button></dialog>
    <dialog id="journey-abandon" aria-labelledby="abandon-title"><h2 id="abandon-title">结束本次演习？</h2><p>撤离不会生成胜负战报；本场主炮余弹返回港口显示。下次出击按规则重新整备。确认窗口打开时战斗暂停。</p><div class="journey-actions"><button type="button" id="abandon-cancel">继续战斗</button><button type="button" id="abandon-confirm">确认撤离</button></div></dialog>`;
  app.append(root);
  const node = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const help = node<HTMLDialogElement>('journey-help-dialog'), abandon = node<HTMLDialogElement>('journey-abandon');
  let current: Readonly<ApplicationState> | null = null, target: Screen = 'yard';
  let timer: ReturnType<typeof setTimeout> | null = null, remaining = 0;
  let previousConfig: ApplicationState['config'] = null, previousShip = '', previousScreen: Screen | null = null;
  const listeners: Array<() => void> = [];
  function on(element: EventTarget, event: string, handler: EventListener) {
    element.addEventListener(event, handler); listeners.push(() => element.removeEventListener(event, handler));
  }
  function attempt(action: () => void) {
    try { node('journey-alert').hidden = true; action(); }
    catch (error) { node('journey-alert').textContent = `无法出击：${error instanceof Error ? error.message : String(error)}`; node('journey-alert').hidden = false; }
  }
  function countdownLabel() {
    node('sortie-countdown').textContent = remaining ? `${remaining} 秒后出击 · 可取消倒计时` : '核对完成后确认出击。';
    node<HTMLButtonElement>('sortie-start').disabled = remaining > 0;
    node('sortie-cancel').hidden = !remaining;
  }
  function cancelCountdown() { if (timer !== null) clearTimeout(timer); timer = null; remaining = 0; countdownLabel(); }
  function navigate(screen: Screen) {
    cancelCountdown();
    if (current?.screen === 'battle' && !current.battle?.combat.result) {
      target = screen; if (!abandon.open) abandon.showModal(); node('abandon-cancel').focus(); return;
    }
    attempt(() => actions.navigate(screen));
  }
  root.querySelectorAll<HTMLElement>('[data-route]').forEach(button => on(button, 'click', event => {
    event.preventDefault(); navigate(button.dataset['route'] as Screen);
  }));
  for (const id of ['journey-help', 'home-help']) on(node(id), 'click', () => { cancelCountdown(); actions.cancelPending?.(); help.showModal(); node('journey-help-close').focus(); });
  on(node('journey-help-close'), 'click', () => help.close());
  on(node('abandon-cancel'), 'click', () => abandon.close());
  on(node('abandon-confirm'), 'click', () => { abandon.close(); attempt(() => actions.navigate(target)); });
  on(node('sortie-cancel'), 'click', cancelCountdown);
  on(node('sortie-retry'), 'click', () => attempt(actions.retry));
  on(node('sortie-start'), 'click', () => {
    if (current?.screen !== 'briefing' || remaining) return;
    remaining = current.config?.target ? content.rooms[current.config.target.roomId]!.countdown_s : 0;
    const tick = () => {
      timer = null;
      if (current?.screen !== 'briefing' || document.hidden) { cancelCountdown(); return; }
      if (remaining > 0) { countdownLabel(); timer = setTimeout(() => { remaining--; tick(); }, 1000); }
      else { cancelCountdown(); attempt(actions.launch); }
    };
    tick();
  });
  on(document, 'visibilitychange', () => { if (document.hidden) cancelCountdown(); });
  const format = (value: number) => value.toLocaleString('zh-CN');
  function facts(id: string, entries: Array<[string, string]>) {
    const list = node(id); list.replaceChildren();
    for (const [label, value] of entries) {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; row.append(dt, dd); list.append(row);
    }
  }
  function render(state: Readonly<ApplicationState>) {
    current = state;
    const changed = previousScreen !== state.screen;
    const detailsChanged = changed || previousConfig !== state.config || previousShip !== state.port.active.id;
    if (changed || previousConfig !== state.config) cancelCountdown();
    const names: Record<Screen, string> = { home: '司令部首页', yard: '港口 / 舰艇整备', briefing: '战前准备', battle: '海上对决', results: '战果报告', warzone: '高级战区 / 本地演习', prepare: '高级编队 / 本地布阵' };
    node('journey-location').textContent = names[state.screen];
    root.querySelectorAll<HTMLButtonElement>('nav [data-route]').forEach(button => {
      if (button.dataset['route'] === state.screen) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    root.querySelectorAll<HTMLElement>('[data-page]').forEach(page => { page.hidden = page.dataset['page'] !== state.screen; });
    if (detailsChanged && state.screen === 'briefing' && state.config) {
      const ship = content.ships[state.port.active.typeId]!, player = state.config.ships.find(s => s.side === 'player')!;
      const weapon = content.weapons[ship.main_weapon_id]!;
      node('briefing-ship').textContent = state.port.active.name;
      facts('briefing-loadout', [['定位', content.profiles[ship.id]!.role], ['舰体耐久', format(player.hp)], ['防雷防护', format(player.protection)], ['主武器', weapon.name], ['初始弹种', weapon.kind === 'gun' ? state.config.target?.groups.find(group => group.side === 'player' && group.slot === 'main')?.initialShellType ?? 'HE' : '不适用'], ['主武器配装', weapon.kind === 'aircraft' ? '航空组' : `${player.weapons.filter(w => w.installed).length} / ${ship.main_mounts} 炮位`], ['初始航速', `${ship.initial_speed_u_s} 单位/秒`]]);
      const barrels = player.weapons.filter(w => w.installed).reduce((sum, gun) => sum + gun.muzzles.length, 0);
      node('briefing-stock').textContent = weapon.kind === 'aircraft' ? `航空容量 ${ship.aircraft_capacity} 架 · 每局按规则重新整备，无主炮弹仓。` : `本次主炮备弹 ${weapon.ammo_per_barrel} 发/管 · ${barrels} 管共 ${format(barrels * weapon.ammo_per_barrel)} 发。每局重新整备；港口上一场余弹仅供回顾，不叠加旧双仓库存。`;
      const room = state.config.target ? content.rooms[state.config.target.roomId]! : content.rooms.duel!;
      facts('briefing-mission', [['演习方式', `单机 1 对 1 · 敌舰 ${state.port.active.name}`], ['地图尺度', `${state.config.layout.width} × ${state.config.layout.height} 单位`], ['初始间隔', `${state.config.layout.gap} 单位`], ['战斗时限', `${room.combat_limit_s} 秒`], ['出击倒计时', `${room.countdown_s} 秒`], ['规则版本', state.config.rulesVersion]]);
    }
    if (detailsChanged && state.screen === 'results' && state.battle) {
      const battle = state.battle, combat = battle.combat, p = combat.player;
      node('results-title').textContent = combat.result === 'victory' ? '战斗胜利' : combat.result === 'defeat' ? '战斗失利' : '演习平局';
      node('results-summary').textContent = `${state.port.active.name} · ${combat.result === 'victory' ? '敌舰已击沉，任务完成。' : combat.result === 'defeat' ? '本舰已沉没，返回港口调整战术。' : p.hp <= 0 && combat.enemy.hp <= 0 ? '双方舰艇均已沉没。' : '战斗时限已到，演习结束。'}`;
      facts('results-statistics', [['击沉敌舰', `${combat.enemy.hp <= 0 ? 1 : 0} 艘`], ['命中 / 发射', `${p.hits} / ${p.shots} 发`], ['命中率', `${p.shots ? Math.round(p.hits / p.shots * 100) : 0}%`], ['造成伤害', format(p.damage)], ['本舰剩余耐久', `${format(p.hp)} / ${format(p.maxHp)}`], ['战斗用时', `${(battle.tick / 30).toFixed(1)} 秒`]]);
    }
    if (changed) {
      if (help.open) help.close(); if (abandon.open) abandon.close();
      const heading = root.querySelector<HTMLElement>(`[data-page="${state.screen}"] h1`);
      heading?.focus();
    }
    previousScreen = state.screen; previousConfig = state.config; previousShip = state.port.active.id;
  }
  return { render, navigate, dialogOpen: () => help.open || abandon.open,
    status: () => current?.screen === 'briefing' && remaining ? `${remaining} 秒后出击` : '单机对决 · 舰队待命',
    dispose: () => { cancelCountdown(); help.close(); abandon.close(); for (const off of listeners) off(); root.remove(); } };
}
