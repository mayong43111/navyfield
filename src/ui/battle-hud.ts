import { element } from '../ui.ts';
import type { NavigationState, Observation } from '../domain/battle.ts';
import { gaugeArtwork, enginePanelArtwork, mapFrameArtwork, tdaLampArtwork } from './instrument-art.ts';

export function createBattleHud() {
  const app = element('app', HTMLElement), resultPanel = element('battle-result', HTMLElement);
  const healthText = app.querySelector<HTMLElement>('.health > span');
  const healthMeter = app.querySelector<HTMLElement>('.hull-track'), healthFill = healthMeter?.querySelector<HTMLElement>('i');
  if (!healthText || !healthMeter || !healthFill) throw new Error('Missing hull durability display');
  const protectionMeter = element('protection', HTMLDivElement);
  const protectionFill = protectionMeter.querySelector<HTMLElement>('i'), protectionText = protectionMeter.querySelector<HTMLElement>('small');
  if (!protectionFill || !protectionText) throw new Error('Missing bulge protection display');
  const enemyHealth = element('enemy-health', HTMLElement), kills = element('combat-kills', HTMLElement);
  const accuracy = element('combat-accuracy', HTMLElement), damageReadout = element('combat-damage', HTMLElement);
  const speed = element('speed', HTMLElement), heading = element('heading', HTMLElement), throttle = element('throttle', HTMLElement);
  const battleSpeed = element('battle-speed', HTMLElement), battleHeading = element('battle-heading', HTMLElement);
  const enginePower = element('engine-power', HTMLElement), enginePowerNeedle = element('engine-power-needle', HTMLElement);
  const powerLever = element('power-lever', HTMLElement), reloadLabel = element('reload', HTMLElement);
  const headingNeedle = element('heading-needle', HTMLElement), speedNeedle = element('speed-needle', HTMLElement);
  const knotsNeedle = element('knots-needle', HTMLElement), reloadNeedles = document.querySelectorAll<HTMLElement>('.reload-needle');
  const tdaButton = element('tda', HTMLButtonElement);
  const powerDial = enginePowerNeedle.parentElement, enginePanel = powerDial?.parentElement;
  const mapPanel = element('minimap', HTMLCanvasElement).parentElement;
  if (!powerDial || !enginePanel || !mapPanel) throw new Error('Missing navigation instrument panels');
  powerDial.insertAdjacentHTML('afterbegin', gaugeArtwork('power', 'engine-power'));
  enginePanel.insertAdjacentHTML('afterbegin', enginePanelArtwork());
  mapPanel.insertAdjacentHTML('beforeend', mapFrameArtwork()); tdaButton.insertAdjacentHTML('beforeend', tdaLampArtwork());
  function durability(current: number, maximum: number): void {
    healthText!.textContent = `${current.toLocaleString('zh-CN')} / ${maximum.toLocaleString('zh-CN')}`;
    healthMeter!.setAttribute('aria-valuemax', String(maximum)); healthMeter!.setAttribute('aria-valuenow', String(current));
    healthFill!.style.width = `${current / maximum * 100}%`;
  }
  function protection(current: number, maximum: number): void {
    protectionMeter.setAttribute('aria-valuemax', String(Math.max(1, maximum)));
    protectionMeter.setAttribute('aria-valuenow', String(current));
    protectionFill!.style.width = `${maximum > 0 ? current / maximum * 100 : 0}%`;
    protectionText!.textContent = maximum > 0
      ? `防雷装甲 ${current.toLocaleString('zh-CN')} / ${maximum.toLocaleString('zh-CN')}` : '防雷装甲：未配置';
  }
  function battle(observation: Observation): void {
    const combat = observation.combat;
    durability(combat.player.hp, combat.player.maxHp); protection(combat.player.protection, combat.player.maxProtection);
    enemyHealth.textContent = `${combat.enemy.hp.toLocaleString('zh-CN')} / ${combat.enemy.maxHp.toLocaleString('zh-CN')}`;
    kills.textContent = combat.enemy.hp <= 0 ? '1' : '0';
    accuracy.textContent = `${combat.player.shots ? Math.round(combat.player.hits / combat.player.shots * 100) : 0}%`;
    damageReadout.textContent = combat.player.damage.toLocaleString('zh-CN');
    if (combat.result && observation.resultSeconds > 5 && resultPanel.hidden) {
      element('battle-result-title', HTMLElement).textContent =
        combat.result === 'victory' ? '战斗胜利' : combat.result === 'defeat' ? '战斗失利' : '双方沉没';
      element('battle-result-stats', HTMLElement).textContent =
        `击沉 ${combat.enemy.hp <= 0 ? 1 : 0} 艘 · 命中 ${combat.player.hits} / ${combat.player.shots} 发\n造成伤害 ${combat.player.damage.toLocaleString('zh-CN')}\n剩余耐久 ${combat.player.hp.toLocaleString('zh-CN')}`;
      resultPanel.hidden = false; element('battle-result-exit', HTMLButtonElement).focus();
    }
  }
  function navigation(state: Readonly<NavigationState>, yard: boolean,
    guns: readonly { reload: number; reloadSeconds: number }[], maxSpeed: number): void {
    speed.textContent = state.speed.toFixed(1); battleSpeed.textContent = speed.textContent;
    heading.textContent = `${String(Math.round((state.heading * 180 / Math.PI + 360) % 360)).padStart(3, '0')}°`;
    battleHeading.textContent = `航向 ${heading.textContent}`;
    throttle.textContent = `${Math.round(state.throttle * 100)}%`; enginePower.textContent = throttle.textContent;
    enginePowerNeedle.style.transform = `rotate(${-130 + Math.abs(state.throttle) * 260}deg)`;
    powerLever.style.top = `${8 + (1 - state.throttle) / 1.3 * 23}px`;
    const reload = Math.max(0, ...guns.map(g => g.reload));
    reloadLabel.textContent = yard ? '停泊' : reload > 0 ? `${reload.toFixed(1)} 秒` : '就绪';
    headingNeedle.style.transform = `rotate(${state.heading * 180 / Math.PI}deg)`;
    speedNeedle.style.transform = `rotate(${-130 + Math.abs(state.throttle) * 260}deg)`;
    knotsNeedle.style.transform = `rotate(${-130 + Math.abs(state.speed) / maxSpeed * 260}deg)`;
    reloadNeedles.forEach((needle, index) => {
      const gun = guns[index];
      if (gun) needle.style.transform = `rotate(${-130 + (1 - gun.reload / gun.reloadSeconds) * 260}deg)`;
    });
  }
  return { resultPanel, tdaButton, enginePanel, mapPanel, durability, protection, battle, navigation };
}
