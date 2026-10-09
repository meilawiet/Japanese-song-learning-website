package com.uta.songlearning;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "UtaAiCredential")
public class AiCredentialPlugin extends Plugin {
    private static final String ALIAS = "uta-ai-credential-v1";
    private static final String PREFS = "uta-ai-credential";
    private static final String VALUE = "encrypted-key";

    // 密钥保留在 Android Keystore 中；偏好设置只存加密后的 API Key。
    // WebDAV 密码使用独立槽，默认槽仍兼容已保存的 AI Key。
    private String slot(PluginCall call) { return "webdav".equals(call.getString("slot","")) ? "-webdav" : ""; }
    private SecretKey getKey(PluginCall call) throws Exception {
        String alias = ALIAS + slot(call);
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }

    @PluginMethod
    public void save(PluginCall call) {
        try {
            String plain = call.getString("value", "");
            if (plain.isEmpty()) { clear(call); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getKey(call));
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            String encoded = Base64.encodeToString(iv, Base64.NO_WRAP) + ":"
                + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            getContext().getSharedPreferences(PREFS + slot(call), Context.MODE_PRIVATE).edit().putString(VALUE, encoded).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("无法安全保存 AI Key。", error);
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS + slot(call), Context.MODE_PRIVATE);
            String encoded = prefs.getString(VALUE, "");
            JSObject result = new JSObject();
            if (encoded.isEmpty()) { result.put("value", ""); call.resolve(result); return; }
            String[] parts = encoded.split(":", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(call), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.DEFAULT)));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.DEFAULT)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("无法读取已保存的 AI Key。", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        getContext().getSharedPreferences(PREFS + slot(call), Context.MODE_PRIVATE).edit().remove(VALUE).apply();
        call.resolve();
    }
}
