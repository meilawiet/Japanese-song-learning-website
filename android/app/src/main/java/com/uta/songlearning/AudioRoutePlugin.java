package com.uta.songlearning;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UtaAudioRoute")
public class AudioRoutePlugin extends Plugin {
    private BroadcastReceiver noisyReceiver;

    @Override
    public void load() {
        // 耳机拔出或蓝牙音频断开并将切换到扬声器时，通知页面暂停歌曲。
        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                    notifyListeners("audioBecomingNoisy", new JSObject());
                }
            }
        };
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(noisyReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        // 页面销毁时撤销动态广播监听，避免旧实例继续接收系统事件。
        if (noisyReceiver != null) {
            getContext().unregisterReceiver(noisyReceiver);
            noisyReceiver = null;
        }
        super.handleOnDestroy();
    }
}
