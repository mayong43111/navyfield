# 打包工具

prepare-content.mjs 在 npm predev/prebuild 时生成四舰 GLB、官网 JSON 与地图的无损 gzip 传输副本；也可从项目根执行 `npm run prepare:content`。源文件不修改，生成副本不签入。

当前 Web 构建仍由根 vite.config.mjs 和 GitHub Actions 管理：Vite 打包实际静态引用，插件仅复制必需署名。不得递归复制 research、art、audio 或全部 content，也不得在 dist 手改资产。
