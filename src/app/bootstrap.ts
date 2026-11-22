import { element } from '../ui.ts';
import { startApplication } from './runtime.ts';
import { subscribeContentProgress } from '../adapters/content/resource-loader.ts';
import { loadGameContent } from './content.ts';

export async function bootstrap(): Promise<void> {
  const canvas = element('scene', HTMLCanvasElement);
  const status = element('status', HTMLParagraphElement);
  const error = element('error', HTMLDivElement);
  const report = (message: string) => {
    console.error(message); error.hidden = false; error.textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.textContent = '重试载入';
    retry.addEventListener('click', () => window.location.reload());
    error.append(document.createElement('br'), retry);
  };
  window.addEventListener('error', event => report(`运行错误：${event.message}`));
  window.addEventListener('unhandledrejection', event => report(`异步错误：${String(event.reason)}`));
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); report('WebGL 上下文已丢失，请刷新页面。');
  });
  const unsubscribe = subscribeContentProgress(progress => {
    const name = progress.url.split('/').pop() ?? '资源';
    status.textContent = `舰队整备中… ${name} · ${(progress.received / 1024).toFixed(0)} / ${(progress.total / 1024).toFixed(0)} KiB`;
  });
  status.textContent = '舰队整备中…';
  try { startApplication(canvas, status, await loadGameContent()); }
  catch (reason) { report(`无法载入舰船或启动三维场景：${String(reason)}`); }
  finally { unsubscribe(); }
}
