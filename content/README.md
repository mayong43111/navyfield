# 运行内容

游戏只从本工作区加载已审核内容，不依赖 research、art、audio 或 prototypes。

- [data](data/README.md)：兼容数据和地图。
- [assets](assets/README.md)：GLB 等运行资产。
- [schemas](schemas/README.md)：未来规范化格式的校验定义。
- [manifests](manifests/README.md)：生成的匹配清单。

当前为四艘 GLB、官网旧格式 JSON、世界陆地 GeoJSON 和必需来源/许可。GLB 是运行导出物，原始 STL/3MF/ZIP 仅在研究区；schema、规范数值和音频内容尚未实施。

Git 采用逐文件白名单，新增文件不会自动获准发布。修改许可或资产范围时同步更新根 .gitignore 和发布测试。Vite 只打包静态引用的文件，额外仅复制白名单署名，不递归复制本目录。
