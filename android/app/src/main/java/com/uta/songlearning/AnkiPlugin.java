package com.uta.songlearning;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.ichi2.anki.api.AddContentApi;
import com.ichi2.anki.api.NoteInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "UtaAnki", permissions = @Permission(
    alias = "anki", strings = "com.ichi2.anki.permission.READ_WRITE_DATABASE"))
public class AnkiPlugin extends Plugin {
    private static final String MODEL = "UTA 歌词语境";
    private static final String[] FIELDS = {"UTA词条键", "歌词正面", "词条背面", "UTA数据"};
    private static final String AUDIO_SLOT = "UTA_PENDING_SOUND_6B81B89E";
    private static final String COVER_SLOT = "UTA_PENDING_COVER_6B81B89E";
    private static final Pattern COVER_TAG = Pattern.compile("<img src=\"([A-Za-z0-9_.-]+\\.(?:jpg|jpeg))\"\\s*/>", Pattern.CASE_INSENSITIVE);

    @PluginMethod
    public void connect(PluginCall call) {
        if (AddContentApi.getAnkiDroidPackageName(getContext()) == null) {
            call.reject("请先安装 AnkiDroid，并启用外部应用接口。");
        } else if (getPermissionState("anki") == PermissionState.GRANTED) {
            connected(call);
        } else {
            requestPermissionForAlias("anki", call, "connected");
        }
    }

    @PermissionCallback
    private void connected(PluginCall call) {
        try {
            JSArray decks = new JSArray();
            Map<Long, String> available = readDecks(api());
            for (Map.Entry<Long, String> deck : available.entrySet()) {
                decks.put(new JSObject().put("id", deck.getKey().toString()).put("name", deck.getValue()));
            }
            call.resolve(new JSObject().put("decks", decks));
        } catch (Exception error) {
            reject(call, error);
        }
    }

    @PluginMethod
    public void createDeck(PluginCall call) {
        try {
            String name = call.getString("name", "").trim();
            if (name.isEmpty()) throw new IllegalArgumentException("请输入牌组名称。");
            AddContentApi anki = api();
            Map<Long, String> available = readDecks(anki);
            // 在写入前查询实际牌组，避免旧列表或重复提交造成重名。
            for (String existingName : available.values()) {
                if (name.equalsIgnoreCase(existingName)) {
                    throw new IllegalArgumentException("已存在同名牌组，请在列表中选择。");
                }
            }
            Long id = anki.addNewDeck(name);
            if (id == null) throw new IllegalStateException("未能创建 Anki 牌组。");
            if (available.containsKey(id)) {
                throw new IllegalArgumentException("已存在同名牌组，请在列表中选择。");
            }
            call.resolve(new JSObject().put("id", id.toString()).put("name", name));
        } catch (Exception error) {
            reject(call, error);
        }
    }

    @PluginMethod
    public void find(PluginCall call) {
        try {
            String key = call.getString("key", "");
            if (!key.matches("uta_[0-9a-f]{64}")) throw new IllegalArgumentException("词条编号无效。");
            AddContentApi anki = api();
            Long model = findModel(anki);
            JSArray results = new JSArray();
            if (model != null) {
                for (NoteInfo note : anki.findDuplicateNotes(model, key)) {
                    if (note != null) results.put(new JSObject().put("id", Long.toString(note.getId()))
                        .put("fields", new JSArray(Arrays.asList(note.getFields()))));
                }
            }
            call.resolve(new JSObject().put("notes", results));
        } catch (Exception error) {
            reject(call, error);
        }
    }

    @PluginMethod
    public synchronized void save(PluginCall call) {
        try {
            AddContentApi anki = api();
            String[] fields = call.getArray("fields").toList().toArray(new String[0]);
            if (fields.length != FIELDS.length || !fields[0].matches("uta_[0-9a-f]{64}")) {
                throw new IllegalArgumentException("卡片内容无效。");
            }
            Long model = findModel(anki);
            String target = call.getString("noteId");
            Long noteId;
            if (target != null) {
                if (model == null) throw new IllegalStateException("原卡片已不存在，请重新打开制卡。");
                noteId = Long.parseLong(target);
                String[] expected = call.getArray("expected").toList().toArray(new String[0]);
                checkCurrent(anki, noteId, expected);
                fillCover(anki, fields, call.getString("cover"));
                fillAudio(anki, fields, call.getString("audio"));
                checkCurrent(anki, noteId, expected);
                if (!anki.updateNoteFields(noteId, fields)) throw new IllegalStateException("未能更新 Anki 卡片。");
            } else {
                long deck = Long.parseLong(call.getString("deckId"));
                if (!readDecks(anki).containsKey(deck)) throw new IllegalStateException("所选 Anki 牌组已不存在。");
                if (model == null) model = createModel(anki);
                // 即使两个制卡窗口先后查到空结果，写入前也再次核对同词同片段。
                for (NoteInfo note : anki.findDuplicateNotes(model, fields[0])) {
                    if (note != null && hasExample(note, call.getString("exampleId", ""))) {
                        throw new IllegalStateException("这条歌词已添加，请重新查找原卡。");
                    }
                }
                fillCover(anki, fields, call.getString("cover"));
                fillAudio(anki, fields, call.getString("audio"));
                noteId = anki.addNote(model, deck, fields, null);
                if (noteId == null) throw new IllegalStateException("未能创建 Anki 卡片。");
            }
            call.resolve(new JSObject().put("id", noteId.toString()));
        } catch (Exception error) {
            reject(call, error);
        }
    }

    // 接口返回 null 表示查询失败，与成功读取空列表、找不到指定牌组分别处理。
    private Map<Long, String> readDecks(AddContentApi anki) {
        Map<Long, String> decks = anki.getDeckList();
        if (decks == null) throw new DeckReadException();
        return decks;
    }

    private static final class DeckReadException extends IllegalStateException {
        DeckReadException() {
            super("暂时无法读取 AnkiDroid 牌组。请打开 AnkiDroid，再回到 UTA 重试。");
        }
    }

    private AddContentApi api() {
        if (getPermissionState("anki") != PermissionState.GRANTED) {
            throw new IllegalStateException("请允许 UTA 访问 AnkiDroid。");
        }
        return new AddContentApi(getContext());
    }

    private boolean hasExample(NoteInfo note, String id) {
        try {
            JSONArray examples = new JSONObject(Uri.decode(note.getFields()[3])).getJSONArray("examples");
            for (int index = 0; index < examples.length(); index++) {
                if (id.equals(examples.getJSONObject(index).optString("id"))) return true;
            }
        } catch (Exception ignored) {
            // 未识别的旧卡不纳入 UTA 自动重复判断。
        }
        return false;
    }

    private Long findModel(AddContentApi anki) {
        Map<Long, String> models = anki.getModelList();
        if (models == null) throw new IllegalStateException("无法读取 AnkiDroid 笔记类型。");
        for (Map.Entry<Long, String> model : models.entrySet()) {
            if (MODEL.equals(model.getValue())) {
                if (!Arrays.equals(FIELDS, anki.getFieldList(model.getKey()))) {
                    throw new IllegalStateException("UTA 歌词语境的字段已更改，请检查 Anki 笔记类型。");
                }
                return model.getKey();
            }
        }
        return null;
    }

    private long createModel(AddContentApi anki) {
        Long id = anki.addNewCustomModel(MODEL, FIELDS, new String[]{"歌词语境"},
            new String[]{"{{歌词正面}}"}, new String[]{"{{词条背面}}"},
            ".card{text-align:left;font:17px/1.55 sans-serif;padding:16px}"
                +".uta-example{padding:12px 0;border-bottom:1px solid #8886}"
                +".uta-head{font-size:1.65em;margin:0}.uta-meta{opacity:.75;font-size:.85em}"
                +".uta-lyric{white-space:pre-line;margin:4px 0}",
            null, 1);
        if (id == null) throw new IllegalStateException("无法创建 UTA 笔记类型。");
        return id;
    }

    // 比较读取时的字段，避免误覆盖操作期间在 Anki 中编辑过的卡片。
    private void checkCurrent(AddContentApi anki, long id, String[] expected) {
        NoteInfo current = anki.getNote(id);
        if (current == null || expected.length != FIELDS.length || !expected[0].matches("uta_[0-9a-f]{64}")
            || !Arrays.equals(expected, current.getFields())) {
            throw new IllegalStateException("Anki 原卡内容已变更，请重新打开制卡。");
        }
    }

    private void fillAudio(AddContentApi anki, String[] fields, String audio) throws Exception {
        if (audio == null) return;
        if (audio.length() > 6_000_000 || !fields[1].contains(AUDIO_SLOT) || !fields[3].contains(AUDIO_SLOT)) {
            throw new IllegalArgumentException("音频片段无效。");
        }
        String sound = importMedia(anki, Base64.decode(audio, Base64.DEFAULT), ".wav", "audio", null);
        if (sound == null || !sound.matches("\\[sound:[A-Za-z0-9_.-]+\\]")) {
            throw new IllegalStateException("AnkiDroid 未能保存片段音频。");
        }
        // 正面使用原生音频标签，结构字段保存相同标签的百分号编码。
        fields[1] = fields[1].replace(AUDIO_SLOT, sound);
        fields[3] = fields[3].replace(AUDIO_SLOT, Uri.encode(sound));
    }

    private void fillCover(AddContentApi anki, String[] fields, String cover) throws Exception {
        if (cover == null) return;
        if (cover.length() > 500_000 || !fields[1].contains(COVER_SLOT) || !fields[3].contains(COVER_SLOT)) {
            throw new IllegalArgumentException("歌曲封面无效。");
        }
        byte[] jpeg = Base64.decode(cover, Base64.DEFAULT);
        if (jpeg.length < 3 || jpeg[0] != (byte) 0xff || jpeg[1] != (byte) 0xd8 || jpeg[2] != (byte) 0xff) {
            throw new IllegalArgumentException("歌曲封面无效。");
        }
        // 同一张封面采用内容派生的文件名，由 AnkiDroid 管理本地媒体。
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(jpeg);
        StringBuilder name = new StringBuilder("uta-cover-");
        for (int index = 0; index < 12; index++) name.append(String.format(Locale.ROOT, "%02x", digest[index] & 0xff));
        String image = importMedia(anki, jpeg, ".jpg", "image", name.toString());
        Matcher result = COVER_TAG.matcher(image == null ? "" : image);
        if (!result.matches()) throw new IllegalStateException("AnkiDroid 未能保存歌曲封面，可取消附封面后重试。");
        fields[1] = fields[1].replace(COVER_SLOT, result.group(1));
        fields[3] = fields[3].replace(COVER_SLOT, result.group(1));
    }

    // 音频和封面共用临时文件授权，调用结束后释放授权并清理文件。
    private String importMedia(AddContentApi anki, byte[] bytes, String extension, String type, String name) throws Exception {
        File clip = File.createTempFile("uta-anki-", extension, getContext().getCacheDir());
        Uri uri = null;
        try {
            try (FileOutputStream output = new FileOutputStream(clip)) {
                output.write(bytes);
            }
            String provider = AddContentApi.getAnkiDroidPackageName(getContext());
            if (provider == null) throw new IllegalStateException("AnkiDroid 当前不可用。");
            uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", clip);
            getContext().grantUriPermission(provider, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return anki.addMediaFromUri(uri, name == null ? clip.getName().replace(extension, "") : name, type);
        } finally {
            if (uri != null) getContext().revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            clip.delete();
        }
    }

    private void reject(PluginCall call, Exception error) {
        if (error instanceof DeckReadException) {
            call.reject(error.getMessage(), "ANKI_DECKS_UNAVAILABLE");
            return;
        }
        call.reject(error instanceof IllegalStateException || error instanceof IllegalArgumentException
            ? error.getMessage() : "访问 AnkiDroid 失败，请检查授权后重试。");
    }
}
