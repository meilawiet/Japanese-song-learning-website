# Licensing

This repository distributes a database whose tables carry **different
licenses**. The authoritative per-table record is the `table_licenses` table
inside `tomoshi-dict-open.db`; this file summarizes it.

## CC BY-SA 4.0

All tables except `kanji_strokes` are licensed under the
**Creative Commons Attribution-ShareAlike 4.0 International** license:
https://creativecommons.org/licenses/by-sa/4.0/legalcode

| Tables | Upstream / rights holders |
|---|---|
| `entries`, `forms`, `freq_rank`, `kanji_words`, `verb_pairs` | JMdict © Electronic Dictionary Research and Development Group (EDRDG); derivations © Y1Z |
| `jpn_defs` | Japanese Wiktionary contributors (CC BY-SA, via kaikki.org Wiktextract) + JMdict-derived LLM definitions © Y1Z |
| `zh_defs`, `zh_variant_note`, `cn_contrast`, `word_relations_analysis`, `verb_pairs_note` (and `_zhtw` / `_en` variants) | JMdict-derived content © Y1Z |
| `kanji` | KANJIDIC2 © EDRDG |
| `kanji_gloss` (and `_zhtw`) | KANJIDIC2-derived content © Y1Z |
| `vocab_jlpt` | Jonathan Waller's JLPT Resources (CC BY), via stephenmk/yomitan-jlpt-vocab (CC BY-SA 4.0) |

## CC BY-SA 3.0

| Tables | Upstream / rights holders |
|---|---|
| `kanji_strokes` | KanjiVG © Ulrich Apel — https://kanjivg.tagaini.net/ |

License text: https://creativecommons.org/licenses/by-sa/3.0/legalcode

## Not licensed by this repository

The name **"Tomoshi"**, its logo and other brand identifiers. The Tomoshi
application itself and its proprietary data layers are distributed separately
under their own terms (see https://tomoshi.app/terms/).
