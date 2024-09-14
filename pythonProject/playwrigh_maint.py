import atexit
import os
import subprocess
import json
import threading
import asyncio
from playwright.async_api import async_playwright

enable_mitm_proxy = False
mitm_port = 8080

# 启动 mitmproxy
def start_mitmproxy(port=mitm_port, upstream_proxy="127.0.0.1:7890"):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(current_dir, "event_stream.py")  # 替换为你的 mitmproxy 脚本路径

    mitmproxy_process = subprocess.Popen(
        [
            "mitmdump",
            "-p", str(port),
            "-s", script_path,
            "--mode", f"upstream:http://{upstream_proxy}",
            "--ssl-insecure",
            "-v"
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding='utf-8'
    )

    # 处理 mitmproxy 日志输出
    def log_output(pipe, stream_name):
        for line in iter(pipe.readline, ''):
            try:
                print(f"{stream_name}: {line.strip()}")
            except UnicodeDecodeError as e:
                print(f"UnicodeDecodeError in {stream_name}: {e}")
        pipe.close()

    stdout_thread = threading.Thread(target=log_output, args=(mitmproxy_process.stdout, 'MITM STDOUT'))
    stderr_thread = threading.Thread(target=log_output, args=(mitmproxy_process.stderr, 'MITM STDERR'))
    stdout_thread.start()
    stderr_thread.start()

    global enable_mitm_proxy
    enable_mitm_proxy = True

    def stop_mitmproxy():
        print("Terminating mitmproxy...")
        mitmproxy_process.terminate()
        mitmproxy_process.wait()
        print("mitmproxy terminated.")

    atexit.register(stop_mitmproxy)
    return mitmproxy_process

# 启动 Playwright 浏览器
async def start_browser():
    playwright = await async_playwright().start()

    # 用户数据目录的配置
    current_dir = os.path.dirname(os.path.abspath(__file__))
    private_config_dir = os.path.join(current_dir, "private_chrome_config")  # 恢复用户数据目录
    if not os.path.exists(private_config_dir):
        os.makedirs(private_config_dir)

    # 启动带持久性上下文的浏览器，并配置代理（如果启用）
    browser_context = await playwright.chromium.launch_persistent_context(
        private_config_dir,  # 用户数据目录
        headless=False,  # 显示浏览器
        args=['--auto-open-devtools-for-tabs'],  # 自动打开开发者工具
        ignore_https_errors=True,  # 忽略 HTTPS 错误
        proxy={"server": f"http://127.0.0.1:{mitm_port}"} if enable_mitm_proxy else None  # 使用代理
    )

    return browser_context, browser_context.browser  # 返回上下文和浏览器实例

# 注入 JavaScript 脚本
async def inject_scripts(page):
    vue_js = """
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/vue@2';
    document.head.appendChild(script);
    """
    await page.evaluate(vue_js)  # 异步注入

    current_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(current_dir, "js_bridge.js")
    with open(script_path, "r") as file:
        js_content = file.read()

    await page.evaluate(js_content)  # 异步注入
    print("JavaScript 注入完成")

# 监听和处理 EventStream
async def listen_for_event_stream(page):
    async def handle_request(request):
        # 识别 SSE 请求，通过请求头的 Accept 判断
        if 'text/event-stream' in request.headers.get('accept', ''):
            print(f"Intercepting SSE request to: {request.url}")

            # 注入 JavaScript 到页面，用于监听 SSE
            sse_js = f"""
            const eventSource = new EventSource('{request.url}');
            eventSource.onmessage = function(event) {{
                console.log('SSE Data from {request.url}:', event.data);
            }};
            eventSource.onerror = function(error) {{
                console.error('SSE Error from {request.url}:', error);
            }};
            console.log('SSE Listener started for {request.url}');
            """
            await page.evaluate(sse_js)
    async def handle_response(response):
        try:
            if response.request.resource_type == 'xhr' or response.request.resource_type == 'fetch':
                content_type = response.headers.get('content-type', '')
                if 'text/event-stream' in content_type:
                    body = await response.body()  # 异步获取响应体
                    print(f"EventStream Data: {body}")
                    await decode_event_stream(body)
        except Exception as e:
            print(f"Error processing response: {e}")

    # 监听网络响应
    page.on("request", handle_request)

# 解析 EventStream 数据
async def decode_event_stream(data):
    events = data.split('\n\n')
    for event in events:
        if event.startswith('data:'):
            event_data = event[5:].strip()
            print(f"Received Event: {event_data}")
            await process_event_data(event_data)

# 处理 EventStream 响应数据
async def process_event_data(event_data):
    if event_data == '[DONE]':
        print("EventStream 完成")
    else:
        try:
            event_json = json.loads(event_data)
            print("处理的事件数据：", event_json)
        except json.JSONDecodeError:
            print(f"无法解析事件数据: {event_data}")

# 主流程
async def main():
    # 启动 mitmproxy（如果需要代理）
    start_mitmproxy()

    # 启动浏览器并打开页面
    context, browser = await start_browser()
    page = await context.new_page()

    await page.goto('https://share.github.cn.com/c/66e25e9f-b29c-8009-afa3-8e77a267a1ca')

    print("请手动登录...")
    await asyncio.sleep(5)  # 等待用户手动登录

    # 注入 JavaScript
    await inject_scripts(page)

    # 监听 EventStream
    await listen_for_event_stream(page)

    # 优雅的等待方式，直到某个外部事件触发或按下 Ctrl+C
    stop_event = asyncio.Event()
    try:
        await stop_event.wait()  # 等待直到手动触发
    except KeyboardInterrupt:
        print("Stopping...")

    await browser.close()

# 启动异步主函数
if __name__ == '__main__':
    asyncio.run(main())
