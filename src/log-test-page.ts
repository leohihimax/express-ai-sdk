export function renderLogTestPage(maxLines: number, maxBytes: number): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESA 即时日志测试</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f6f8fb; color: #182840; font: 1rem/1.6 Inter, "PingFang SC", sans-serif; }
    main { max-width: 58rem; margin: auto; padding: 2rem 1rem; }
    h1, h2, p { margin: 0 0 .75rem; }
    h2 { font-size: 1.2rem; }
    .tests { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 21rem), 1fr)); gap: 1rem; }
    form, section { border: 1px solid #c8d2df; border-radius: .6rem; background: white; padding: 1rem; }
    form { display: flex; flex-direction: column; align-items: flex-start; gap: .65rem; }
    form h2, form p { margin: 0; }
    label { display: grid; gap: .2rem; }
    input, select, button { font: inherit; border: 1px solid #8290a3; border-radius: .3rem; padding: .3rem .6rem; }
    button { margin-top: auto; background: #18478a; color: white; cursor: pointer; }
    button:disabled { opacity: .6; cursor: wait; }
    section { margin-top: 1rem; }
    pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  </style>
</head>
<body>
<main>
  <h1>ESA 即时日志测试</h1>
  <p>在目标函数或 Pages 的即时日志中开始监测，运行一项测试，再用请求回执核对采集结果。</p>
  <div class="tests">
    <form method="post" action="/log-tests/levels">
      <h2>日志等级</h2>
      <p>一次请求分别调用 console.log、info、warn、error、debug，并直接写入 stderr。</p>
      <button>测试六种输出</button>
    </form>
    <form method="post" action="/log-tests/multiline">
      <h2>换行切分</h2>
      <label>输出方式<select name="method">
        <option value="log">console.log · INFO</option>
        <option value="info">console.info · INFO</option>
        <option value="warn">console.warn · WARNING</option>
        <option value="error">console.error · ERROR</option>
        <option value="debug">console.debug · DEBUG</option>
        <option value="stderr">stderr · ERROR</option>
      </select></label>
      <label>换行格式<select name="format">
        <option value="lf">LF 分隔三行</option>
        <option value="empty">开头、中间、末尾含空行</option>
        <option value="crlf">CRLF 分隔三行</option>
        <option value="literal">字面量 \\n（反斜杠和字母 n）</option>
      </select></label>
      <p>一次调用写入全部内容。LF 应产生三条同等级日志，字面量应保留在一条中。用回执核对每行的等级，并观察空行及回车符 CR 的处理。</p>
      <button>测试换行切分</button>
    </form>
    <form method="post" action="/log-tests/count">
      <h2>单请求日志条数</h2>
      <label>行数（0–${maxLines}）<input name="lines" type="number" required min="0" max="${maxLines}" value="${Math.min(10, maxLines)}"></label>
      <label>输出方式<select name="mode">
        <option value="calls">逐行调用 console.log</option>
        <option value="multiline">单次调用，以换行分隔</option>
      </select></label>
      <button>测试条数</button>
    </form>
    <form method="post" action="/log-tests/length">
      <h2>单条日志长度</h2>
      <label>正文字节数（0–${maxBytes}）<input name="bytes" type="number" required min="0" max="${maxBytes}" value="${Math.min(1024, maxBytes)}"></label>
      <label>填充内容<select name="encoding">
        <option value="ascii">ASCII 字符</option>
        <option value="utf8">UTF-8 多字节字符</option>
      </select></label>
      <p>随后再输出一条短日志，用于核对超长日志对后续采集的影响。</p>
      <button>测试长度</button>
    </form>
  </div>
  <section aria-labelledby="receipt-title">
    <h2 id="receipt-title">请求回执</h2>
    <pre id="receipt" role="status">等待运行测试。</pre>
    <details>
      <summary>如何用回执核对 ESA 日志字段</summary>
      <ul>
        <li>在日志正文中查找回执的 runId，按行对照 log 和 level。空行及极短行可用同一请求的其他日志定位。</li>
        <li>将 requestId 与 ESA 请求记录比对，同一请求的各行应一致。用发布记录和执行节点核对 functionName、codeVersion、region。</li>
        <li>对照回执的 host 和 path。检查 timestamp 是否包含时区，再与 startedAt、finishedAt 的时间范围比对。</li>
      </ul>
    </details>
  </section>
  <p>页面输入范围由测试程序设定。ESA 的正式限制以评审后发布的控制台文档为准。</p>
</main>
<script>
  const receipt = document.getElementById('receipt');
  const buttons = document.querySelectorAll('button');
  for (const form of document.forms) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      for (const button of buttons) button.disabled = true;
      receipt.textContent = '正在发送测试请求…';
      try {
        const url = new URL(form.action);
        url.search = window.location.search;
        const response = await fetch(url, {
          method: 'POST',
          body: new URLSearchParams(new FormData(form)),
        });
        receipt.textContent = 'HTTP ' + response.status;
        if (response.headers.get('content-type')?.includes('application/json')) {
          const body = await response.json();
          receipt.textContent += '\\n' + JSON.stringify(body, null, 2);
        } else {
          receipt.textContent += ' · 未收到 JSON 回执，请检查部署状态和预览链接的有效期。';
        }
      } catch {
        receipt.textContent = '未能读取请求回执，请检查网络和部署状态。';
      } finally {
        for (const button of buttons) button.disabled = false;
        receipt.scrollIntoView({ block: 'nearest' });
      }
    });
  }
</script>
</body>
</html>`;
}
