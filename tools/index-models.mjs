import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOriginalData, nationNames } from '../src/original-data.ts';

const directory = fileURLToPath(new URL('../resources/models/', import.meta.url));
const catalog = JSON.parse(readFileSync(join(directory, 'catalog.json'), 'utf8'));
const data = parseOriginalData(JSON.parse(readFileSync(new URL('../resources/original-data/official-data.json', import.meta.url), 'utf8')));
const shipIds = new Set(data.ships.map(ship => ship.id));
const modelIds = new Set();
const models = catalog.models.map(model => {
  if (modelIds.has(model.id)) throw new Error(`重复模型编号：${model.id}`);
  if (!['integrated', 'downloaded', 'link_only'].includes(model.status)) throw new Error(`模型状态无效：${model.id}`);
  modelIds.add(model.id);
  for (const id of model.shipIds) {
    if (!shipIds.has(id)) throw new Error(`模型引用了不存在的舰型：${id}`);
  }
  const source = model.sourceFile
    ? JSON.parse(readFileSync(join(directory, model.sourceFile), 'utf8')) : model;
  const files = source.downloadedFiles ?? [];
  if (model.status !== 'link_only' && !files.length) throw new Error(`模型没有下载文件记录：${model.id}`);
  for (const file of files) {
    const path = join(directory, dirname(model.sourceFile), file);
    if (!existsSync(path)) throw new Error(`下载文件缺失：${path}`);
    if (source.sha256?.[file]) {
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      if (hash !== source.sha256[file]) throw new Error(`模型校验值不符：${path}`);
    }
  }
  if (model.status === 'integrated' && (!model.runtimeFile || !existsSync(join(directory, model.runtimeFile)))) {
    throw new Error(`已接入模型的运行文件缺失：${model.id}`);
  }
  return { ...model, source: source.source, author: source.author, license: source.license, files };
});

const labels = { integrated: '已接入', downloaded: '已下载，未接入', link_only: '仅有来源链接，未下载' };
const rows = [['舰型编号', '显示名称', '原始名称', '国家', '进度', '模型来源编号', '作者', '页面许可', '来源链接', '备注']];
let matched = 0;
let downloaded = 0;
for (const ship of data.ships) {
  const matches = models.filter(model => model.shipIds.includes(ship.id));
  if (matches.length) matched++;
  if (matches.some(model => model.status !== 'link_only')) downloaded++;
  const joinField = field => matches.map(model => model[field] ?? '未核实').join(' | ');
  rows.push([ship.id, ship.name, ship.originalName, nationNames[ship.nation],
    matches.length ? matches.map(model => labels[model.status]).join(' | ') : '当前清单尚无已匹配来源',
    joinField('id'), joinField('author'), joinField('license'), joinField('source'), joinField('notes')]);
}
const csv = '\uFEFF' + rows.map(row =>
  row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
writeFileSync(join(directory, 'ship-model-coverage.csv'), csv + '\r\n');
console.log(JSON.stringify({ ships: data.ships.length, matched, downloadedOrSharedReference: downloaded,
  integratedModels: models.filter(model => model.status === 'integrated').length,
  newlyDownloadedModels: models.filter(model => model.status === 'downloaded' && model.sourceFile !== 'yamato-1945\\source.json').length }));
