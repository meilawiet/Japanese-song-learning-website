# UTA · 日语歌词发音学习站

一个面向有一定日语基础的歌词学习网站。把歌曲按 LRC 时间轴拆成逐句练习：先听原声，再看读音、查词义，最后跟唱和校对。

> 当前版本适合本地运行和邀请朋友试用。歌词、音频和专辑封面可能受版权保护；公开部署前请确保自己拥有相应授权。

## 能做什么

- 导入带时间轴的日语 LRC 与歌曲音频，在网页内直接学习。
- 根据每句时间戳播放原声，播放起点提前 0.5 秒；支持 `1× / 0.75× / 0.5× / 0.25×` 慢放。
- 用 SudachiPy 生成逐词假名读音；可手动校正，修正结果优先显示。
- 提供原文、假名、遮住读音三种学习模式。
- 本地日中词典提供常用中文释义和词形信息；纯假名同形词会按词性优先消歧。
- 鼠标拖选歌词片段后可请求 AI 语境讲解；AI 只给建议，不会自动修改学习内容。
- AI 复核整首歌曲中可能不合理的读音，并逐条供用户确认。
- 学习进度、读音修正、手工词义和网页导入歌曲都保存于浏览器本地。
- 内置日漫抒情风格主页和歌曲库；已导入歌曲可直接切换学习。

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
```

所有 npm 依赖放在项目的 `node_modules/`，Python 依赖放在 `server/.venv/`，不会安装到系统全局目录。

### 以后不用输入命令

首次完成上述安装后，直接双击项目根目录的 [启动 UTA 网站.cmd](启动%20UTA%20网站.cmd)。它会启动本地服务并自动打开浏览器。不要关闭标题为 `UTA local server` 的命令窗口；关闭它即可停止网站。

## 网页导入自己的歌曲

1. 在“歌曲库”点击 **导入歌曲**。
2. 选择一个包含逐句时间戳的 `.lrc` 文件。
3. 选择对应的音频文件（MP3、M4A、WAV、OGG、WebM 等）。
4. 点击 **导入并开始学习**。

导入内容保存在当前浏览器的 IndexedDB：刷新页面后仍可使用，但换浏览器、清除站点数据或清除浏览器存储后会消失。文件不会上传到本项目的服务器或 AI 服务。

LRC 的每句应带有时间戳，例如：

```lrc
[00:12.40]夢ならばどれほどよかったでしょう
[00:18.20]未だにあなたのことを夢にみる
```

## 向项目内置歌曲库增加歌曲

适合在自己的本地开发环境维护歌曲库：

1. 把 `.lrc` 文件放进 `geci/`。
2. 把同名音频文件放进 `song/`，例如 `歌手-歌名.lrc` 对应 `歌手-歌名.mp3`。
3. 执行：

   ```powershell
   npm.cmd run lyrics:sync
   ```

脚本会生成 `src/data/songs.generated.js`。不要手工编辑这个生成文件。为避免意外公开受版权保护的歌词和音频，`geci/`、`song/` 和生成的歌曲数据默认不会提交到 Git。

如需为内置歌曲添加封面，可在 `src/data/songArtwork.js` 中按 `sourceFile` 配置公开封面 URL 与来源页链接。专辑封面通常受版权保护。

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

## 可选：启用 DeepSeek AI 复核与语境讲解

默认读音完全由本地 SudachiPy 生成。只有用户主动点击“AI 复核全曲”或“AI 解释”时，才会向 DeepSeek 发送必要的歌词上下文。

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
| 网页导入的 LRC 与音频 | 浏览器 IndexedDB | 否 |
| 自动注音、词典释义 | 本机 FastAPI 服务 | 否 |
| AI 复核 / 语境讲解 | DeepSeek（仅点击后） | 会发送所需歌词上下文 |

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
