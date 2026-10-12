# UTA 安卓端与网页端功能差异：供合作者与 GPT 审查

## 0. 文档定位与代码基线

```yaml
document_type: feature_comparison
updated_at: 2026-10-10
timezone: Asia/Shanghai
android_release: 1.0.4
android_branch: android-dev
android_commit: f651a26d58efaa56c3a27309ef291664cdb6b3e1
main_commit_at_review: 0efe3e0de09fea3183f890fb84d9bf7741a81da6
web_collaborator_branch: unknown
evidence: source_review_and_existing_android_test_results
web_full_regression_run_for_this_document: false
purpose: compare_existing_features_without_deciding_which_to_port
```

本文件是现状说明，不是要求网页复制安卓的开发指令。哪些功能保留、移植、调整或舍弃，由网页合作者判断。文中的“未接入”不等于必须补齐，也不等于缺陷。

阅读本文件时必须区分三个对象：

1. **安卓 1.0.4**：已发布的 APK，源码在上述 `android-dev` 提交。
2. **同一份 `android-dev` 源码的浏览器分支**：下表的“网页”主要指此对象，依据平台判断与 UI 入口审查，未在本轮逐项做浏览器验收。
3. **合作者实际开发的网页分支**：未提供分支名称或工作区，无法断言其现状。`main` 只是另外一个已核对的仓库基线，不代表合作者的最新成果。

同一功能可能“在安卓分支有共用实现，但在合作者分支尚不存在”；也可能“组件存在，但浏览器没有可到达入口”。不能仅靠文件名、导入语句或 README 判断已完成。

补充资料：[README](README.md)、[原网页开发交接](WEB_APP_DEVELOPMENT_HANDOFF.md)。原交接文档的日期较早，其中开发顺序属于历史建议；本文件不替合作者确定优先级。

## 1. 项目边界与协作现状

- 用户群体：有一定日语基础、希望用自己的歌曲练习的学习者。
- 网页已可下载项目并在电脑运行，更多功能持续开发；安卓目前为 1.0.4；暂无 iOS 开发计划。
- 无账号系统。歌曲、进度、个人资料、对话主要保存在当前设备或浏览器。
- 安卓工作只提交 `android-dev`，网页合作者在自己的分支开发。此次没有将安卓改动合并到 `main`。
- `src/App.jsx`、`src/components`、`src/lib`、`src/styles.css` 仍有大量共用代码，尚未复制成完全独立的安卓代码库。分支隔离不会自动解决将来合并时的共用文件冲突。
- **跨平台数据互通仍在开发范围之外的待完成状态**。共用备份解析器、同名存储字段或安卓 WebDAV 可在两部手机恢复，均不能证明网页与安卓已支持完整互通。
- 安卓复习有入口及已有复习逻辑，但**尚未完成进一步的手机适配与模式设计**，不能当作已经完成的安卓界面范本。

## 2. 功能差异表

状态约定：

- **共用**：`android-dev` 中两平台可以使用的共同逻辑或入口；仍需核对合作者分支及浏览器运行情况。
- **安卓入口**：存在实现，但应用装配、组件显示或触发条件限定原生平台。
- **平台实现不同**：业务目的相近，网络、存储或系统能力使用不同实现。
- **未确认**：不能从此次源码审查或已知测试证明。

### 2.1 导航、学习与复习

| ID | 功能 | 安卓 1.0.4 | 网页浏览器分支现状 | 主要定位 |
| --- | --- | --- | --- | --- |
| N01 | 主导航 | 底部学习、复习、我的；我的内有歌曲库与设置 | 顶部发音学习、歌曲库、复习和设置；没有安卓三屏首页 | `App.jsx`、`AndroidHome.jsx` |
| N02 | 返回 | 先关弹层；子页返回所属首页；根页首次提示再次返回退出 | 使用网页自己的导航与弹层；不能直接等同 Android 返回事件 | `App.jsx` 中安卓导航、返回监听 |
| N03 | 启动视觉 | 新图标、启动图与“私のうた / 聴いてください” | 网页没有 APK 图标及原生启动流程 | `android/`、`App.jsx`、资源文件 |
| L01 | 学习入口 | 逐句学习、跟唱练习，两卡片展示分别最近学习的歌曲 | 原逐句页面已有；跟唱与最近歌曲卡片属于安卓入口 | `AndroidHome.jsx`、`App.jsx` |
| L02 | 逐句播放 | 点整句播放，再点暂停，暂停后再点从句首重播 | 播放函数共用；窄屏网页支持整句点击；桌面保留自己的选句/按钮操作 | `handleLyricRowClick`、`playLine` |
| L03 | 倍速 | 右下角悬浮，支持 1、0.75、0.5、0.25 倍 | 倍速状态与播放器共用，网页仍有原慢放控件 | `FloatingPlaybackSpeed`、`App.jsx` |
| L04 | 连续跟唱 | 从头开始或点任意句后连续唱；点正在唱的句子暂停，再点从该句重播并继续 | 连续播放函数在 App 中；跟唱页面渲染条件限定安卓 | `AndroidSingAlong.jsx`、`startContinuousPlayback`、`playSingAlongFromLine` |
| L05 | 封面选歌 | 逐句、跟唱均展示大封面；点封面打开网格/列表选歌 | 网页已有原选歌方式；该封面选歌弹层限定安卓 | `AndroidLessonHeader.jsx`、`AndroidSongLibrary.jsx`、`songPickerOpen` |
| L06 | 原文与读音 | 原文/读音；已移除遮住读音与选词黄色高亮 | 网页保留原文、注音、遮住以及选词/拖选解析 | `AnnotatedLine.jsx`、`App.jsx` 中 `interactive`、模式控件 |
| L07 | 注音类型 | 更多菜单选择假名、罗马音、假名＋罗马音；两种学习模式共用设置 | 显示函数已支持三种值，但网页设置 UI 仍只有假名与罗马音两项；不能据此声称网页已有第三项入口 | `ReadingStyleOptions.jsx`、`ReadingRuby.jsx`、`SettingsDialog.jsx`、`readingDisplay.js` |
| L08 | 整句编辑 | 长按整句→编辑，修改原文、读音和翻译 | 编辑器实现共用，长按触发限定安卓；网页有原逐词读音校对，不等同完整整句编辑 | `LyricLineEditor.jsx`、`beginLyricPress`、`saveEditedLyric` |
| L09 | 留空读音 | 可以保存空读音，空值表示不显示该词注音；不自动恢复词典读音 | 共用显示逻辑与逐词保存允许空值；整句表单仍缺网页入口 | `manualReading.js`、`readingDisplay.js`、`lyricEditing.js` |
| L10 | 英语与罗马音冲突 | 每词可选罗马音转假名/按原样保留；英文词默认原样，日语词支持罗马音输入 | 新选择控件属于整句编辑器；网页原逐词校对 UI 没有相同控件 | `LyricLineEditor.jsx`、`manualReading.js` |
| L11 | 单句翻译 | 带入 LRC 翻译，可编辑或清空保存；只改翻译无需重新注音 | 原翻译显示存在；新编辑表单缺网页入口，底层持久化实现共用 | `LyricLineEditor.jsx`、`lyricEditing.js`、`saveEditedLyric` |
| L12 | 跟唱翻译和校对 | 不展示翻译；注音、校对与逐句使用同一数据，不以校对状态改变文字颜色 | 网页尚无该跟唱入口；现有逐句继续显示译文 | `ReadingLyric.jsx`、`AndroidSingAlong.jsx` |
| R01 | 掌握、复习 | 可标记掌握，存在复习入口与逻辑；手机进一步适配待完成 | 网页已有复习清单、引导练习等原功能；不应因为安卓精简而判断网页原功能多余 | `App.jsx`、`review-list`、`review-queue` |

### 2.2 歌曲库、导入与封面

| ID | 功能 | 安卓 1.0.4 | 网页浏览器分支现状 | 主要定位 |
| --- | --- | --- | --- | --- |
| S01 | 歌曲库布局 | 浅色、网格/列表；卡片仅封面、歌名、歌手、进度；不显示内置原创示例 | 网页保留原卡片与示例，含来源及更多说明；未接入安卓网格/列表组件 | `AndroidSongLibrary.jsx`、`App.jsx` 歌曲库分支 |
| S02 | 操作菜单 | 长按封面或点三点，打开删除/编辑歌曲信息；更换封面已移到编辑内 | 网页原删除和封面操作仍直接展示；没有相同详情编辑入口 | `AndroidSongLibrary.jsx`、`editingDetailsSong` |
| S03 | 详情编辑 | 歌名、歌手、封面、重传文件、歌词时间轴五个折叠分区 | 组件共用但网页库未提供对应入口；主要编辑对象为本机导入歌曲 | `SongDetailsEditor.jsx`、`saveSongDetails` |
| S04 | 任意位置添加歌词 | 导入预览和详情编辑均可选第1句之前或任意句之后；编号为阿拉伯数字 | 导入预览已共用；详情编辑需要网页入口 | `App.jsx` 导入表单、`SongDetailsEditor.jsx`、`songTimeline.js` |
| S05 | 文件导入与持久化 | 音频＋LRC，本地保存 | 共用导入、IndexedDB 存储；网页另有电脑项目歌曲导入途径 | `localSongStore.js`、`App.jsx`、`scripts/sync-lyrics.mjs` |
| S06 | 识别歌名及搜歌词 | MP3 标签优先，否则按文件名推断；搜索后用户确认 | 共用表单及业务；网络路径与浏览器限制需单独验收 | `audioMetadata.js`、`OnlineSongSearch.jsx` |
| S07 | LRC 原文/译文/罗马音 | 修复纯汉字原文被丢弃；按时间戳与行顺序拆分三轨；导入及详情可编辑罗马音 | 本机文件导入解析共用；**电脑项目目录同步脚本是另一条链路，不能自动认定解析等价** | `timedLyrics.js`、`localSongStore.js`、`scripts/sync-lyrics.mjs` |
| S08 | 用户自带罗马音 | 罗马音/双显示优先用该句 `romaji`；为空时用自动读音转换 | 共用读音行函数；网页选择第三种显示的入口尚未提供 | `lineReading`、`line.romaji` |
| S09 | 直接导入/后台 AI | 用户自主选择；先保存，后台逐句解析；重新打开可续做 | 表单与任务逻辑共用，不是每个平台各写一套 | `App.jsx` 导入选项与待解析任务 |
| S10 | 联网歌曲网站 | LRCLIB 可获取同步歌词；下歌吧、歌曲宝等为网站搜索入口，用户下载后选文件导入 | 共用 `OnlineSongSearch`；不能表述为对所有网站一键抓取音频 | `OnlineSongSearch.jsx` |
| S11 | 多渠道封面 | Apple Music、网易云、QQ、酷狗及自定义图片；选中封面存本地供离线显示 | 两端已有检索与自定义；网页经后端、安卓经原生网络，需浏览器离线及缓存验收 | `ArtworkPicker.jsx`、`artworkSearch.js`、`server/app.py` |
| S12 | 电脑传歌 | Wi-Fi 或 USB 调试传歌；手机无需承载电脑项目目录 | 网页可启动共享；USB 为 ADB 调试流程，普通 USB 数据线自动导入未实现 | `computerSongTransfer.js`、`server/`、启动脚本 |

### 2.3 AI、个人资料、备份与更新

| ID | 功能 | 安卓 1.0.4 | 网页浏览器分支现状 | 主要定位 |
| --- | --- | --- | --- | --- |
| A01 | 注音服务 | APK 内置 Kuromoji，离线可用 | Python SudachiPy 服务；不是浏览器内置离线方案 | `annotationApi.js`、`offlineAnnotation.js`、`server/app.py` |
| A02 | AI 解析与配置 | 原生 HTTP 直连用户服务；支持整曲及句子解析 | 通过 Python API；支持服务端默认配置或用户自定义，不能直接照搬原生请求 | `annotationApi.js`、`mobileAi.js`、`aiSettings.js` |
| A03 | 问 AI 和历史 | 固定入口；歌词上下文、多轮对话、新建/继续/删除历史 | 入口限定安卓；聊天组件直用手机 AI 适配器，网页后端暂无 `/api/ai/lyric-chat` | `LyricChatHistory.jsx`、`lyricChat.js`、`lyricChatStore.js` |
| A04 | AI 联网开关 | 设置与对话均可切换，并提示可能增加费用；有 DeepSeek 的具体实现 | 网页设置未开放；其他供应商兼容性不能由开关存在推断 | `mobileWebSearch.js`、`mobileAi.js`、`SettingsDialog.jsx` |
| P01 | 我的/个人资料 | 圆形头像、昵称；点头像放大，设置中编辑 | 资料组件存在，网页无对应我的/资料入口 | `LocalProfile.jsx`、`ProfilePanel.jsx`、`localProfile.js` |
| P02 | 头像处理 | 图片裁剪，GIF 保留动画；10 MB、4000 万像素限制；修复 Android 选图读取问题 | 部分 JS 可复用；原生文件选择兼容修复不是浏览器实现 | `ProfilePanel.jsx`、`AvatarWebChromeClient.java` |
| D01 | 本地文件备份 | 网站备份入口已从安卓设置移除 | 网页保留 `.uta-backup` 导出、预览、确认覆盖恢复 | `SettingsDialog.jsx`、`learningBackup.js` |
| D02 | WebDAV 云备份 | 歌曲、音频、封面、歌词、进度、资料、对话和 AI 配置；下载预览后确认恢复 | UI 限定安卓，传输依赖原生插件；不是浏览器直接可用服务 | `WebDavPanel.jsx`、`webDav.js`、`cloudBackup.js`、`WebDavPlugin.java` |
| D03 | Key 备份 | 默认排除 API Key，主动包括时告警确认；不要把备份当作天然加密的保险箱 | 网页原备份不包含 API Key；密钥管理方案不同 | `cloudBackup.js`、`aiSettings.js`、`UtaAiCredential` 原生插件 |
| D04 | 自动同步 | 默认关闭；默认 86400 秒；支持 0/正整数，0 不定时；可见时到期检查，有变更则上传备份 | 无网页入口；没有保证应用/页面关闭后持续执行，也不是双向实时冲突合并 | `WebDavAutoSync.jsx`、`webDavSchedule.js` |
| U01 | 关于/更新 | 检查更新、项目发布页、QQ1125131374；启动查官方 Release；取消/更新，下载校验后调用系统安装器，失败提示手动安装 | 无相同入口；APK 安装及签名校验依赖原生插件，不能等同网页升级部署 | `AppUpdates.jsx`、`appUpdate.js`、`AppUpdatePlugin.java` |

以上路径未带目录时，组件位于 `src/components/`，逻辑通常位于 `src/lib/`；`App.jsx` 位于 `src/`，Java 类位于 `android/app/src/main/java/com/uta/songlearning/`。

## 3. 最新安卓修改与 main 的关系

`main` 不是干净的“纯网页版”：其源码已包含一些旧安卓组件和平台分支。组件存在不说明已有 1.0.4 的新行为。

本次对照确认 `main` 与 1.0.4 源码不同的关键区域包括：

- 三种注音菜单、双层 ruby、共用读音显示；新增 `ReadingRuby.jsx`、`ReadingStyleOptions.jsx`。
- 三轨 LRC 导入、纯汉字保留、自带罗马音；新增 `timedLyrics.js`。
- 单句留空读音、输入方式与翻译编辑；新增 `manualReading.js`，修改 `lyricEditing.js`、备份校验。
- 导入插句位置及详情编辑折叠分区；`App.jsx`、`SongDetailsEditor.jsx`、`songTimeline.js`。
- 头像选图兼容、WebDAV 下载/分块读取恢复相关 JS 与 Java。
- 更新下载安装、更新提示排版、关于入口和联网网站入口。

合作者审查时可使用以下只读命令。远程分支持续变化，先获取最新引用；必要时把文档 SHA 当作固定对照点。

```bash
git fetch origin
git diff --name-status origin/main..origin/android-dev
git diff origin/main..origin/android-dev -- src/App.jsx src/components src/lib src/styles.css server
git show f651a26d58efaa56c3a27309ef291664cdb6b3e1:src/lib/timedLyrics.js
```

如合作者分支不叫 `main`，对比时改为其实际分支。两个分支尖端内容对比用 `..`；需要研究共同祖先后的改动时再用 `...`，两者不能混同。

## 4. GPT 审查时应理解的数据语义

这些是当前实现语义，不是强制要求未来网页采用相同设计：

```text
song.lines[]:
  id           句子标识
  start        秒数时间戳
  text         原歌词
  translation  翻译；空字符串合法
  romaji       可选整句罗马音；留空时使用自动注音转换

annotations[songId][]:
  id / text / tokens
  tokens 包括 index / surface / reading 等词素信息

progress.corrections["songId:lineId:tokenIndex"]:
  缺失         使用词典读音
  非空字符串   使用人工读音
  ""           用户主动取消注音，不能用 || 回退到词典读音

readingStyle:
  hiragana / romaji / both

progress.lyricEditsBySong[songId][lineId]:
  旧格式：字符串原文
  新格式：{ text, translation }，翻译允许空字符串
```

- 单句原文改变可能使对应注音、掌握或解析缓存失效；仅修改翻译或自带罗马音不能无条件清除掌握进度。
- 本地歌曲原文/翻译等写入 IndexedDB；项目文件歌曲的单句修改通过浏览器本地覆盖保存，不改写电脑原 LRC。
- 假名与罗马音不是两份独立的人工校对。显示样式改变不应修改保存的读音。
- 自带的整句罗马音不能可靠按词分割对齐汉字。因此当前用其展示整句读音行，汉字 ruby 保留假名，不宣称已做逐词强制对齐。
- 输入方式只在保存人工读音时决定是否转换；“按原样保留”可保留英语或其他文字，不自动判定所有语言。
- LRC 的语言/轨道判断仍是启发式。相同时间戳、原文纯汉字、译文时间偏移、独立英文歌词等需结合顺序判断；没有覆盖所有非标准格式的保证。

## 5. 平台依赖与迁移检查点

| 层 | 网页 | 安卓 | 审查关注点 |
| --- | --- | --- | --- |
| 平台判断 | 普通浏览器，包括手机浏览器，均非原生平台 | Capacitor 原生运行 | `IS_ANDROID_APP`/`Capacitor.isNativePlatform()` 不等于屏幕宽度；不要通过强行设 true 来移植 |
| 注音 | FastAPI/SudachiPy | APK 词典/Kuromoji | 分词和初始读音可不同，人工校对优先 |
| AI/联网 | 浏览器→Python→供应商的现有路由 | 原生 HTTP→供应商 | 后端路由、请求头、跨域、密钥处理及工具协议须真实接通 |
| 封面 | Python 检索/图片获取适配 | 原生 HTTP 获取和本地保存 | 临时链接不是离线缓存证明，保存后断网重开需验证 |
| 选图 | 浏览器文件输入与解码 | WebView + 原生文件选择器 | GIF、多次选择同图、错误 MIME、文件权限和解码可有平台差异 |
| WebDAV | 当前无浏览器服务适配 | 原生插件及凭据存储 | CORS、传输大小、密码存储、恢复确认、解析异常都不是只加 UI 能解决 |
| 本地存储 | 浏览器 origin 的 localStorage/IndexedDB | WebView origin 存储及原生文件/凭据 | 跨 origin、浏览器、设备不自动共享 |
| 构建歌曲 | 网页构建会处理项目歌曲资源 | 安卓配置替换歌曲清单并跳过电脑私人歌曲 | 不把版权歌或本机生成歌曲误提交、误打包 |
| 更新 | 静态部署/后端升级方案待网页独立判断 | 官方 GitHub APK、摘要、发行签名、系统安装器 | 网页没有安装 APK 的原生能力 |

## 6. 已知验证范围

- 安卓最新功能：80 项 Node 测试通过，安卓前端与正式 APK 构建通过。
- 三星真机验证：三轨 LRC/OGG 导入、纯汉字保留、插句位置、注音三种切换与持久化、逐句/跟唱播放及暂停重播、人工读音共用、读音留空、英语原样/罗马音转换、翻译修改/清空/重载。
- 本轮正式版覆盖更新保留了原有歌曲；发布的 1.0.4 使用既有发行签名，上传附件摘要核对通过。
- 上述安卓结果**不证明网页浏览器通过同样验收**。本文件为源码审查文档，本轮未重跑网页所有功能，也未读取合作者未提交的工作。
- 网页和安卓互通、iOS、锁屏后持续同步、所有歌曲网站自动下载、所有供应商联网工具支持，均不能由现有功能推导为已实现。

如果选择移植，可按所选功能安排验收；可参考而非强制执行：桌面/窄屏布局、刷新持久化、断网、取消/失败恢复、音频时序、备份预览与确认、旧数据兼容。AI 测试是否调用真实服务及费用由合作者自行安排。

## 7. 可直接交给 GPT 的审查任务模板

下列模板供合作者复制；不是本仓库自动执行任务。只有文档、没有源码时，请先做差异摘要并标出待核实项，不编造运行结论。

```text
我在开发 UTA 网页端。请阅读附带的 ANDROID_WEB_FEATURE_COMPARISON.md，
结合我提供的实际网页分支/源码审查手机端和网页端的功能差异。

请区分：已经有入口、只有共用逻辑、依赖安卓原生能力、尚未实现、无法确认。
每个判断请给实际代码定位；我的分支可能不同于文档里的 main 或 android-dev。

请输出：
1. 我当前网页真正可用的功能，以及文档已过时的描述。
2. 安卓新增而网页没有入口的功能清单，引用文档功能 ID。
3. 如果考虑移植，各项涉及的组件、状态、数据结构、后端与浏览器限制。
4. 已经共用而无需重复开发的逻辑，以及可能影响旧数据的兼容问题。
5. 需要我选择的产品问题；请列出选择空间，不替我决定保留或删除。

先做审查，不直接改代码、合并分支或发布。
不要把存在组件当作功能已可用，不要把安卓测试当作网页验收。
```

## 8. 合作者可填写的选择记录

| 功能 ID | 当前网页实际状态与证据 | 我的选择：保留/移植/调整/暂缓/不采用 | 备注 |
| --- | --- | --- | --- |
| 待填写 | 待填写 | 由合作者决定 | 待填写 |

本文件未包含账号密码、API Key、用户头像、商业歌曲或真实备份。旧交接中出现的建议与本表现状冲突时，以实际分支源码和运行结果为准。
