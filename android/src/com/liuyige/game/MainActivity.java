package com.liuyige.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 留一格 · 回忆收纳师 —— 最小 WebView 壳。
 *
 * 游戏本体是纯静态 HTML5 + Canvas，跑在系统 WebView 里，
 * 所以这里只做三件事：把 WebView 配成能跑游戏的样子、载入本地资源、跟随生命周期。
 * 玩法逻辑一行都不在这里，全部在 assets/liuyige/ 里。
 */
public class MainActivity extends Activity {

    /** 与 style.css 的 --paper 一致，避免加载瞬间闪白 */
    private static final String PAGE_BG = "#f4efe3";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor(PAGE_BG));
        // 关掉过度滚动回弹，否则拖动棋盘时页面会跟着晃
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        // 本机存档（整齐度、图鉴、声音偏好）走 localStorage，必须开 DOM Storage
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // 关掉「必须用户手势才能播媒体」——BGM 由页面在首次点击时启动，
        // 这里放开只是让 WebView 不再二次拦截
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // 全静态资源，不需要缓存；避免改了包还读旧的
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        // 缩放交给页面自己的响应式布局，禁止 WebView 层再缩放
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        web.setWebViewClient(new WebViewClient());
        web.loadUrl("file:///android_asset/liuyige/index.html");

        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
