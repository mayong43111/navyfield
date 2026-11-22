# 内容读取适配器

- legacy-data：官网兼容字段、单位与舰型解析。
- ship-catalog：模型匹配清单读取与校验。
- world-land：世界 GeoJSON 读取与结构校验。
- resource-loader：HTTP 分段、压缩传输和进度。

这些模块不导入场景或 DOM。模型节点与 GLB 解码位于 presentation/ships，地图绘制位于 presentation/world；根目录旧入口仅保留兼容转发，不维护第二套实现。

resource-loader 负责浏览器 HTTP 传输与 JSON 解码，不依赖 Three.js、DOM 或模拟状态。

大文件按 256KiB HTTP Range 分段下载，每文件最多两个分段任务，所有资源共享最多两个实际请求的先进先出队列；核对 Content-Range、字节数和 ETag 后组装原始 ArrayBuffer。不支持分段的 HTTP 200 响应和内联 data URL 仍正常读取。30秒超时从取得请求槽后开始，排队不计入网络超时；失败中止同资源的其他请求并保留具体错误原因。

subscribeContentProgress 提供文件级收到/总字节数，加载界面订阅后应在完成或失败时取消订阅。GLB 解码仍由 Three.js 表现边界负责，JSON 的字段校验仍由现有解析器负责；当前没有冒充已完成规范化内容定义。

GLB 和大型 JSON 的传输副本由 npm predev/prebuild 无损 gzip 生成，命名为 .gz.bin；以二进制载荷传输，避免静态服务器自动设置 Content-Encoding 导致分段数据被提前解压。浏览器组装后使用 DecompressionStream 恢复原始字节再解码。源 GLB/JSON 仍是唯一运行内容真值；生成副本不入 Git，不改几何、数值或许可。

连接重置、分段超时及暂时性 CDN 错误最多尝试三次，重试同一字节范围，记录明确警告并退避。404、非法分段、长度/版本变化和解压错误不重试；最终失败仍明确终止，不返回占位内容。

超时按实际流读取判断：连续 30 秒没有响应或新字节才超时，稳定慢速传输不会在第 30 秒被强制重启；每次请求另有两分钟绝对上限，避免无限占用下载槽位。
