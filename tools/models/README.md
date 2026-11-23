# 模型工具

## 原创八舰（无研究下载依赖）

统一视觉编辑源：[original-visuals.json](../../content/data/ships/original-visuals.json)。只维护其中 `editableFields` 列出的逐舰轮廓参数与说明，派生尺寸/武器节点/哈希由生成器刷新（可编辑字段单独哈希，避免派生哈希循环）；执行 `npm run generate:ships` 重建8个GLB、来源/许可/转换记录并更新运行清单。生成器读取目标数值，仅适配炮位，不修改游戏数值；真实舰轮廓仅为概括，自研配装不是史实复原。

```sh
node tools/models/generate-original-ships.mjs --verify
node tools/models/register-original-ships.mjs --verify
```

验证为逐字节比较，要求编辑源、生成器、数值输入、资产与来源记录一致。新模型不下载第三方几何或贴图，原创几何按CC BY 4.0署名 navyfield project contributors；Three.js自身保持MIT。注册器保留旧外部候选审计，`models.csv` 不用于原创运行绑定。

## 旧参考模型研究与转换

```powershell
npm run convert:yamato
npm run convert:ships
npm run index:models
```

转换器读取 research/models 中的原始下载，向 content/assets/ships 输出 GLB、当前转换报告、许可和来源副本；不联网，不改原始模型。

index-models 校验完整研究清单、原始下载 SHA-256 和运行文件，输出研究覆盖 CSV 与精简运行匹配 JSON。新增或修改来源清单后执行索引；原始下载不在新克隆中，需要自行恢复才能运行这些研究工具。
