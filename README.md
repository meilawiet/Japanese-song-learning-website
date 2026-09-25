# UTA · 日语歌词发音学习站

一个面向有一定日语基础的歌词学习网站。把歌曲按 LRC 时间轴拆成逐句练习：先听原声，再看读音、查词义，最后跟唱和校对。

> 当前版本适合本地运行和邀请朋友试用。歌词、音频和专辑封面可能受版权保护；公开部署前请确保自己拥有相应授权。

## 能做什么

- 导入带时间轴的日语 LRC 与歌曲音频；保存前可预览并校对歌词、译文、时间戳和封面。
- 根据每句时间戳播放原声，播放起点提前 0.5 秒；支持 `1× / 0.75× / 0.5× / 0.25×` 慢放。
- 如果 LRC 含中文译文，会在对应日文歌词下显示；每句可切换“已掌握 / 未掌握”，歌曲库同步显示掌握进度。
- 逐句练习模式先隐藏读音和译文，听原声、自行回忆后再揭晓；选“还要再练”的句子自动进入复习清单。
- 用 SudachiPy 生成逐词假名读音；可手动校正，修正结果优先显示。
- 提供原文、假名、遮住读音三种学习模式。
- 本地日中词典提供常用中文释义和词形信息；纯假名同形词会按词性优先消歧。
- 鼠标拖选歌词片段后可请求 AI 语境讲解；AI 只给建议，不会自动修改学习内容。
- 网页导入歌曲时分批预生成每句的 AI 解析；歌词下方可立即查看整句意思、关键表达与语法，选中片段的单独讲解仍可使用。
- AI 复核整首歌曲中可能不合理的读音，并逐条供用户确认。
- 学习进度、读音修正、手工词义和网页导入歌曲都保存于浏览器本地。
- 可从歌曲库导出单个本地备份文件，并在另一浏览器恢复歌曲、音频、读音修正与学习进度。
- 内置日漫抒情风格主页和独立歌曲库；可按歌名或歌手检索、切换歌曲，并删除网页导入的歌曲。
- 导入时按歌名和歌手尝试匹配 Apple Music 封面；未找到可靠结果时使用默认封面。

## 效果预览

启动后访问 `http://localhost:5173`，可先用仓库内的原创短句练习，也可在“歌曲库”使用“导入歌曲”选择一份 `.lrc` 与对应音频文件。

## 运行环境

- Windows 10/11（当前项目已在 Windows 上验证）
- Node.js 20 或更高版本
- Python 3.10 或更高版本

## 本地启动

在项目根目录打开 PowerShell：

```powershell
# 1. 安装前端依赖到当前项目的 node_modules
npm.cmd install

# 2. 创建项目内的 Python 虚拟环境
py -3 -m venv server\.venv

# 3. 安装后端依赖到项目内虚拟环境
server\.venv\Scripts\python.exe -m pip install -r server\requirements.txt

# 4. 同时启动网页与本地标注 API
npm.cmd run dev
```

打开：

- 网页：`http://localhost:5173`
- 本地 API：`http://127.0.0.1:8000`

生产构建校验：

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:backup
server\.venv\Scripts\python.exe -m unittest discover -s server\tests
```

所有 npm 依赖放在项目的 `node_modules/`，Python 依赖放在 `server/.venv/`，不会安装到系统全局目录。

### 以后不用输入命令

首次完成上述安装后，直接双击项目根目录的 [启动 UTA 网站.cmd](启动%20UTA%20网站.cmd)。它会启动本地服务并自动打开浏览器。不要关闭标题为 `UTA local server` 的命令窗口；关闭它即可停止网站。

## 逐句练习与复习

在“发音学习”页面点击“开始逐句练习”。练习卡片先只显示日文原句；可以播放该句原声并调整速度，尝试自己读出、理解后，再点击“揭晓读音与译文”。网站不会自动判定唱得是否正确，由学习者对照答案选择“我会了”或“还要再练”。

“我会了”会更新这首歌的掌握进度；“还要再练”会将该句加入复习清单。点击页眉“复习”可查看所有待复习句，点击任意一项可从该句开始练；练会后会自动移出清单。没有音频时仍可练习读音和词义，但揭晓读音需要本地标注服务运行。

## 网页导入自己的歌曲

1. 在“歌曲库”点击 **导入歌曲**。
2. 选择一个包含逐句时间戳的 `.lrc` 文件。
3. 选择对应的音频文件（MP3、M4A、WAV、OGG、WebM 等）。
4. 等待歌词解析和封面查找，检查预览中的歌名、歌手、逐句日文、中文译文及时间戳；需要时可直接修改、添加或删除句子。封面不正确时可重新查找、填写图片链接，或使用默认封面。
5. 点击 **确认导入并生成解析**。歌词与音频先保存到当前浏览器，再分批调用 DeepSeek 生成整句解析；请保持页面打开直至进度完成。

导入的歌词数据和音频保存在当前浏览器的 IndexedDB：刷新页面后仍可使用，但换浏览器、清除站点数据或清除浏览器存储后会消失。不会按原文件路径读取，也不会将歌词文件或音频文件上传到远程服务器。歌词文本会发送给本机 FastAPI 服务生成读音；点击“确认导入并生成解析”后，歌词及相邻句、LRC 译文会分批发送给 DeepSeek，可能产生 API 调用费用。导入时，为查找封面，歌曲名和歌手名会经本地服务发送给 Apple Music；详见下方“隐私与数据”。

LRC 的每句应带有时间戳，例如：

```lrc
[00:12.40]夏の空を見上げる
[00:16.20]仰望夏日的天空
[00:16.20]君に言葉を届けたい
[00:20.50]想把话语传达给你
```

中文译文放在对应日文歌词的下一行即可；即使译文的时间戳与下一句日文相同，也会按相邻顺序配对。只有日文的 LRC 也能导入，只是不显示中文释义。旧版已导入的歌曲若没有译文，需要用原 LRC 和音频重新导入一次。

LRC 中的歌名、歌手资料行不会作为歌词参与读音标注或 AI 全曲复核；歌曲正文里单独出现的同名歌词仍会保留。已经导入的旧歌曲无需重新导入，页面会自动隐藏这些资料行。

每句歌词右侧播放和掌握按钮下方的 **查看解析**，会在当前句下方展开已缓存的整句 AI 讲解；再次点击即可收起，逐句练习时也可在答案下方展开。导入时若 DeepSeek 未配置、限流或中途失败，歌曲仍会保存；学习页可点击 **生成剩余解析** 续做。以前导入的歌曲和项目内置歌曲也可在学习页主动批量生成；尚未缓存的单句可以点击 **生成解析**。缓存只对原句相同的歌词有效，选中某个词或片段的现有 AI 讲解仍是按需请求。

## 数据备份与恢复

在“歌曲库”点击 **导出备份**，浏览器会下载一个 `.uta-backup` 文件。它包含网页导入歌曲的歌词、原声音频、歌曲资料，以及已掌握句子、复习清单、收藏、读音与词义修正、自动注音缓存、AI 复核记录和已生成的整句解析；内置歌曲的歌词与音频仍由项目本身提供。备份只在本机浏览器生成，不会上传到服务器。

换浏览器或清除站点数据前，请先保存这个文件。需要恢复时，在“歌曲库”点击 **恢复备份** 并选择文件，检查预览后确认。恢复会**覆盖当前浏览器**里已有的网页导入歌曲和学习记录，不会把两份数据合并；因此建议恢复前先导出当前数据。恢复完成后页面会自动刷新。备份包含原声音频，请妥善保管，不要在没有授权的情况下分享或公开发布。

## 向项目内置歌曲库增加歌曲

适合在自己的本地开发环境维护歌曲库：

1. 把 `.lrc` 文件放进 `geci/`。
2. 把同名音频文件放进 `song/`，例如 `歌手-歌名.lrc` 对应 `歌手-歌名.mp3`。
3. 执行：

   ```powershell
   npm.cmd run lyrics:sync
   ```

脚本会生成 `src/data/songs.generated.js`。不要手工编辑这个生成文件。为避免意外公开受版权保护的歌词和音频，`geci/`、`song/` 和生成的歌曲数据默认不会提交到 Git。

内置歌曲和网页导入歌曲会尝试按歌名、歌手搜索封面；如需为内置歌曲指定封面，可在 `src/data/songArtwork.js` 中按 `sourceFile` 配置公开封面 URL 与来源页链接。专辑封面通常受版权保护。

## 本地完整日中词典（可选，但推荐）

项目不提交约 662 MB 的解压词典数据库。没有它时仍能自动注音，但可显示的中文释义会较少。

1. 从 [Tomoshi Dictionary Open Data Layer 的发布页](https://github.com/tomoshi-app/tomoshi-dict-data/releases) 下载 `tomoshi-dict-open.db.zst`。
2. 放到 `server/data/tomoshi-dict-open.db.zst`。
3. 在 `server/` 目录执行：

   ```powershell
   @'
   from pathlib import Path
   import zstandard as zstd

   source = Path('data/tomoshi-dict-open.db.zst')
   target = Path('data/tomoshi-dict-open.db')
   with source.open('rb') as reader, target.open('xb') as writer:
       zstd.ZstdDecompressor().copy_stream(reader, writer)
   '@ | .\.venv\Scripts\python.exe -
   ```

首次查询会使用该本地 SQLite 数据库；不会把歌词或查词内容发送给词典服务。公开部署、修改或重新分发词典数据时，请遵守 [THIRD_PARTY_DATA_NOTICES.md](THIRD_PARTY_DATA_NOTICES.md) 中的署名与许可要求。

## 可选：启用 DeepSeek AI 解析与复核

默认读音完全由本地 SudachiPy 生成。点击“确认导入并生成解析”“生成剩余解析”“生成解析”“AI 复核全曲”或片段的“AI 解释”时，才会向 DeepSeek 发送必要的歌词上下文。没有配置 Key 时歌曲仍能导入，但整句解析暂时无法生成。

### 在网页设置中填写（推荐个人使用）

1. 点击页眉右上角的齿轮“设置”。
2. 填写自己的 **DeepSeek API Key**，点击“保存设置”。默认隐藏 Key，可切换显示以核对。
3. 再点击歌词解析、片段讲解或全曲复核，即会使用该 Key。保存设置本身不会调用 DeepSeek，也不会验证 Key 是否有效。

默认 Key 仅保存在当前标签页的 Session Storage 中，刷新页面后仍可使用，关闭标签页后通常会清除（浏览器恢复会话时可能保留）。勾选“在此浏览器记住 API Key”后，将以明文保存在此站点的 Local Storage 中；仅在自己的可信设备上使用。可随时点击“清除 Key”，或留空并保存以清除当前标签页和此浏览器保存的 Key。

浏览器 Key 仅随 AI 请求发送到当前配置的标注 API，由它转发给 DeepSeek；不会写入服务端 `.env`，也不包含在歌曲备份中。默认标注 API 是本机 `http://127.0.0.1:8000`；如通过 `VITE_ANNOTATION_API_URL` 指向远程服务，请仅使用可信的 HTTPS 服务。Key 不会用于自动注音和封面搜索。

浏览器 Key 优先于服务端配置，未填写或清除后将使用服务端的 `DEEPSEEK_API_KEY`（如有）。该设置仅支持项目现有的 DeepSeek 接口，模型仍由服务端 `DEEPSEEK_MODEL` 配置。

### 在服务端配置（保留原有方式）

在 `server/` 下复制 `.env.example` 为 `.env`：

```powershell
Copy-Item server\.env.example server\.env
```

编辑 `server/.env`：

```ini
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-flash
```

`.env` 已被 Git 忽略，绝不要把 API Key 写进前端代码、截图或公开仓库。

## 隐私与数据

| 内容 | 保存位置 | 是否上传 |
| --- | --- | --- |
| 学习进度、读音与词义修正 | 浏览器 Local Storage | 否 |
| 网页填写的 DeepSeek API Key | 默认 Session Storage；选择记住后为 Local Storage | 仅随 AI 请求经配置的标注 API 转发给 DeepSeek；不写入服务端配置或备份 |
| 网页导入的 LRC 与音频 | 浏览器 IndexedDB | 否 |
| 自动注音、词典释义 | 本机 FastAPI 服务 | 否 |
| 封面检索所需的歌名、歌手名 | 本机 FastAPI 服务转发给 Apple Music | 是，仅导入或补查封面时 |
| AI 整句解析 / 复核 / 片段讲解 | DeepSeek（确认导入或主动点击后） | 会发送所需歌词上下文与已有译文；不会发送音频 |

## 项目结构

```text
src/                   React 网页
  data/                自动生成歌曲数据、封面映射
  lib/                 注音 API、AI API、本地歌曲 IndexedDB
  assets/              原创主页背景图
server/                FastAPI、SudachiPy、可选本地词典
geci/                  内置 LRC 歌词
song/                  内置音频
scripts/sync-lyrics.mjs
```

## 版权与致谢

- 日语分词与读音：SudachiPy / SudachiDict Core。
- 简体中文词义：Tomoshi Dictionary Open Data Layer；相关声明见 [THIRD_PARTY_DATA_NOTICES.md](THIRD_PARTY_DATA_NOTICES.md)。
- 内置或用户导入的歌曲歌词、音频、专辑封面归各自权利人所有。本项目不提供歌曲下载或版权授权。
- 主页氛围插画为项目生成的原创视觉资源，位于 `src/assets/uta-twilight-station.png`。
- 公开仓库仅保留原创短句练习，不包含真实歌曲歌词、音频或专辑封面。
