# 运行内容

游戏只从本工作区加载已审核内容，不依赖 research、art、audio 或 prototypes。

- [data](data/README.md)：兼容数据和地图。
- [assets](assets/README.md)：GLB 等运行资产。
- [schemas](schemas/README.md)：未来规范化格式的校验定义。
- [manifests](manifests/README.md)：生成的匹配清单。

当前包括统一[舰船目标运行数值](data/ships/target.json)、[原创视觉编辑源](data/ships/original-visuals.json)、8艘自研低模与4艘既存参考GLB、旧格式兼容JSON、世界陆地GeoJSON和来源/许可。目标数值由CSV导出并由领域解析器校验；原创低模为历史概括而非精确复原，模型原始STL/3MF/ZIP仅在研究区。4现有模型上游权利仍待核，清单不代表全部清权。音频内容尚未实施，实际范围见[运行说明](../docs/game-design/runtime-target.md)。

Git 采用逐文件白名单，新增文件不会自动获准发布。修改许可或资产范围时同步更新根 .gitignore 和发布测试。Vite 只打包静态引用的文件，额外仅复制白名单署名，不递归复制本目录。
