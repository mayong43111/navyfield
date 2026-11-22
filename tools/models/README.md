# 模型工具

```powershell
npm run convert:yamato
npm run convert:ships
npm run index:models
```

转换器读取 research/models 中的原始下载，向 content/assets/ships 输出 GLB、当前转换报告、许可和来源副本；不联网，不改原始模型。

index-models 校验完整研究清单、原始下载 SHA-256 和运行文件，输出研究覆盖 CSV 与精简运行匹配 JSON。新增或修改来源清单后执行索引；原始下载不在新克隆中，需要自行恢复才能运行这些研究工具。
