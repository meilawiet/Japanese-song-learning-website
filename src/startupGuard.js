/* 启动守卫使用 ES5，独立于 React、标准方法补丁及业务脚本；即使主包解析失败也能显示说明。 */
(function () {
  var complete = false;
  var failure = '';
  var timer;
  function node(id) { return document.getElementById(id); }
  function hidden(id, value) { var element = node(id); if (element) element.hidden = value; }
  function fail(code) {
    failure = code || 'unknown';
    complete = false;
    clearTimeout(timer);
    hidden('root', true);
    hidden('uta-starting', true);
    hidden('uta-startup-failure', false);
  }
  function ready() {
    // 单纯超时后若页面终于加载完成可自行恢复；真实界面异常仍保留提示。
    if (failure && failure !== 'timeout') return;
    complete = true;
    failure = '';
    clearTimeout(timer);
    hidden('root', false);
    hidden('uta-starting', true);
    hidden('uta-startup-failure', true);
  }
  function diagnostics() {
    var version = document.querySelector('meta[name="uta-version"]');
    var value = version ? version.content : '';
    if (!value || value.indexOf('%') !== -1) value = '开发版';
    // 只提供版本、错误阶段和内核标识，不读取歌曲、账号、密钥、设备号或原始异常内容。
    return 'UTA 启动诊断\n应用版本：' + value + '\n启动状态：' + (failure || 'loading') + '\n网页内核：' + navigator.userAgent;
  }
  function showDiagnostics() {
    var area = node('uta-startup-diagnostics');
    var notice = node('uta-startup-notice');
    if (!area) return;
    area.value = diagnostics();
    area.hidden = false;
    var fallback = function () {
      area.focus(); area.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (ignored) {}
      if (notice) notice.textContent = copied ? '诊断信息已复制。' : '可长按下方文字复制，或将此页截图发给开发者。';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(area.value).then(function () { if (notice) notice.textContent = '诊断信息已复制。'; }, fallback);
    } else fallback();
  }
  function bind() {
    var retry = node('uta-startup-retry');
    var copy = node('uta-startup-copy');
    if (retry) retry.addEventListener('click', function () { location.reload(); });
    if (copy) copy.addEventListener('click', showDiagnostics);
    // 脚本可能在 body 解析前报错；DOM 就绪后补显示，避免只更新了内存状态。
    if (failure) fail(failure);
  }
  window.utaStartup = {ready: ready, fail: fail, diagnostics: diagnostics};
  window.addEventListener('error', function (event) {
    if (complete) return;
    if (event.target === window || event.error) fail('script-error');
    else if (event.target && event.target.tagName === 'SCRIPT') fail('script-load-error');
  }, true);
  window.addEventListener('unhandledrejection', function () { if (!complete) fail('promise-error'); });
  timer = setTimeout(function () { if (!complete) fail('timeout'); }, 15000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
}());
