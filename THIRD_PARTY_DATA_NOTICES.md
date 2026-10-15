# Third-party dictionary data notices

When `server/data/tomoshi-dict-open.db` is installed, UTA reads the local
Japanese-to-Chinese glossary data from the Tomoshi Dictionary Open Data Layer.

- Data source: [Tomoshi Dictionary Open Data Layer](https://github.com/tomoshi-app/tomoshi-dict-data)
- Derived source data: JMdict and KANJIDIC2, © Electronic Dictionary Research
  and Development Group (EDRDG)
- Derived Chinese-language layers: © Y1Z / Tomoshi
- Primary data licence: CC BY-SA 4.0; a few data tables may have different
  table-level licences, recorded in the upstream database and its licence files.

For redistribution or public deployment, retain the upstream attribution and
licence notices, describe modifications to the data, and comply with the
share-alike terms that apply to the distributed or adapted data. The UTA source
code itself is not represented as being endorsed by Tomoshi or EDRDG.

## QQ lyric format decoding

<!-- 仅说明歌词格式互操作依赖，不包含歌曲文件或平台账号数据。 -->
- [qrc-decoder](https://github.com/apoint123/qrc-decoder), pinned to 1.0.2, MIT.
- Original algorithm: [LyricDecoder](https://github.com/SuJiKiNen/LyricDecoder), MIT.
<!-- 原简写仅列 MIT；pako 同时包含采用 zlib 许可的底层端口。 -->
- [pako](https://github.com/nodeca/pako), MIT and Zlib, used for QRC decompression.

<!-- 原构建未显式保留压缩后的注释；增加独立许可附件确保发布时包含声明。 -->
The corresponding copyright and permission notices are retained in the
legal comment in `src/lib/qqLyrics.js` and in `licenses/qq-lyrics.txt`, copied
into both the web build and the Android APK assets.
