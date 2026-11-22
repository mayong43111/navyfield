# 数据工具

```powershell
node tools\data\fetch-original-data.mjs <cache-directory>
```

现有采集器需要官网抓取缓存，输出研究原始 JSON/CSV，并同步 official-data.json 到 content/data/legacy；网络失败遵循现有失败记录，不伪造数据。

目录迁移不要求重新抓取。未来自研 CSV → JSON + Schema 校验工具归入这里；目前尚未实现规范化导出，不将研究 CSV 自动发布或搬成自研表格。
