# 运行数据

- [ships/target.json](ships/target.json)：统一12舰目标运行数值，由CSV导出；舰体/武器/装甲/控制/模式/房间共用一个校验内容合同，不手改。
- [ships/original-visuals.json](ships/original-visuals.json)：8艘原创低模统一视觉编辑源；只编辑 `editableFields`，数值尺寸、武器节点与资产哈希由生成器刷新，不修改游戏数值。
- [legacy](legacy/README.md)：官网字段兼容 JSON，仅保留旧规则/资料适配。
- [maps](maps/README.md)：世界陆地 GeoJSON 和公共领域来源。

未来规范化舰船、武器、弹药、装备、规则、任务和本地化使用 JSON + Schema，按实际内容建立分类。

当前目标路径加载CSV导出的JSON，官网字符串字段不再决定目标战斗；旧兼容路径继续保留。用 `python tools/balance/export-runtime.py` 生成，追加 `--verify` 核验，步骤见[数值说明](../../design-data/README.md)。运行数据禁止作为第二份手工编辑真值。
