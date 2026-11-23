# 开发工具

- [models](models/README.md)：离线模型导入、导出与清单校验。
- [data](data/README.md)：官网资料采集及兼容运行数据同步。
- [balance/run.py](balance/run.py)：独立目标数值CSV校验、规范化JSON、固定种子蒙特卡洛/对射、自动副炮绕行/逐机小口径防空、手动两用主炮预瞄/引信/球爆对照和房间/其他机制报告，执行方式见[数值说明](../design-data/README.md)；不写入当前运行内容。
- [balance/controls.py](balance/controls.py)：独立炮组操作/资源状态回放，复用两用主炮逐管状态与自动组状态；`python tools/balance/controls.py`生成报告，追加`--verify`逐字节验证。支持选组/单座、用途/弹种、齐射/渐次、自动启停，不模拟按键、瞄准与弹道，也不接管航空/鱼雷；规则见[操作设计](../docs/game-design/weapon-controls.md)。
- [balance/export-runtime.py](balance/export-runtime.py)：从10张数值CSV生成统一 `content/data/ships/target.json`，追加 `--verify` 检查逐字节一致；排除模型审计/实验表，不把视觉模型或官网数据当运行真值。当前目标应用加载此JSON，见[运行说明](../docs/game-design/runtime-target.md)。
- [audio](audio/README.md)：未来音频加工。
- [packaging](packaging/README.md)：当前 Web 打包边界与后续工具归属。

命令从项目根目录运行。游戏运行和普通构建不需要本地研究原件；重新转换/索引需要原始下载，缺失时明确报错，不自动补网络下载。

工具输出到 content、research 或本地缓存，不手工修改 dist。新增工具遵循来源、许可、单位与输入校验约定，不复制正式模拟公式。
