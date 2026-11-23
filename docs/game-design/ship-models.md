# 真实舰名、原创低模与外部候选核实

## 当前运行：8原创 + 4旧参考

两轮检索没有取得8舰合法可用的外部文件。用户确认后，自研低模已补齐岛风、弗莱彻、克利夫兰、布鲁克林、希佩尔、阳炎、最上和独立CVL-22。它们有不同船体、舰桥、烟囱与甲板轮廓，但只是一般历史特征概括，不是精确年代/个舰复原；炮位依目标版减装，弗莱彻两用主炮仍为手动，不误归入自动AA。

[统一视觉源](../../content/data/ships/original-visuals.json) → [程序化生成器](../../tools/models/generate-original-ships.mjs) → `content/assets/ships/<key>/` 的GLB及来源/许可 → [注册器](../../tools/models/register-original-ships.mjs) → [运行清单](../../content/manifests/ship-model-catalog.json)。原创8舰署名 navyfield project contributors，CC BY 4.0；无第三方网格/贴图。主炮动作、辅助炮/鱼雷朝向和起降挂点已适配；辅助后坐、甲板起降动画与浏览器视觉验收仍待后续，详见[运行说明](runtime-target.md)。

大和、俾斯麦、加利福尼亚和约克镇保持既存GLB与原署名；上游权利待核并未解决。以下外部候选表及`models.csv`保留原下载审计，不能当作当前8舰原创模型来源；运行清单的`previousCandidate`隔离保留此前记录。

核实日期：2026-11-23。此次按用户要求实际尝试获取其余8艘，**不付费、不登录、不绕过限制，不改动现有4艘模型及其许可文件**。舰名绑定与授权记录的编辑真值是[models.csv](../../design-data/source/models.csv)，舰名/主炮配置是[ships.csv](../../design-data/source/ships.csv)。所有候选都有具体作品链接，不采用版权未知游戏提取物或任意同级舰占位。

## 0. 本次实际获取结果

**新增模型下载0/8，新增运行GLB 0/8；仍只有4种真实舰GLB，不是12艘模型已齐。** 对8个作品分别获取了公开元数据（HTTP 200），逐项确认CC BY 4.0；逐项请求官方匿名下载端点`https://api.sketchfab.com/v3/models/<ID>/download`，全部返回HTTP 401、`Authentication credentials were not provided.`。`isDownloadable=true`表示网站提供下载功能，**不表示无需登录**。没有读取viewer内部几何、猜测CDN档案地址、提取令牌或伪造凭据。

审计原始公开元数据、逐舰结果、元数据SHA-256、现有GLB SHA-256与节点层级保存在[research/models/acquisition-2026-11-23/audit-report.json](../../research/models/acquisition-2026-11-23/audit-report.json)及各舰`public-metadata.json`、`audit.json`。元数据的哈希不是模型文件哈希：8艘源模型及运行资源字段均为null，下载文件列表为空，不建立空GLB或冒充落盘。作者KTKloss公开[API档案](https://api.sketchfab.com/v3/users/d15c9ddb60ce463889e37415a459e725)未提供外部个人网站；公开作品说明未提供无登录的作者原包。检索未找到可同时确认同源、准确个舰、可分发许可和无登录下载的替代渠道；这不证明其他渠道不存在。

运行清单[ship-model-catalog.json](../../content/manifests/ship-model-catalog.json)的`targetModels`专门记录当前12个自研舰id，保留`models`中的旧nf舰id索引，二者不能混用。8个候选`runtimeAsset=null`、`status=link_only`、`acquisitionStatus=blocked_login`，不是已接入模型。模型不足时，游戏只能明确显示程序化/抽象外形或资源缺失，不能以其他真实舰模型冒充。旧`index-models.mjs`重新生成历史nf索引时现在保留独立`target*`字段，避免抹掉当前12舰审计结论；没有将12个新id错误放入旧版官方舰型数据库。

复现公共端点审计（从仓库根目录，使用已有workspace虚拟环境）：`../.venv/bin/python3 tools/models/audit-public-candidates.py`。脚本只获取公开JSON和官方匿名下载接口状态，不下载模型、保存成功接口的临时签名URL或修改既存GLB。此次没有转换输入，因此未安装任何新依赖，也未运行会覆盖现有4艘的`convert:ships`/`convert:yamato`。离线校验通过：12个清单id与`ships.csv`完全一致；8份元数据SHA-256匹配；4个GLB文件哈希未变且自包含；现有GLB数量仍为4。按scene实例计数的三角面分别为California 149397、Bismarck 90286、Yamato 127302、Yorktown 133897（California复用mesh，唯一mesh三角面为127133）；新增源模型和运行模型均为0。

## 1. 十二舰清单

| 定位 | 真实舰名 | 精确模型来源 | 作者/原格式 | 公开许可 | 状态与风险 |
|---|---|---|---|---|---|
| 高速斥候DD | 岛风 Shimakaze | [Japanese destroyer Shimakaze](https://sketchfab.com/3d-models/japanese-destroyer-shimakaze-b60b06b56f1a405e8f91070dc726975d) | kriss50 / GLB | CC BY 4.0 | 官方匿名下载401；未下载；说明指向二战唯一岛风；制作来源未说明；112147三角面 |
| 速射护航DD | 弗莱彻 USS Fletcher DD-445 | [USS Fletcher – Model for 1/4000](https://sketchfab.com/3d-models/uss-fletcher-model-for-14000-82aa255d14284bcfba6333a88f9e7321) | KTKloss / OBJ | CC BY 4.0 | 官方匿名下载401；未下载；自制同级识别简模；2536三角面；DD-445个舰改装未核实 |
| 机动压制CL | 克利夫兰 USS Cleveland CL-55 | [USS Cleveland – Model fpr 1/4000 printing](https://sketchfab.com/3d-models/uss-cleveland-model-fpr-14000-printing-da03808e0aa74ca89a237ce4da2ac29e) | KTKloss / OBJ | CC BY 4.0 | 官方匿名下载401；未下载；自制同级识别简模；9473三角面；CL-55个舰改装未核实 |
| 远程支援CL | 布鲁克林 USS Brooklyn CL-40 | [USS Brooklyn](https://sketchfab.com/3d-models/uss-brooklyn-e4fddf42c2824836a20eb9b5e2de44f1) | kriss50 / GLB | CC BY 4.0 | 官方匿名下载401；未下载；说明明确CL-40；上游待核；181968三角面需减面 |
| 穿甲重巡CA | 希佩尔海军上将 Admiral Hipper | [KMS Hipper – Model for 1/4000 printing](https://sketchfab.com/3d-models/kms-hipper-model-for-14000-printing-c8a2086402ae47bb90b449526b0b9e17) | KTKloss / OBJ | CC BY 4.0 | 官方匿名下载401；未下载；作者明确自制且只描绘Hipper，排除Prinz Eugen；6588三角面；目标主炮4×2，几何未检查 |
| 密集齐射BB | 加利福尼亚 USS California BB-44 | [RC suitable USS California BB-44](https://www.thingiverse.com/thing:5239831) | MDSW / 3MF、STL | CC BY 4.0 | [本地GLB](../../content/assets/ships/california/california.glb)已有；1944重建型；本地复制炮管修改应保留说明，上游权利链待补 |
| 机动快装填BB | 俾斯麦 Bismarck | [RC suitable German Battleship Bismarck](https://www.thingiverse.com/thing:5241416) | MDSW / 3MF、STL | CC BY 4.0 | [本地GLB](../../content/assets/ships/bismarck/bismarck.glb)已有；TheFoxInTheBox母本链接/许可需补核，不冒充Tirpitz |
| 远程重弹BB | 大和 Yamato | [RC Suitable Yamato Battleship 1:250](https://www.thingiverse.com/thing:6251126) | MDSW / 3MF、STL、ZIP | CC BY-SA 4.0 | [本地GLB](../../content/assets/ships/yamato/yamato.glb)已有；1945母本RC衍生外形；母本及附加部件链待核 |
| 近程雷击DD | 阳炎 Kagerō | [Low poly kagero Destroyer](https://sketchfab.com/3d-models/low-poly-kagero-destroyer-3cbb00e8502a4d12b57539744e96ca7d) | leoxbom / GLB | CC BY 4.0 | 官方匿名下载401；未下载；16368三角面；制作说明为空，首舰身份和上游权利链未核实 |
| 远程封锁CA | 最上 Mogami | [IJN Mogami – Model for 1/4000 printing](https://sketchfab.com/3d-models/ijn-mogami-model-for-14000-printing-89ccafb8c0884b868d806d7654f0fa71) | KTKloss / OBJ | CC BY 4.0 | 官方匿名下载401；未下载；自制同级识别简模；5614三角面；个舰与改型未核实，不能标1944航空巡洋舰型 |
| 重型波次CV | 约克镇 USS Yorktown CV-5 | [RC Scale USS YORKTOWN CV-5](https://www.thingiverse.com/thing:5336549) | MDSW / STL、3MF | CC BY 4.0 | [本地GLB](../../content/assets/ships/yorktown/yorktown.glb)仅外观；不是CV-10；TheFoxInTheBox母本及舰载机许可独立待核 |
| 快周转轻CV | 独立 USS Independence CVL-22 | [USS Independence – Model for 1/4000 printing](https://sketchfab.com/3d-models/uss-independence-model-for-14000-printing-ec30b6bdd81e4a3292685933b9f4ea13) | KTKloss / OBJ | CC BY 4.0 | 官方匿名下载401；未下载；自制二战同级识别简模；2860三角面；排除LCS-2但CVL-22个舰改装未核实 |

**准确数量：4种既存GLB外形＋8个未下载候选，不是12艘已下载、已接入或已全部清权。** 本任务只核查模型资源，不修改游戏战斗能力；约克镇既存资源仅静态外观，载入不意味着已有舰载机机制。索引里的yamato-1945复用既存模型，不另算第五种。

### 运行资源与载入结构（四个GLB均未改动）

| 自研舰id | 运行资源 | 根节点 | 可拆分主炮层级 | 文件SHA-256 |
|---|---|---|---|---|
| `california` | `content/assets/ships/california/california.glb` | `Ship` | 4座×3管 | `1718958064e22ab88db06138f64cc73d26ba15401b7190c0e1fc1989f373d6ad` |
| `bismarck` | `content/assets/ships/bismarck/bismarck.glb` | `Ship` | 4座×2管 | `a320f1501ab978766aa3103d9b15c10fc580c10ffef0671ee611efaf6e62f9b6` |
| `yamato` | `content/assets/ships/yamato/yamato.glb` | `Yamato` | 3座×3管 | `532c6e31236d045e8f55b304b2291ed999832d7ecfd2bb7e158bd4f44e575039` |
| `yorktown` | `content/assets/ships/yorktown/yorktown.glb` | `Ship` | 无可转炮座/独立炮管节点 | `0a73157188ac0d69329c0eaaf268617981c99671724eb240183283f63b85ad7a` |

均为GLB v2、自包含二进制buffer，无外部材质/贴图依赖，使用GLTFLoader读取`gltf.scene`。三艘BB的节点模式为`Turret-i`（绕局部Y转向）→`Elevation-i`（绕局部X俯仰）→`Barrel-i-j`（局部Z位移后坐）→`Tube`与`Muzzle-i-j`；根坐标Y向上、Z沿舰身、炮管局部+Z为发射方向。节点均经JSON/二进制chunk、bufferView界限、scene图和三角形数检查；这里只验证节点可操纵性，不宣称本次已运行战斗动画或已适配副炮。烟囱名称及各节点原始transform见审计报告。

以下仅为接入原创低模之前的外部候选审计，不描述当前运行绑定。8艘外部候选的对应id为`scout_dd`岛风、`escort_dd`弗莱彻、`fast_cl`克利夫兰、`support_cl`布鲁克林、`heavy_ca`希佩尔、`torpedo_dd`阳炎、`torpedo_ca`最上、`light_cv`独立。**它们都没有运行资源路径，不能交给GLTFLoader载入，炮座可转情况未知。** 弗莱彻DD-445、克利夫兰CL-55、最上具体改型和独立CVL-22目前只有题名指向个舰、说明按同级识别图自制；未检查原模型不能证明精确个舰改装。希佩尔作者明确排除Prinz Eugen；岛风说明指向二战唯一岛风，布鲁克林说明明确CL-40；阳炎描述为空，仅题名kagero，连首舰身份也未核实。

## 2. 下载与许可的核实口径

Sketchfab候选本次使用官方公开API`https://api.sketchfab.com/v3/models/<ID>`核实许可、作者、题名、说明及`isDownloadable`；官方匿名下载接口8/8返回401。公开元数据并不是下载包，格式沿用此前调查，不宣称已核实实际包内结构、材质、炮座、炮口或年份变体。五个KTKloss候选声明用US Navy recognition manual自制识别简模，游戏再分发适用CC BY 4.0；其余三个没有制作权利链说明，仍为`upstream_unverified`。全部公开元数据的`animationCount=0`也不能证明源文件是否可人工拆炮座。KTKloss的`noai`标签记录在审计元数据中，不影响本任务依据CC BY进行游戏用途许可核对；未将模型下载或用于生成式训练。

Thingiverse四个作品页许可此前已读取，现有`source.json`与`LICENSE.txt`保留了署名和修改信息；本次能获取的页面正文只有标题、脚本页未呈现完整许可，直接匿名页面读取403。因此本次**没有新增上游清权结论**。四个本地GLB存在且结构/哈希验证通过；原始下载目前不在`research/models`，已有记录的原件SHA-256不能被当成本次重新验证原件。此前原文件HEAD请求403，不能保证现在可重新下载；也不能把既存GLB推定为全部上游授权已齐。

- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)允许商业使用、修改和再分发，但需要原作者署名、原链接、许可链接、修改说明，不得额外限制许可赋予的权利。
- [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)还要求修改后的模型继续采用同许可；不是自动要求整个游戏源代码采用BY-SA。大和的[1945母本](https://www.thingiverse.com/thing:3445642)由PiotruchaWro发布，页面CC BY 4.0；MDSW衍生为BY-SA，附加部件作者M-Miller-97和MotherbrainJr的权利链仍待核。
- `author_declared_original`只表示作者声明自制且公开许可相符，不是法律保证；`upstream_unverified`表示许可标签已知、上游权利尚有缺口。**许可标签、权利链、下载成功、运行就绪必须分开记录。**

## 3. 排除的候选与重巡改名

经用户确认，重巡由原拟名巴尔的摩改为希佩尔，主炮从3×3改为4×2；基础203级炮伤/装填未改，重新生成全部对照。排除来源：

- [Baltimore / outpiston](https://sketchfab.com/3d-models/uss-baltimore-e0920b3dea044ba4938200fef0c1e0da)标CC BY-NC-SA 4.0，且制作来源不明，不作为已获商业许可资产。
- [Baltimore (War Thunder)](https://sketchfab.com/3d-models/uss-baltimore-war-thunder-954bae6bd1bb4a4a964614d78e69d2b3)明确游戏资产；无原权利人许可不采用。
- [Cleveland高细节转传](https://sketchfab.com/3d-models/uss-cleveland-cl-55-6267ab80b28745a68d6d1357e1e0543a)虽然标CC BY，但所指ThomasBeerens原作当前[官方记录](https://api.sketchfab.com/v3/models/c6bf18cd13d84b78b366954b779b5924)为Standard且不可下载；没有历史授权凭证不采纳转传标签。
- [Mogami游戏提取候选](https://sketchfab.com/3d-models/ijn-mogami-d5627788c9474d66b64d31abac3d7744)指向p3dm游戏资产站，不采用；清单使用KTKloss自制版。

## 4. 模型与自研配装不是同一真值

这些舰名是外形参考，不把HP、u/s航速、抽象装甲和炮伤当史实。现有目标岛风/阳炎3座单管、弗莱彻4座单管、克利夫兰3座三联装、布鲁克林4座双联装、最上3座双联装属于自研减装/改装，**并不与未经适配的历史模型炮口天然一致**。希佩尔已按用户要求改4座双联装，其余目标配置暂不擅自改动；差异与适配事项逐行写入模型CSV。

v1.2.2仅削减三艘BB的对舰副炮：加利福尼亚4座单管、俾斯麦4座双联、大和2座双联；CA/CV不变。模型几何未修改，不能按外观炮管数直接生成火力；大和已有三联副炮外形与双联数值不一致，须明确停用多余炮管或另做外形适配，主炮仍为3座三联。

此前外部候选审计时，v1.3.0弗莱彻仍为原4管主炮，只新增手动两用能力；该外部模型未下载也未修改（当前已接入另一份原创低模）。75°目标仰角、炮口/转轴层级、对空瞄准与引信效果需要适配，不能声称识别简模已支持高射动画。BB主炮/副炮/小口径AA须按物理组建立节点，自动/手动只是控制策略；BB大口径两用/重防空尚未设计，不凭外观自动生成另一份AA管数。详见[炮位、能力与控制](weapon-controls.md)。

后续接入顺序：补授权链 → 获取原件及校验哈希 → 核实真实外形/炮塔数量与改型 → 明确选择保留自研减装或重新配装并重算 → 减面/单位/坐标转换 → 建立主炮、副炮、AA与起降点语义节点 → 检查炮口/转动轴/遮挡/全舰预算 → TypeScript内容契约测试与30Hz回归。不能只换舰名就宣称模型、数值和炮口契约已经完全一致。
