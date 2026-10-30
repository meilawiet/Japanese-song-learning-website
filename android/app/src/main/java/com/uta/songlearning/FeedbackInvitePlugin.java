package com.uta.songlearning;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 活动次数只存本机，和歌词备份、旧QQ群偏好分开；同步落盘后才允许弹窗。
@CapacitorPlugin(name = "UtaFeedbackInvite")
public class FeedbackInvitePlugin extends Plugin {
    private static final String PREFS = "uta_feedback_invite";
    private static final String CAMPAIGN = "feedback_20261030_v1";
    private boolean claimed = false;
    private int launch = 0;
    private SharedPreferences preferences() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    @PluginMethod
    public synchronized void claim(PluginCall call) {
        if (!claimed) {
            claimed = true;
            SharedPreferences prefs = preferences();
            int count = Math.max(0, Math.min(3, prefs.getInt(CAMPAIGN, 0)));
            // commit成功才展示，快速结束进程也不会回退计数。
            if (count < 3 && prefs.edit().putInt(CAMPAIGN, count + 1).commit()) launch = count + 1;
        }
        JSObject result = new JSObject();
        result.put("launch", launch);
        call.resolve(result);
    }

    // 只读状态便于排查，无重置接口，网页不能反复重开活动。
    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("shownLaunches", preferences().getInt(CAMPAIGN, 0));
        call.resolve(result);
    }
}
