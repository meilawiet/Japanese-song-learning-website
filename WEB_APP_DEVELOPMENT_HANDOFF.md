# UTA 网页端后续开发交接

更新日期：2026-10-09（Asia/Shanghai）
用途：合作者同步仓库后，了解安卓端现有功能、网页端差异和后续开发入口。

## 1. 先读这里

本文件以当前源码为准。安卓端与网页端共用 React 项目，但不少新功能被平台条件限制在安卓端；网页尚未完成这些入口与适配。源码进度也不等于已发布 APK 的进度。

当前产品方向：界面简洁干净，歌曲、歌词、学习记录和个人资料保存在本机；没有账号登录和账号同步。

**跨平台数据互通暂缓。** 用户已要求隐藏安卓端的网站备份导入导出入口，未来再研发多平台互通。后续可以完善网页自身的数据管理；不要仅因存在共用备份解析器，就宣称网页与安卓已可无损互通。

本文的开发顺序是建议。网页整体布局、是否保留桌面选词功能、是否引入离线注音等产品选择，开始相关改造前应与项目负责人确认。

## 2. 项目结构与启动

| 入口 | 作用 |
| --- | --- |
| [README.md](README.md) | 安卓用户下载、安装与使用说明 |
| [网页安装与开发说明存档](docs/PROJECT_SETUP_ARCHIVE.md) | 网页依赖、启动与开发步骤（部分版本信息为历史记录） |
| [src/App.jsx](src/App.jsx) | 共用应用状态、音频播放、导入、学习、页面分支；目前大部分功能在这里串联 |
| [src/components](src/components) | 学习、歌曲库、资料、对话、设置等组件 |
| [src/lib](src/lib) | 注音、AI、歌词编辑、本地存储、备份等逻辑 |
| [server/app.py](server/app.py) | 网页 Python API：注音、词句解析、读音复核、封面检索等 |
| [vite.config.js](vite.config.js) | 网页构建 |
| [vite.android.config.js](vite.android.config.js) | 安卓构建；词典和歌曲资源处理与网页不同 |
| [android/app/src/main/java/com/uta/songlearning](android/app/src/main/java/com/uta/songlearning) | 原生服务发现、凭据加密、WebDAV 等插件 |

按[网页安装与开发说明存档](docs/PROJECT_SETUP_ARCHIVE.md)安装依赖后，可用 `npm.cmd run dev` 启动网页与 API，或双击“启动 UTA 网站.cmd”。网页地址通常为 `http://localhost:5173`，注音 API 默认是 `http://127.0.0.1:8000`，可通过 `VITE_ANNOTATION_API_URL` 配置。

Python 使用项目 `server/.venv`。验证脚本如不需要缓存，使用 `server\.venv\Scripts\python.exe -B`，避免用其他 Python 环境生成缓存。

**平台判断提醒：** `Capacitor.isNativePlatform()` / `IS_ANDROID_APP` 表示是否在原生应用运行，并不表示屏幕是否为手机。手机浏览器打开网页仍走网页分支。不要用修改一个平台布尔值的方式移植整个安卓界面。

## 3. 已有功能与实际差异

“网页已有”表示源码已接入；不代表本文件为所有浏览器、部署方式重新做过完整验收。

| 功能 | 安卓当前实现 | 网页当前状态 / 后续工作 |
| --- | --- | --- |
| 主导航 | 学习、复习、我的；子页面按层级返回，根页面再次返回退出 | 顶部发音学习、歌曲库、复习及设置；网页导航需单独设计，保留浏览器返回习惯 |
| 学习模式 | 逐句学习、跟唱练习；两个入口显示各自最近歌曲 | 逐句与复习逻辑已有；跟唱页面和最近学习入口尚未接入网页 |
| 逐句播放 | 点整句播放、再点暂停、再点从句首重播；倍速悬浮 | 播放与倍速已有，窄屏网页也支持点整句；浮动布局尚未同步 |
| 跟唱 | 从头连续播放；点指定句后往后唱；点正在播放的句子暂停，再点从该句重播并继续 | 连续播放状态/函数在共用 App 中；渲染入口限制安卓，需网页布局和交互适配 |
| 歌曲封面与选歌 | 两种学习页大封面；点封面选歌；选歌支持网格/列表 | 网页原有选歌已有，新封面选歌弹层尚未接入 |
| 歌曲库 | 浅色；网格/列表切换；卡片仅封面、歌名、歌手、进度；菜单收纳操作 | 网页仍是旧卡片，删除、封面操作和来源说明直接展示；可参考安卓精简布局 |
| 歌曲详情编辑 | 菜单可编辑歌名、歌手、歌词时间轴，重新上传音频或 LRC；限本机导入歌曲 | 编辑组件/处理逻辑共用，网页歌曲库尚未提供对应入口 |
| 单句歌词与读音编辑 | 长按整句 → 编辑，调整歌词、重新注音、人工修正；修正不改字色 | 网页已有逐词读音校正；安卓整句菜单的触发条件限制原生，需增加网页入口 |
| 学习文字展示 | 原文/读音；假名或罗马音放“更多”；去除“遮住”和选词黄色高亮 | 网页仍有原文、注音、遮住，以及选词释义；不能直接认定为缺陷，应先确认桌面方案 |
| 跟唱文字 | 不显示翻译；汉字注音与逐句共享人工修正 | 接入跟唱时沿用同一份修正数据，不另存一套注音 |
| 本地导入 | 可直接导入，或保存后后台生成 AI 解析 | **已共用**导入表单和任务逻辑，先核对现有行为再修改 |
| 音频识别与歌词搜索 | 优先读取 MP3 ID3，其余按文件名推断；自动搜索同步 LRC；用户确认结果 | **已共用**识别和搜索组件；需网页浏览器网络/取消请求验收 |
| 音乐网站搜索 | LRCLIB 同步歌词结果可选用；其他站点打开搜索网页，由用户下载文件 | **已共用**；没有自动抓取所有站点音频的实现，不应标注为一键下载歌曲 |
| 多渠道封面 | Apple Music、网易云、QQ、酷狗；自定义图片/链接；保存到本机离线显示 | **两端已有**；网页走后端，安卓走原生请求，避免重复开发 |
| 问 AI | 带歌词上下文、多轮历史、新建/继续/删除对话；固定入口 | 网页只有选词/整句等解析，未接入历史对话入口，也没有对应后端聊天路由 |
| AI 联网查询 | 设置与对话内共用开关、费用说明；当前适配 DeepSeek 官方接口 | 网页设置未开放此入口；需后端适配，不能只增加复选框 |
| 个人资料 | 设置编辑昵称/头像；我的居中头像、点击放大；裁剪与 GIF；10 MB / 4000 万像素限制 | 本地资料和裁剪组件可复用；网页没有我的/个人资料入口 |
| 数据管理 | WebDAV 全数据备份；API Key 默认排除，主动包含需警告确认 | 网页现有本地备份仍保留；WebDAV UI/原生插件限定安卓，需网页传输方案 |
| 自动同步 | 默认关闭；86400 秒；只支持 0/正整数，0 停止定时；应用可见时检查并上传 | 网页尚未接入；关闭页面后无法沿用现有计时器持续运行 |
| 关于与更新 | 启动检测官方 GitHub Release；用户选择下载 APK | 网页未接入；APK 更新机制属于安卓，网页需独立版本与部署提示方案 |

### 两端的服务区别

- 网页注音目前由 Python SudachiPy 提供；安卓 APK 内置 Kuromoji 离线词典。分词和初始读音可能不同，人工校正优先。
- 网页 AI 通过 `annotationApi.js` 调用 Python API，支持服务端默认配置和用户自定义配置。
- 安卓 AI 通过 `mobileAi.js` / `mobileWebSearch.js` 原生请求直连供应商；这些调用不能直接照搬到网页，否则可能遇到跨域、请求头限制及密钥保存问题。
- 安卓 WebDAV 通过 `UtaWebDav` 与 `UtaAiCredential` 插件传输和保存密码；普通浏览器没有这些原生插件。

## 4. 建议开发顺序与代码入口

### 阶段一：歌曲库与歌曲编辑

目标：先补齐网页对已有本机歌曲的管理能力。

参考：

- [AndroidSongLibrary.jsx](src/components/AndroidSongLibrary.jsx)：网格/列表、搜索、操作菜单、选歌模式。
- [SongDetailsEditor.jsx](src/components/SongDetailsEditor.jsx)：详细编辑表单。
- [localSongStore.js](src/lib/localSongStore.js)：音频 Blob 与歌曲持久化。
- `App.jsx`：`removeImportedSong`、`saveSongDetails`、`editingDetailsSong` 及网页歌曲库分支。

建议把可共享展示提炼成通用组件，桌面提供可见的三点菜单，触屏支持长按。保留搜索和导入；本机导入歌曲可编辑/删除，项目文件夹歌曲和原创示例的权限须区分。网页首次体验是否保留原创示例由负责人决定，安卓隐藏示例的规则不自动扩展到网页。

验收：网格/列表切换和刷新记忆；搜索；编辑保存后刷新仍有效；换音频后播放正确；改歌词后按现有规则更新对应进度/解析，不影响其他歌曲。

### 阶段二：逐句编辑、跟唱与最近学习

参考：

- [AndroidLessonHeader.jsx](src/components/AndroidLessonHeader.jsx)：大封面、选歌、更多、浮动倍速。
- [AndroidSingAlong.jsx](src/components/AndroidSingAlong.jsx)：连续跟唱展示。
- [LyricLineEditor.jsx](src/components/LyricLineEditor.jsx)、[lyricEditing.js](src/lib/lyricEditing.js)：单句文本与注音编辑。
- [ReadingLyric.jsx](src/components/ReadingLyric.jsx)、[AnnotatedLine.jsx](src/components/AnnotatedLine.jsx)：非交互与选词读音展示。
- `App.jsx`：`startContinuousPlayback`、`playSingAlongFromLine`、`handleLyricRowClick`、`saveEditedLyric`；最近歌曲与选歌状态。

网页补单句“编辑”菜单/按钮，触屏长按可作为补充，避免桌面用户只能靠长按发现功能。跟唱复用现有播放器，切歌/切模式时取消旧的逐句停止任务；用户暂停后重播当前句并继续往后，不能意外回到整曲开头。

逐句与跟唱共用歌词编辑和读音修正数据；不另复制修正表。最近逐句/跟唱分别保存。倍速/问 AI 浮动区应避开歌词、弹窗、窄屏底栏。

验收：从头唱、从任意句唱、暂停重播、连续越过句末、音频结束；人工修正即刻在两模式一致显示，字色不变，刷新后仍一致；无音频时有明确反馈。

### 阶段三：问 AI、历史对话与联网

参考：

- [LyricChatHistory.jsx](src/components/LyricChatHistory.jsx)：当前实际使用的历史对话组件；`LyricChat.jsx` 重新导出它，旧实现只供对照。
- [lyricChat.js](src/lib/lyricChat.js)：当前句、邻句、整曲歌词、人工修正读音和历史消息的请求结构。
- [lyricChatStore.js](src/lib/lyricChatStore.js)：本地历史 CRUD。
- [aiSettings.js](src/lib/aiSettings.js)：供应商配置及共用联网偏好。
- [mobileAi.js](src/lib/mobileAi.js)、[mobileWebSearch.js](src/lib/mobileWebSearch.js)：安卓协议与返回格式参考。

**明确缺口：** `server/app.py` 当前没有 `/api/ai/lyric-chat` 路由；聊天组件当前直接调用 `postMobileAi`。网页接入前，应提供网页请求适配层，并在 Python 后端实现聊天及联网协议，复用既有供应商配置验证。不要只去掉 `IS_ANDROID_APP` 条件。

建议返回结构保持 `{ answer, sources?, searchUsed? }`。保留新建、选择旧会话、续问、确认删除；继续其他歌曲的旧对话时使用该会话保存的歌词上下文。关闭窗口/切换会话时取消等待，防止旧回答串入新会话。联网开关与设置共享，切换开关不清空 API Key；未适配供应商不可显示为已支持。

来源链接仅接受 HTTP(S)，歌词和网页内容作为上下文数据，不作为执行指令。费用说明与发送歌词上下文的提示要保留。默认关闭联网，普通问答不应自动增加搜索调用。

验收优先用模拟供应商：上下文正确、历史刷新仍存在、续问含前次消息、删除确认、取消请求、开关双向同步、密钥不丢失、来源可查看；真实付费调用另行安排。

### 阶段四：个人资料与设置

参考：[ProfilePanel.jsx](src/components/ProfilePanel.jsx)、[localProfile.js](src/lib/localProfile.js)、[SettingsDialog.jsx](src/components/SettingsDialog.jsx)。

昵称和头像仍存本地，不增加登录与远程账号。头像 Blob 存 IndexedDB，不能把大 GIF 塞入 localStorage。静态图裁到 512×512；GIF 保存原始帧与裁剪参数，不能经 Canvas 转静态图。上传上限 10 MB、4000 万像素；支持 JPG/PNG/WebP/GIF，暂不支持 HEIC。

选图兼容真实文件头与文件提供者错误 MIME。安卓曾出现有效图片的 `Image.decode()` 拒绝问题，当前使用实际加载结果与备用内存图片地址；网页复用时保留异常处理。普通展示点击只放大，编辑集中在设置。错误红色显示、输入区域可正常选字。

桌面歌词是否允许选词属于独立选择，不要把安卓全页 `user-select:none` 无条件套到网页上。

### 阶段五：网页自身的 WebDAV 备份

参考：[WebDavPanel.jsx](src/components/WebDavPanel.jsx)、[webDav.js](src/lib/webDav.js)、[WebDavAutoSync.jsx](src/components/WebDavAutoSync.jsx)、[webDavSchedule.js](src/lib/webDavSchedule.js)、[cloudBackup.js](src/lib/cloudBackup.js)、[cloudData.js](src/lib/cloudData.js)。

原生参考：[WebDavPlugin.java](android/app/src/main/java/com/uta/songlearning/WebDavPlugin.java)、[AiCredentialPlugin.java](android/app/src/main/java/com/uta/songlearning/AiCredentialPlugin.java)。

网页传输方案需先确定：可支持允许跨域的 WebDAV 服务直连，或通过本机 Python 后端代理。多数服务不能假定允许浏览器跨域；原生插件不能在网页运行。若做代理，限定允许的目标地址与协议，避免任意访问服务器本机/内网；生产部署还需鉴权，不能成为公开代理。服务地址/密码和 AI Key 不记日志，不进入代码或文档。重定向不得把凭据转发到其他站点。

沿用产品规则：上传新备份，不覆盖旧快照；下载先校验/预览，用户确认后恢复；API Key 默认排除，包含时警告确认；WebDAV 密码永不进入备份。恢复失败应回滚本机数据，并对坏格式、过大文件、空间不足给明确反馈。当前安卓单文件限制 500 MB，网页方案需明确自己的内存和传输限制。

自动同步默认关闭，默认 86400 秒，0 停止定时，60 每分钟；只接受 0/正整数。现有实现只在应用可见时检查变更并上传，云端恢复仍手动确认。这不是双向冲突合并，也不是关掉页面后持续执行的后台任务。

本阶段只建议完善网页自身备份。跨端文件兼容、合并、冲突处理和迁移策略等到负责人启动跨平台阶段后再做。

### 阶段六：网页关于、版本与更新提示

参考：[AppUpdates.jsx](src/components/AppUpdates.jsx)、[appUpdate.js](src/lib/appUpdate.js)。安卓检查数字版本 tag、官方 Release APK，用户主动下载后安装。

网页可显示自身构建版本，并对新部署提供刷新提示；方案需与负责人确定。不要让网页用户下载 APK 来“更新网页”，也不要在用户编辑歌词/导入/生成 AI 时强制刷新。尚未采用 Service Worker/PWA 更新流程时，不应宣称已支持该流程。

## 5. 数据与兼容约定

| 数据 | 当前位置 / 结构 |
| --- | --- |
| 本机导入歌曲及音频 | `localSongStore.js`，IndexedDB；保留歌曲 ID 与 line ID |
| 学习记录、读音修正、单句编辑 | `uta-pronunciation-progress-v2`；以现有 learningBackup 校验结构为准 |
| 注音、整曲 AI 复核、逐句解析、封面覆盖 | `learningBackup.js` 的 `BACKUP_STORAGE_KEYS` |
| 昵称及头像参数 | `uta-local-profile-v1`；头像 Blob 在 `uta-profile-assets` / `avatars` |
| 历史对话 | `uta-lyric-chats` / `sessions`，含歌曲上下文与 messages |
| AI 配置 | `uta-ai-provider-v1`；密钥单独保存，浏览器显式记住为明文本地存储，不能称为系统加密 |
| 最近歌曲 | `uta-recent-learn-v1`、`uta-recent-sing-v1` |
| 本地学习备份 | `UTA-LEARNING-BACKUP` 格式；网页原有导出入口仍在 |
| 完整云备份 | `UTA-CLOUD-BACKUP` 格式；包裹学习备份、资料、头像、对话和可选 AI Key |

已有云备份读取/恢复逻辑部分位于共用 App 中，但不等于跨端互通已经验收。修改存储结构需兼容已有数据，先备份再做迁移；不要为方便开发清空 IndexedDB。多个平台采用不同初始注音引擎，人工修正的映射不能只凭数组索引或歌曲排序猜测。

## 6. 验证与协作检查

建议按改动选择已有测试，不必每次重新构建安卓包：

```powershell
node --test tests/lyricEditing.test.mjs tests/lyricChat.test.mjs
node --test tests/learningBackup.test.mjs tests/cloudBackup.test.mjs
node --test tests/audioMetadata.test.mjs tests/webDavSchedule.test.mjs tests/appUpdate.test.mjs
npm.cmd run test:readings
```

网页构建可用 `npm.cmd run build`；它会运行歌词同步，请留意本机生成歌曲数据，不能误提交。网页联调至少覆盖桌面和窄屏触屏、刷新后的存储、断网、取消操作、异常提示与音频时序。AI/WebDAV 先用模拟服务或原创测试数据，不上传本机商业歌曲做公共测试。

当前安卓曾验证真实相册上传/裁剪/保存、GIF 多帧、对话历史与模拟联网、真实 WebDAV 小备份上传下载及恢复；这些结果**不能代替网页浏览器验收**。`.tools` 下的本地脚本/截图不是合作者必须依赖的仓库测试资源。

协作要求：

- 修改现有实现时，除非负责人要求删除，保留旧实现作注释对照；新/修改代码加中文说明。
- 分享或推送前核对 README 与当前功能、安装步骤一致。
- 不提交 API Key、WebDAV 密码、浏览器数据、个人头像原件、商业歌曲或本机生成歌曲数据。
- Android 工程、组件和库若仍未提交，合作者只同步远程仓库就无法拿到；同步前核对相关源码是否进入提交。
- 未明确要求时不生成分发 APK；网页开发通常只需网页构建验证。GitHub 推送与公开发布按负责人授权执行。

## 7. 建议首次接手产出

1. 对照此表运行网页，确认当前分支已有功能和入口。
2. 给出网页桌面/手机布局方案，以及首期准备补齐的功能清单。
3. 优先完成歌曲库编辑和跟唱，再接入有后端缺口的问 AI。
4. 每完成一阶段更新本文“网页当前状态”，补充验收结果、未完成项和版本。
5. 跨平台同步阶段单独设计，保留现有数据结构与迁移空间。
