# UTA 安卓与电脑端数据协议对接说明

文档日期：2026-10-22。适用对象：Windows / Electron 客户端开发者。文档修订：6（更新 Android 1.6.0 发行基准；字段沿用修订5的人工注音保护、最小复习条目及多句单元规则）。

<!-- 修订5描述1.5.2之后尚未发布的本地开发代码；以下规则随1.6.0发行。 -->
> **实施基准**：本文描述 Android **1.6.0** / `android-dev` 分支的数据格式，包含原始音频独立存储、多句复习单元及人工注音保护。**Android 1.5.2 及更早 APK 不使用本文的新云格式**。请读取文件中的协议版本，不要仅凭应用版本号判断格式；Windows 仍需适配并共同验收。
>
> 本次按产品要求不再维护旧云备份兼容性。新格式为：**外层云快照 v3、歌曲目录 v2、内层学习核心 v1**。电脑端按本协议适配，两端使用支持此格式的构建后再进行互通验收。

## 1. 对接目标与当前范围

希望达到以下效果：

1. 两端访问用户配置的同一个 WebDAV 目录，读取对方生成的快照。
2. 同一份音频只按原始文件内容识别和复用。修改歌词、注音、译文、时间戳、歌名、封面、学习进度不触发音频重新上传。
3. 快照包含完整非音频资料。恢复时即可取得歌词，缺少的音频按歌曲下载。
4. 音频复用时，仍应用快照中的新歌词和其他资料，不能把旧歌词一并复用。
5. 保留稳定的歌曲、歌词行和词元身份，使掌握记录、人工修正和 AI 解析不会串行、串歌。

**当前实际行为是“上传快照＋用户确认恢复”，不是自动双向合并。** 当前自动备份只在应用可见且用户开启后定时上传本机变化，不会自动拉取并合并另一台设备的数据。第 13 节单独列出未来同步还需双方确定的内容。

### 1.1 版本号分别属于什么

| 字段 | 当前新协议的写入值 | 含义 |
| --- | --- | --- |
| APK / EXE 版本 | 各端自行维护 | 产品版本，不能代替数据协议版本 |
| 云快照 JSON 头 `version` | `3` | 外层文件容器版本 |
| 云快照头 `catalog.version` | `2` | 完整非音频歌曲目录版本 |
| 内层学习核心 `version` | `1` | 本协议写入空歌曲数组的学习核心格式 |
| 逐句 AI 记录 `schemaVersion` | 新生成记录为 `2` | AI 原文及请求对应校验版本，与备份容器版本无关 |

旧云快照 v1/v2、旧歌曲目录 v1 不在本次兼容范围内。电脑端应明确拒绝，而不是把未知格式当空歌曲库恢复。独立的本地学习导出、局域网电脑传歌仍有自己的核心解析流程，不要将其与 WebDAV 云格式混用。

## 2. WebDAV 目录中的文件

```text
用户配置的 HTTPS 目录/
  _uta-audio-<64位小写SHA256>.bin       原始音频，可以被多首歌曲/多个快照引用
  UTA-<UTC时间>-<8字符标识>.uta-backup  某一次完整的非音频资料快照
  UTA-<另一个时间>-<标识>.uta-backup    另一次快照
```

### 2.1 音频文件

- 文件内容是原始音频字节，**不加 JSON 头、不转码、不压缩、不编码为 Base64、不拼接歌词或歌曲编号**。
- 文件名必须匹配 `^_uta-audio-[a-f0-9]{64}\.bin$`。
- 文件名中的摘要必须等于整个原始音频文件的 SHA256，使用 64 位小写十六进制字符串，不加 `sha256:` 前缀。
- `.bin` 是存储扩展名。原文件名放在歌曲的 `audioName`，MIME 类型放在音频引用的 `type`，二者都不参与摘要。
- 只修改原文件名/MIME 类型，字节不变，仍复用同一音频。修改了文件内标签导致文件字节变化，也会被视为新音频。
- 相同音频可供不同歌曲条目共用；**音频相同不等于歌曲 ID 相同**。

### 2.2 快照文件名

安卓当前生成：

```js
`UTA-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.uta-backup`
```

目录列表只展示匹配 `^UTA-[A-Za-z0-9_.-]+\.uta-backup$` 的文件，并按文件名倒序排列。电脑端应使用同样的前缀及可比较的 UTC 时间格式，并保证名称唯一。目录顺序只是展示顺序，不能用它解决双端冲突。

### 2.3 保留和删除

每次上传生成新快照，不覆盖历史快照。当前不会自动删除任何用户云文件。本机删除歌曲后，新快照不再引用它；旧快照及其音频仍保留。**不要通过“当前快照没有此歌曲”推断可以删除该音频，其他快照或歌曲仍可能引用它。**

## 3. 二进制文件布局：必须按字节处理

统一规则：JSON 使用 UTF-8、无 BOM；签名以单字节 LF（`0A`）结尾，不能换成 CRLF。长度字段为 4 字节无符号小端整数。JSON 长度按 UTF-8 编码后的**字节数**计算，不能使用字符串字符数。

### 3.1 外层云快照

| 偏移 | 长度 | 内容 |
| --- | --- | --- |
| `0` | `17` | ASCII / UTF-8 签名 `UTA-CLOUD-BACKUP\n` |
| `17` | `4` | `H`：云头 JSON 的字节长度，UInt32LE |
| `21` | `H` | 云头 JSON |
| `21 + H` | `coreSize` | 内层学习核心文件 |
| `21 + H + coreSize` | `avatarSize` | 原始头像文件字节，无头像时为 0 字节 |

外层签名十六进制：`5554412d434c4f55442d4241434b55500a`。

文件必须严格满足：

```text
fileSize = 21 + H + coreSize + avatarSize
0 < H <= 16 * 1024 * 1024
coreSize 为正安全整数
0 <= avatarSize <= 10 * 1024 * 1024
```

不要在尾部添加换行、校验文本或 ZIP 包装。JSON 可以压紧或缩进，字段顺序不影响含义；**写入后按实际 UTF-8 字节重新计算长度**。

### 3.2 内层学习核心

| 相对核心开头的偏移 | 长度 | 内容 |
| --- | --- | --- |
| `0` | `20` | 签名 `UTA-LEARNING-BACKUP\n` |
| `20` | `4` | `M`：学习核心 JSON 字节长度，UInt32LE |
| `24` | `M` | 学习核心 JSON |

内层签名十六进制：`5554412d4c4541524e494e472d4241434b55500a`。

在本文的新云协议中，核心 `songs` 必须为 `[]`，**没有尾随音频块**，因此 `coreSize = 24 + M`。歌曲放在外层 `catalog.songs`，不能在两处重复存放。

外层和内层各有自己的 `createdAt`。两次生成时间可能略有不同，不要求字符串完全一致。

## 4. 外层云头 JSON

以下是结构示意；`coreSize`、`avatarSize` 必须用实际文件长度，不能照抄示意数字。

```json
{
  "version": 3,
  "createdAt": "2026-10-19T00:00:00.000Z",
  "coreSize": 1234,
  "avatarSize": 0,
  "avatarType": "",
  "catalog": { "version": 2, "songs": [] },
  "profile": { "nickname": "UTA 学习者", "japaneseLevel": "N3" },
  "chats": [],
  "ai": {
    "name": "自定义服务",
    "protocol": "openai-compatible",
    "base_url": "https://example.com/v1",
    "model": "example-model",
    "json_mode": true,
    "rememberKey": false,
    "web_search_enabled": false,
    "useServerDefault": false
  },
  "recent": { "learn": "local-example", "sing": null }
}
```

| 字段 | 类型 / 要求 | 含义 |
| --- | --- | --- |
| `version` | 必须为数字 `3` | 云容器版本 |
| `createdAt` | 建议 ISO 8601 UTC 字符串 | 快照生成时间；不要当作冲突解决依据 |
| `coreSize` | 正安全整数 | 内层核心总字节数 |
| `avatarSize` | 非负安全整数，上限 10 MiB | 尾随头像字节数 |
| `avatarType` | 字符串 | 有头像时仅允许 `image/jpeg`、`image/png`、`image/webp`、`image/gif`；无头像写 `""` |
| `catalog` | 必须有 `version: 2` 和 `songs` 数组 | 全部本机导入歌曲的非音频资料 |
| `profile` | 必须为对象，`nickname` 必须是字符串且长度 ≤24 | 个人资料 |
| `chats` | 必须为数组，可为空 | 历史对话 |
| `ai` | 可选对象 | 当前 AI 配置，默认无 `api_key` |
| `recent` | 可选对象 | `learn`、`sing` 为最近使用歌曲 ID 或 `null` |

“安全整数”指 JavaScript `Number.isSafeInteger` 范围，绝对值不超过 `9007199254740991`；字节数还须满足表中非负/正值限制。跨语言实现不要写入超出此范围的 64 位整数。

## 5. 歌曲目录与音频引用

`catalog.songs` 最多 1000 项，同一快照内歌曲 ID 不可重复。每个条目的 `lines` 按实际显示/播放顺序保存，不要为迁移协议重新编号或排序。

### 5.1 歌曲条目

| 字段 | 写入要求与含义 |
| --- | --- |
| `id` | 必填字符串，以 `local-` 开头。新导入建议 `local-`＋UUID；跨端传输后保持不变 |
| `title` | 必填非空字符串 |
| `artist` | 必填字符串，可用空串或“未知歌手” |
| `lines` | 必填、非空数组，最多 2000 行 |
| `audio` | 必填：音频引用对象，或纯歌词时 `null` |
| `lyricsOnly` | 纯歌词必须为 `true`；有音频建议显式 `false`，不能同时为 `true` |
| `audioName` | 原音频文件名，用于显示；不是本地绝对路径，也不是云文件名 |
| `album`、`sourceFile` | 可选字符串；`sourceFile` 为来源歌词文件名 |
| `language` | 可选 `zh` / `ja` / `ko` / `other`；按歌显示设置也可覆盖 |
| `createdAt` | 可选，安卓本机导入通常写 Unix 毫秒数，不是 ISO 字符串 |
| `duration` | 可选秒数；部分来源按歌词时间估算，不能用于识别音频是否相同 |
| `artworkUrl` | 可选封面：HTTP(S) URL 或 JPEG data URL，见第 5.4 节 |
| `artworkSourceUrl`、`artworkProvider`、`artworkChoice` | 可选封面来源、平台名和选择状态；选择状态常见 `default` / `selected` |

**安卓目录写入仅保留以上歌曲级字段及 `lines`、`audio`。** 不支持的自定义歌曲根字段不能假设会原样往返；新增共享字段需双方接入。歌词行当前会复制已有附加字段，但写入端仍应遵守约定，不塞入临时状态或凭据。

### 5.2 歌词行

```json
{
  "id": 10,
  "start": 1.2,
  "timestampOriginalStart": 1,
  "text": "空へ歌う",
  "translation": "向天空歌唱",
  "romaji": "sora e utau"
}
```

| 字段 | 当前校验 / 语义 |
| --- | --- |
| `id` | 必填安全整数，同一歌曲内唯一。双方新写入约定采用非负值；安卓读取的基础校验为安全整数 |
| `text` | 必填、去空白后非空，长度 ≤500 |
| `translation` | 必填字符串，可为 `""`，长度 ≤1000 |
| `start` | 必填：有限非负数，单位为**秒**；未设置必须写 JSON `null`，不能省略或用 `0` 冒充 |
| `romaji` | 可选字符串，长度 ≤1000；日语表示来源罗马音，其他语言也可能保存来源发音标注，不要强行转换 |
| `timestampOriginalStart` | 可选有限非负秒数；该句第一次时间调试前的原点，用于“重置”，后续调试不能覆盖原点 |
| 其他附加行字段 | 保留已有合法数据；显示用的 `displayNumber` 不能替代 `id`，也不能参与音频摘要 |

字符串长度限制以 JavaScript UTF-16 code units（`string.length`）为准；UTF-8 字节长度只用于二进制头的长度和文件限制。

不要因为译文为空就删除行。相同原文可能在不同副歌重复出现，必须保留各自 `id`，不能按文本去重。相同时间戳也可能合法存在，读取时不要自行去重。当前文件校验不强制按时间递增，建议写入合法时间轴并保持原行身份。

本地导入歌曲的歌词修改直接写入 `catalog.songs[].lines`；针对项目内置/文件夹歌曲的覆盖还有 `progress.lyricEditsBySong` 和 `songSettings.timeOverrides`，见第 6 节。不要把二者叠加成两次时间偏移。

### 5.3 音频引用

```json
{
  "name": "_uta-audio-<64位小写十六进制摘要>.bin",
  "sha256": "<同一个64位小写摘要>",
  "size": 128044,
  "type": "audio/wav"
}
```

- `name` 必须恰好等于 `_uta-audio-`＋`sha256`＋`.bin`，不允许路径、URL 或 `../`。
- `size` 为原始音频字节数，正安全整数，上限 `500 * 1024 * 1024` 字节。
- `type` 必须为字符串，长度 ≤100，可为空串；不参与音频摘要。
- 有音频时，缺失的本地文件不能用 `audio: null` 掩盖。
- 真正纯歌词歌曲写 `lyricsOnly: true`、`audio: null`，没有音频附件；恢复后无需点击下载。

### 5.4 封面

- `artworkUrl` 为 HTTP(S) 链接时长度 ≤2048。
- 内嵌封面当前只接受 `data:image/jpeg;base64,...`，整个字符串长度 ≤500000；不要写 PNG/WebP data URL。
- `artworkSourceUrl` 如非空必须是 HTTP(S) 链接。
- 原生头像支持 PNG/WebP/GIF，不代表歌曲封面 data URL 也接受这些类型。
- 更换封面仅改变目录资料，不改变音频附件。

## 6. 学习核心 JSON

最小完整结构如下。空对象与空数组的类型不能互换：

```json
{
  "version": 1,
  "createdAt": "2026-10-19T00:00:00.000Z",
  "songs": [],
  "progress": {
    "learnedBySong": {},
    "reviewItems": [],
    "favoriteSongIds": [],
    "corrections": {},
    "meaningOverrides": {}
  },
  "annotations": {},
  "aiReviews": {},
  "sentenceExplanations": {},
  "artworkOverrides": {}
}
```

### 6.1 `progress`

| 字段 | 格式 | 作用 |
| --- | --- | --- |
| `learnedBySong` | `{ [songId]: number[] }` | 每首歌曲已掌握的歌词行 ID，存 ID 而非数组下标 |
| `reviewItems` | 对象数组，每项至少有字符串 `songId`、安全整数 `lineId` | 待复习记录；已有 `text` 等附加字段应保留，用于原文核对 |
| `favoriteSongIds` | 字符串数组 | 收藏的歌曲 ID |
| `corrections` | `{ ["songId:lineId:tokenIndex"]: string }` | 人工词级读音；值 `""` 表示主动不注音，不能当作缺失删除 |
| `meaningOverrides` | `{ ["dictionary_form或surface:原reading"]: string }` | 词义修正，不以歌曲 ID 为前缀 |
| `playbackRate` | 可选 `1` / `0.75` / `0.5` / `0.25` | 安卓当前可接受的播放速度；电脑端其他倍速不能直接写入这里 |
| `readingStyle` | 可选 `none` / `hiragana` / `romaji` / `both` | 全局注音显示偏好 |
| `lyricSnapshots` | `{ [songId]: { sourceFile?, lines: [{id,text}] } }` | 绑定原文，用于校验学习/注音记录归属；不是云历史快照列表 |
| `lyricEditsBySong` | `{ [songId]: { [十进制行ID字符串]: edit } }` | 项目歌曲的人工覆盖。`edit` 可为非空原文字符串，或 `{text,translation}`；原文 ≤500，译文 ≤5000。不要把其中的时间字段当作手机现有时间覆盖接口 |
| `songSettings` | `{ [songId]: settings }` | 按歌设置，见下表 |

#### 人工注音保护（2026-10-22 新增可选扩展）

`progress.lyricSnapshots[songId]` 可以额外包含以下两个字段，容器版本不变。旧备份没有它们仍可读取；电脑端应原样保留，不能只重建 `lines` 而丢弃这些保护记录。

- `manualAnnotations`：`{ [十进制行ID字符串]: annotation }`。annotation含数字`id`、完整`text`及`tokens`，结构与原注音行一致。仅对活动人工校正保留原词界证据，不把它当成另一份可覆盖用户新选择的词典缓存。
- `unresolvedCorrections`：`{ ["songId:lineId:tokenIndex"]: record[] }`。每条record有`reading: string`（空字符串也必须保留）、`text: string | null`；如已有可靠原词界，另带`annotation`。这是未确认位置的原始人工资料，不属于当前生效的`corrections`，禁止按同号tokenIndex强行合并。

应用只有在歌曲ID、行ID、完整原文以及旧词界证据都成立时，才可恢复人工绑定。缓存缺失本身不能成为删除人工资料的理由。原文或语种已变时先保留待核对记录，不把旧校正套到新词；旧括号注音合并的`legacy_reading_indices`同属明确绑定证据。用户主动取消校正后，不得再从保护快照复活；用户明确编辑词界或采用建议后，应以新的绑定更新保护快照。更早版本已经实际删除且没有备份的读音，不能从自动词典猜回。

**最小复习条目的消费规则（本次已修复）**：`{songId,lineId}` 是合法记录，不得仅因缺少 `text` 就清空。在歌曲 ID 和行 ID 精确匹配、且稳定本机歌曲身份或已有歌词快照/注音原文能够确认该行时，可补成 `{...item,text:line.text}` 后保存；其他附加字段保持不变。音频待下载时先保留条目，音频补齐后同样执行核对。若已有显式 `text`，必须与当前原文完全一致，不能通过删除 `text` 绕过歌词变化后的身份校验；无法确认时不猜测原句。未知歌曲的引用继续保留，不能按相同歌名或重复原文关联另一首歌。

上述规则适用于旧的单句条目；039本身不增加容器版本。新复习本的`unitVersion:1`单元采用下述扩展规则，不能按首行失配直接清空。跨端保留全部类型待处理冲突的通用策略，仍需双方共同设计。

#### 多句复习单元（初版复习本新增）

仍存储在`progress.reviewItems`，云v3/目录v2/学习核心v1不变。旧`{songId,lineId,text?}`条目继续读取；新条目示例：

```json
{
  "unitVersion": 1,
  "songId": "local-example-001",
  "lineId": 3,
  "text": "君がくれた",
  "lineIds": [3, 17, 28],
  "lineTexts": ["君がくれた", "小さな地図を", "今も大切にしている"],
  "createdAt": 1792368000000,
  "dueAt": 1792454400000,
  "lastReviewedAt": 1792368000000,
  "intervalDays": 1,
  "reviewCount": 1,
  "focus": ["语法"],
  "note": "跨行的定语修饰需要一起理解。"
}
```

- `lineId`/`text`固定为收藏时首行；`lineIds`为歌曲中按位置连续的1至20行安全整数ID，不能按数字区间补行或按相同原文重配。`lineTexts`逐项对应，每项≤500字符，必须保留原收藏快照。去重依据`[songId,lineIds]`，不同副歌或重叠范围可以各自收藏。
- `createdAt`、`dueAt`、`lastReviewedAt`为非负有限毫秒时间；`intervalDays`和`reviewCount`为非负有限数值。首版“没想起来”安排10分钟后并在当轮队列稍后重现；“有点印象”1天；“比较熟悉”按1/3/7/14/30天增长。这是简单调度规则，不表示已有复杂记忆算法。
- `focus`可选多个`听力/词汇/语法/表达`，`note`≤1000字符。收藏、移出和评价均不改写掌握状态，学会不自动取消收藏。
- 单元还可携带`analysis`（沿用6.3的解析entry结构）和字符串`analysisKey`（≤30000字符）。多句解析目标原文是所选行用换行符连接后的**完整原文**，ID为首行ID；不得拼接逐行解析后冒充整段分析。`analysisKey`绑定歌曲/语言/各行ID、原文、译文和前后句，内容、等级或教学版本变化时提示手动重生成，不自动调用AI。
- 首版保留歌词变更后的新收藏单元：当前歌词与`lineTexts`不同则提示变化、解析过期；引用缺失或已非连续范围时显示提示并禁用播放/生成/评价，用户可移出后重新收藏。移出单元不删除原歌词、音频及全局单句解析，删除歌曲则清理其复习单元。未知歌曲引用仍保留。
- 电脑端即使暂时不实现多句复习，也必须保留以上字段，不能只留下首行`lineId`，或把一个单元拆成多个单句丢失笔记、调度和整段解析。

`songSettings[songId]` 的已接入字段：

| 字段 | 允许值 / 格式 |
| --- | --- |
| `language` | `zh` / `ja` / `ko` / `other` |
| `readingStyle` | `none` / `hiragana` / `romaji` / `both` |
| `romajiPosition` | `above` / `below`；假名仍在汉字上方 |
| `showTranslation`、`showSourceReadings`、`showManualReadings` | 布尔值 |
| `timeOverrides` | `{ [十进制行ID字符串]: {text, baseStart, start} }`；原文字符串 ≤1000，两个时间均为有限非负秒数 |

`timeOverrides` 仅在原行 `id`、`text`、原始 `start === baseStart` 都匹配时生效。它保存绝对时间，不是相对增量；原点为 `baseStart`。不要把从文件夹来的 `folder-*` 歌曲强行改成另一首 `local-*` 歌曲来猜测关联。

### 6.2 `annotations` 与词元身份

```json
{
  "local-example": [{
    "id": 10,
    "text": "空へ歌う",
    "tokens": [
      {"index": 0, "surface": "空", "reading": "そら"},
      {"index": 1, "surface": "へ", "reading": "へ"},
      {"index": 2, "surface": "歌う", "reading": "うたう"}
    ]
  }]
}
```

行必须有安全整数 `id` 和 `tokens` 数组；词元必须有安全整数 `index`、字符串 `surface`、字符串 `reading`。实际缓存还可能有 `dictionary_form`、词性、释义、人工分词标记等字段，应保留，不要只抄最小示例而丢掉原记录字段。

例如 `manual_reading_mode: "literal"` 表示人工注音按原样显示，不能再次按日语罗马音转写。已有 `display_surface`、`source_reading`、`source_pronunciation`、`manual_group_reading` 等字段也影响显示和读音优先级；迁移时不要只保留 `surface` / `reading` 而丢掉这些字段。

原文对齐检查包含：注音行 ID 相等、若有 `text` 则原文相等、所有 `surface` 拼接等于原歌词。人工修正通过 `songId:lineId:tokenIndex` 指向词元。**电脑和手机使用不同分词引擎时，不可在恢复后直接重分词，再把旧 tokenIndex 修正套上去。** 应先保留原词元和人工结果；确需重分词时另做可靠映射，无法唯一对应则显示待处理。

### 6.3 `sentenceExplanations`

结构是 `{ [songId]: { [行ID字符串]: entry } }`。一条新生成的日语解析示例：

```json
{
  "text": "空へ歌う",
  "language": "ja",
  "schemaVersion": 2,
  "japaneseLevel": "N3",
  "explanation": {
    "line_id": 10,
    "line_key": "本次请求的随机标识:0:10",
    "source_text": "空へ歌う",
    "binding_version": 2,
    "teaching_version": 2,
    "meaning": "向天空歌唱。",
    "grammar": ["へ表示方向。"],
    "vocabulary": [{"surface": "歌う", "meaning": "歌唱", "reading": "うたう", "dictionary_form": "歌う", "usage": "可用于说明唱歌这一动作。"}],
    "expression_notes": ["向天空歌唱带有抒情色彩。"],
    "usage_note": "可作抒情描写；日常说明唱歌时可直接使用歌う。",
    "everyday_example": {"sentence": "一緒に歌おう。", "meaning": "一起唱吧。"},
    "learning_focus": ["掌握常用动词歌う；理解方向表达。"],
    "pronunciation_tip": ""
  }
}
```

备份基础校验要求 `entry.text`、`explanation.meaning` 是字符串，`grammar` 为字符串数组，`vocabulary` 为含字符串 `surface` / `meaning` 的对象数组。

判断“符合当前解析规则”还需核对 `schemaVersion: 2`、`binding_version: 2`、`line_id`、`source_text` 与当前行一致；日语还要核对 `japaneseLevel`，以及本轮新增的 `explanation.teaching_version: 2`。`line_key` 由生成请求产生，跨端迁移只保留，不能拿它替代歌词 ID。不能给未经对应校验的旧数据补写 v2 标记来假装已经校验。

日语教学版本独立于原文绑定和备份容器版本，本次不修改云v3/目录v2/学习核心v1。新增字段应在备份时原样保留；旧日语记录仍可读，但不作为当前教学规则的完成记录，不自动付费替换。非日语不要求教学版本。`expression_notes`为最多3条、每条400字符的字符串数组，`usage_note`最多600字符，`everyday_example`为`sentence`/`meaning`均最多300字符的对象（两者允许同时为空），`learning_focus`最多2条、每条260字符；词汇可另带`reading`/`dictionary_form`（100字符）和`usage`（300字符）。这些是中文解释与日常原创示例，不能将示例写回原歌词。

日语等级枚举：`beginner`、`N5`、`N4`、`N3`、`N2`、`N1`，其中 `beginner` 表示“没学过日语”。其他语言不套用日语等级。

### 6.4 `aiReviews`、`artworkOverrides`

- `aiReviews` 为 `{ [songId]: review }`。每个 `review.suggestions` 必须是数组。建议项至少包含安全整数 `line_id`、`token_index`，字符串 `surface`、`original_reading`、`suggested_reading`、`reason`，以及数字 `confidence`。其他已有字段保留。
- `aiReviews` 不等同于应用独立保存的所有 AI 复核历史。未在本协议列出的本地仓库不能假设已经上传。
- `artworkOverrides` 为 `{ [songId]: override }`，封面规则同第 5.4 节；可有 `artworkSourceUrl`、`artworkProvider`、`artworkChoice`。
- 歌曲自己的封面与覆盖表不要混淆。当前显示优先检查是否存在覆盖项；空封面覆盖也可能表示用户明确选择默认封面。

### 6.5 Android 本机存储键对照

这些是手机实现细节，电脑端可以换数据库，但导入导出时须映射为上述语义：

| 核心字段 | Android Local Storage 键 |
| --- | --- |
| `progress` | `uta-pronunciation-progress-v2` |
| `annotations` | `uta-auto-annotations-v5` |
| `aiReviews` | `uta-ai-reviews-v1` |
| `sentenceExplanations` | `uta-sentence-explanations-v1` |
| `artworkOverrides` | `uta-artwork-overrides-v1` |

本机歌曲、音频 Blob、头像及对话另存于 IndexedDB，不要求电脑端复刻相同的数据库名称。

## 7. 个人资料、头像、对话和 AI 配置

### 7.1 个人资料与头像

`profile` 至少包含 `nickname`。还可有 `japaneseLevel`、`japaneseLevelPrompted`、`avatarStored`、`avatarCrop`。恢复时根据实际头像是否存在重算 `avatarStored`。

头像是外层尾随的原始二进制，不是 JSON Base64 字符串。若有裁剪信息：

```json
{"width": 800, "height": 800, "zoom": 1, "x": 0.5, "y": 0.5}
```

五个值均须有限数；宽高 >0，宽×高 ≤40000000，`zoom` 在 1～3，`x` / `y` 在 0～1。GIF 不应因同步而被静态化。

### 7.2 对话

`chats` 每项必须包含：字符串 `id`、`title`、`songId`、`songTitle`，有限数 `updatedAt`（安卓写 Unix 毫秒），对象 `context`，数组 `messages`。聊天 ID 不重复。

每条消息：`role` 为 `user` 或 `assistant`，`content` 为字符串且长度 ≤20000。可选 `sources` 是 `{title,url}` 数组，标题为字符串，URL 为 HTTP(S)。已有上下文字段应原样保留，不能仅迁移聊天正文。

### 7.3 AI 配置与密钥

`ai` 如有，至少需字符串 `base_url` 和 `model`；其他字段包括 `name`、`protocol`、`json_mode`、`rememberKey`、`web_search_enabled`、`useServerDefault`。`api_key` 默认不写入，仅用户主动选择并确认后才包含。

**快照没有内容加密或数字签名，SHA256 仅用于音频完整性。** HTTPS 保护传输，不代表云文件本身加密。WebDAV 地址中的账号密码、WebDAV 应用密码、设备本机加密密钥绝不进入协议文件。

当前 Android 恢复代码在 `ai` 存在但没有 `api_key` 时，会把对应 AI Key 设为空；并不是自动保留本机旧 Key。只有快照同时带有效 Key 和 `rememberKey: true` 才按原规则持久保存。若后续改为“两端密钥各自保留”，应共同调整恢复策略，不要把它当作已实现行为。

字体资源、自定义字体、主题字号、WebDAV 凭据、设备缓存、临时选段及正在生成的任务状态不属于当前共享快照字段。播放模式/倍速等仅以明确列出的字段为准。

## 8. 身份、时间与未知字段的共同约定

1. **歌曲 ID**：跨端保留原值。两台设备分别导入相同音频会生成不同歌曲 ID，当前不会自动合并；不可仅凭音频 SHA256、歌名或歌手合并学习记录。
2. **歌词行 ID**：标识行身份，不是显示序号。插入/拆分/合并歌词需要分配或映射 ID，不能重新从零编号后把原掌握、解析套上去。
3. **词元 index**：必须与同一份 `annotations` 和原文匹配。人工空读音是有效值。
4. **时间单位**：歌词时间为秒，可有小数；歌曲本机 `createdAt`、聊天 `updatedAt` 通常为 Unix 毫秒；外层/核心 `createdAt` 为 ISO UTC 字符串。
5. **精确原文**：不为了匹配而去掉标点、空格、括号假名、重复段或 Unicode 字符后写回。显示处理不应修改存储原文。
6. **未知字段**：电脑端应尽量保留已读到的扩展资料；但当前 Android 按歌曲根字段白名单、按 App 内已接入的 progress 字段重新导出，并非任意 JSON 的无损透传器。双方新增字段必须先确定版本和代码支持，不能默认旧客户端会保留。
7. **无对应歌曲的状态引用**：学习核心可能保留文件夹歌曲、演示歌曲或暂不存在歌曲的记录。先保留/忽略无法解析的引用，不要猜测映射到另一首歌。当前云歌曲目录只包含本机导入歌曲。

## 9. WebDAV 网络行为

| 操作 | 当前 Android 行为 |
| --- | --- |
| 地址 | HTTPS 目录；禁止把账号密码嵌入 URL，禁止 query / fragment，目录尾部归一为 `/` |
| 认证 | HTTP Basic，使用用户自己的账号及应用密码 |
| 列目录 | `PROPFIND`，`Depth: 1`；不存在时可 `MKCOL` 建目录，上级目录需已存在 |
| 检查音频文件 | 针对文件 `PROPFIND`，`Depth: 0`，读取 `DAV:getcontentlength` |
| 上传 | `PUT` 原始字节，`Content-Type: application/octet-stream`，`If-None-Match: *`，不覆盖同名文件 |
| 下载 | `GET` 流式写入临时文件；音频下载后校验完整 SHA256 与大小再保存 |
| 重定向 | 不自动跟随，避免凭据转发到另一个地址 |
| 自动清理 | 没有删除用户云文件的产品流程 |

不要把 HEAD 响应中的 `Content-Length` 当作所有服务都可靠的实际文件长度。Android 曾遇到文件有内容但 HEAD 长度返回 0，因此现用 `PROPFIND/getcontentlength`；服务不返回长度时为未知值 `-1`。已有文件若返回已知且不匹配的大小，当前会报错并停止提交快照，不自动覆盖它。

`ETag` 可以作为服务返回的属性，但当前不是 SHA256，也没有被用来做双端条件合并。`PUT If-None-Match: *` 只保护同名文件不被覆盖，不代表已实现全局同步锁。两端同时上传可能产生多个快照；对同一新音频的并发上传可能得到 412，当前 Android 会报错，后续重试再检查复用，不能宣称已有自动竞争重试。

目录 JSON 列表接口不存在：这是用户的 WebDAV 服务，电脑端需要实现 XML 目录解析和认证。Electron 建议由主进程完成网络/本机安全凭据存储，渲染层通过受限 IPC 调用；不要把安卓 Capacitor 原生插件当作桌面现成实现，也不要通过关闭浏览器安全设置来解决跨域。

## 10. 上传流程

```text
读取本地歌曲与学习资料
  ├─ 纯歌词：audio=null，仅收集完整非音频资料
  ├─ 有本地音频：流式SHA256 → 检查云端同名文件 → 复用或PUT音频
  └─ 音频未下载：只在原目录确认云音频仍存在后引用
全部所需音频可用
  → 生成空songs的学习核心
  → 生成v3云头（catalog v2，完整歌词）
  → 最后PUT新快照
```

示例行为：

| 变化 | 音频上传 | 非音频快照 |
| --- | --- | --- |
| 首次 a、b、c | 上传 a、b、c | 新快照引用三首 |
| 第二次 b、c、d、e，b/c 改了歌词或时间 | 仅上传 d、e | 新快照含更新后的 b/c 资料及 d/e |
| 仅修改掌握进度、AI 解析、封面、歌名 | 0 段 | 新快照 |
| b 更换为不同字节的音频 | 仅上传 b 的新音频 | 新快照引用新摘要 |
| b 重选相同字节文件但改了文件名 | 0 段 | 新快照记录新显示文件名 |
| 云端 b 音频被手工删除，本地仍有 | 补传 b | 新快照 |

仍未下载的歌曲不能仅凭引用迁移到另一个云目录，需先获得实际音频。旧格式本机占位歌曲没有新音频引用时，当前会提示重新导入，不会猜测旧整曲附件对应哪个原始音频。

失败时停止提交新快照并释放本地临时文件，已上传成功的音频可能留在云端供重试复用。网络中断时服务器是否留下半个文件取决于 WebDAV 服务；不能承诺文件级原子提交或断点续传。当前没有分块续传协议。

## 11. 恢复流程与本地临时状态

1. 下载并解析快照，验证签名、长度、版本、目录和学习记录，用户预览确认。
2. 对每首歌曲应用快照的完整歌词和资料。
3. 本机同 ID 歌曲已有等大小音频时，计算实际音频 SHA256；匹配则复用**仅音频**。不能复用本机旧 `lines` 覆盖新快照。
4. 纯歌词直接可用；其他缺少音频的歌曲设待下载状态。
5. 整体替换歌曲、学习数据、个人资料和对话等；失败时尽力回滚原数据。当前并非跨所有数据库和凭据仓库的一次单一事务，回滚失败须明确提示用户。
6. 按首下载时，校验音频大小及 SHA256；成功后装配到已有歌曲，保留目录内歌词，持久化后解除待下载。

Android 本地会生成如下状态，**它们不应原样写入云目录**：

```text
audioBlob     本地原始音频Blob；未下载/纯歌词为null
cloudPending  是否待下载音频
cloudAudio    音频引用＋origin（恢复该引用时的WebDAV目录URL）
isLocal       本机歌曲标记
```

`origin` 不进入音频引用和跨端目录，用于防止下载或备份时从错误云目录取文件。电脑端可用自己的本地状态表示，但须保持相同语义。`cloudPending` 与 `lyricsOnly` 不能混用：前者应有音频而未下载，后者本来就没有音频。

恢复会使另一端的完整快照替换本机数据。未经用户确认，不能把“云端看起来更新”作为自动覆盖依据。

## 12. 限制与拒绝条件

| 项目 | 限制 |
| --- | --- |
| 单个上传/下载文件 | ≤500 MiB（524288000 字节），音频/快照都受此传输限制 |
| 外层云头JSON | 正长度，≤16 MiB |
| 内层核心JSON | 正长度，≤16 MiB |
| 原始头像 | ≤10 MiB |
| 歌曲数 | ≤1000，ID 唯一 |
| 每首歌词行数 | 1～2000，行 ID 唯一 |
| 歌词 / 译文 / 罗马音 | 分别 ≤500 / 1000 / 1000 UTF-16 code units |
| 昵称 / 消息正文 | 分别 ≤24 / 20000 UTF-16 code units |
| 目录XML | Android 通常限制约2 MiB；单文件属性响应约64 KiB |

至少拒绝：未知版本、错误签名、UTF-8/JSON 无法解析、声明长度与实际不符、重复 ID、非法时间值、音频路径越界、引用摘要与名称不符、下载摘要/大小不符、损坏头像和对话结构。

本文列出的现有校验不是完整安全类型系统。安卓对部分可选字段只做基础校验；电脑端不要输出 NaN、Infinity、含凭据的 URL 或自定义可执行内容。额外限制若会拒绝安卓实际合法数据，应先共同确认，不能各自悄悄收紧后又宣称兼容。

## 13. 后续自动双向同步：待双方共同确定

下面均为**待设计项，当前文件格式没有这些保证**：

| 待确定事项 | 原因 / 建议方向 |
| --- | --- |
| 设备身份及共同基线 | 区分“从同一快照修改”和“不同历史”，不能只比设备时间 |
| 歌曲/行/字段修订 | 当前无统一 `revision` / `baseRevision` 或逐字段更新时间，需约定新增元数据和协议版本 |
| 冲突合并 | 不同字段可考虑合并，同一字段同时修改应让用户选择；不能最后上传整库覆盖 |
| 删除与取消操作 | 当前快照缺失不等于删除事件；同步删歌、取消掌握、删除解析需要删除标记或操作记录 |
| 条件写与并发 | 明确服务的 ETag/条件写能力及冲突重试，不能把本机互斥锁当跨设备锁 |
| 共同歌曲识别 | 独立导入的同音频歌曲 ID 不同，需要显式合并/配对规则；音频摘要仅用于附件复用 |
| 多版本客户端 | 新字段的保留、能力声明、版本升级和拒绝策略必须协作；未知字段当前不是无损透传 |
| 设备偏好和密钥 | 哪些偏好跟随用户、哪些留在设备，以及恢复是否保留本机AI Key，需要产品决策 |
| 云端清理 | 先统计所有保留快照和歌曲的引用，再设计安全清理，不能只看最新快照 |

建议第一阶段先完成**两端相同格式的手动上传、预览及恢复**，将下面的互通清单跑通，再设计同步操作日志或修订协议。Windows 的 EXE 版本号可独立增长，数据协议版本必须由双方协商。

## 14. 给电脑端开发者的实施顺序与验收清单

### 建议顺序

1. 实现外层 v3 / 核心 v1 的字节读写，正确处理中文 UTF-8 长度。
2. 映射歌曲、行、学习记录、注音和解析身份，不改变原 ID。
3. 实现 WebDAV 原始音频哈希存储与目录快照，默认排除密钥。
4. 实现预览恢复、本地音频复用、仅音频下载和错误回滚。
5. 先用随附原创样例离线验证，再由两端分别生成快照交叉测试。

### 联调验收

- [ ] 电脑写出的快照能被 Android 新格式解析器读取；Android 写出的能被电脑读取。
- [ ] 云头和核心长度按 UTF-8 字节计算，中文、假名、emoji 不导致偏移错误。
- [ ] a/b/c → b/c/d/e 场景只新增 d/e 音频；a 和旧快照保留。
- [ ] 改歌词、注音、翻译、时间戳、原点、封面、歌名、进度及AI解析不重传音频。
- [ ] 重选同字节文件不重传；换不同音频会上传；远端缺失可从本地补传。
- [ ] 完整歌词、无时间戳歌词、纯歌词、空歌库都可往返。
- [ ] 恢复时同音频复用，但新歌词和时间戳确实更新；等长不同音频不误复用。
- [ ] 人工空读音、人工词界、重复副歌、稀疏行 ID、AI 原文绑定和日语等级不丢失。
- [ ] 有/无头像、含/不含 Key、带来源链接的对话均正确；WebDAV 密码不进文件。
- [ ] 未下载条目只引用原目录；云音频不存在、跨目录及错摘要明确报错。
- [ ] 上传中断不提交新快照；下载缺块/截断/等长损坏不写入歌曲；恢复失败有回滚提示。
- [ ] 旧云格式明确拒绝；不能恢复成空库或静默丢字段。
- [ ] 验收材料注明客户端构建、协议版本、服务类型、模拟/真实网络和测试范围。

音频拆分阶段，Android 已有 243 项自动检查、前端及原生构建、Chromium 89 模拟原生 WebDAV 桥的页面流程验证。本次最小复习条目修复后，全套自动检查为 247 项，并通过恢复、音频补齐、重启和再次上传的模拟页面验证。**这不是 Windows 已适配或真实双端云同步已经验收的证明。**

## 15. 源码定位与交付材料

电脑端拿到本文件即可开始实现。可对应查看 Android 源码中的以下有效实现；文件内以注释保留的旧实现不属于本协议：

| 文件 / 函数 | 负责内容 |
| --- | --- |
| `src/lib/cloudSongBackup.js` | `createCloudAudioAsset`、`cloudSongDescriptor`、`pendingCloudSongs`、`readCloudAudioAsset`、`reuseCatalogAudio` |
| `src/lib/cloudBackup.js` | 外层 v3 写入、解析、额外资料校验 |
| `src/lib/learningBackup.js` | 内层签名、字节布局、学习记录和歌词基础校验 |
| `src/lib/webDav.js` | 上传、快照命名、目录列表、下载摘要与分块校验 |
| `src/lib/cloudData.js` | 资料收集、完整恢复、音频复用、回滚与凭据策略 |
| `src/lib/learningIdentity.js` | 原文/词元身份核对和记录重整 |
| `src/lib/sentenceAnalysis.js` | 逐句解析 v2、原文绑定与等级 |
| `src/lib/timestampTuning.js` | 单句绝对时间覆盖与原点 |
| `android/app/src/main/java/com/uta/songlearning/WebDavPlugin.java` | 原生网络、流式文件、文件名白名单、SHA256 |
| `tests/cloudSongBackup.test.mjs`、`tests/cloudBackup.test.mjs` | 格式、纯歌词、资料恢复验证 |
| `tests/webDavAudioSplit.test.mjs` | a/b/c→b/c/d/e、原始字节复用、中断/损坏验证 |

随文配套包包含：本说明、`examples/` 下的原创静音 WAV 音频与有效 `.uta-backup`、解码后的云头/核心 JSON、文件摘要说明，以及只依赖 Node.js 内置模块的 `verify-example.mjs`。在包目录运行 `node verify-example.mjs` 可校验二进制偏移、JSON、版本、音频摘要及示例文件内容。

示例均为原创测试资料，不含用户歌曲、头像、设备信息、账号或真实密钥。它们可用于独立测试库的格式读取和恢复，不是用户真实数据的备份；请勿拿来替换日常使用的数据。电脑端不需要 Android 的本机目录或 `.tools` 开发环境即可使用配套包。
