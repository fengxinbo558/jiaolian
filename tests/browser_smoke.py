import json
import os

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("FORM_BASE_URL", "http://127.0.0.1:4173")
CHROMIUM_PATH = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")


def main() -> None:
    console_errors: list[str] = []
    page_errors: list[str] = []

    with sync_playwright() as playwright:
        launch_options = {
            "headless": True,
            "args": [
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
            ],
        }
        if CHROMIUM_PATH:
            launch_options["executable_path"] = CHROMIUM_PATH
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport={"width": 1440, "height": 960})
        context.grant_permissions(["camera"], origin=BASE_URL)
        page = context.new_page()

        def record_console_error(message) -> None:
            known_mediapipe_info = message.text.startswith(
                "INFO: Created TensorFlow Lite XNNPACK delegate"
            )
            if message.type == "error" and not known_mediapipe_info:
                console_errors.append(message.text)

        page.on("console", record_console_error)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_function(
            "document.querySelector('#system-state')?.dataset.state === 'ready'",
            timeout=180_000,
        )

        # 首页：品牌图、计划、状态与语音控件都是真实可用的页面内容。
        assert page.locator('[data-view-section="home"]').is_visible()
        assert page.locator(".hero-media img").evaluate("img => img.naturalWidth") == 1672
        assert page.locator("#home-plan-grid .plan-card").count() == 3
        assert page.locator('[data-view-section]').count() == 7
        assert page.locator("#sound-button svg").count() == 1
        assert page.locator("#sound-label").inner_text() == "语音开启"
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path="/tmp/form-coach-home-desktop.png", full_page=True)

        # 动作库：52 个动作在同一页面，并可按徒手部位、瑜伽和哑铃筛选。
        page.locator("#browse-library-button").click()
        assert page.locator('[data-view-section="library"]').is_visible()
        assert page.locator(".exercise-library-card").count() == 52
        assert page.locator(".exercise-library-card img").count() == 52
        page.locator('.exercise-library-card img').evaluate_all(
            """
            images => images.forEach(image => {
              image.loading = 'eager';
              const source = image.src;
              image.removeAttribute('src');
              image.src = source;
            })
            """
        )
        page.wait_for_function(
            "[...document.querySelectorAll('.exercise-library-card img')].every(image => image.complete)",
            timeout=30_000,
        )
        assert page.locator('.exercise-library-card img').evaluate_all(
            "images => images.every(image => image.complete && image.naturalWidth > 0)"
        )
        assert page.locator('[data-library-exercise="squat"]').count() == 1
        assert page.locator('[data-library-exercise="jumping-jack"]').count() == 1
        page.get_by_role("button", name="瑜伽", exact=True).click()
        assert page.locator(".exercise-library-card").count() == 5
        assert page.locator(".exercise-library-card img").count() == 5
        assert page.locator('[data-library-exercise="chair-pose"] .exercise-card-status').inner_text() == "可实时纠正"
        assert page.locator('[data-library-exercise="mountain-pose"] .exercise-card-status').inner_text() == "识别审核中"
        assert page.locator('.exercise-library-card img').evaluate_all(
            "images => images.every(image => image.complete && image.naturalWidth > 0)"
        )
        page.screenshot(path="/tmp/form-coach-yoga-library-desktop.png", full_page=True)
        page.get_by_role("button", name="哑铃", exact=True).click()
        assert page.locator(".exercise-library-card").count() == 20
        assert page.locator('[data-library-exercise="dumbbell-floor-fly"] img').count() == 1

        # 未审核动作可以查看完整教学，但不会用错误识别器冒充可实时纠正。
        page.locator('[data-library-exercise="dumbbell-floor-fly"]').click()
        page.locator("#setup-guide summary").click()
        assert page.locator("#catalog-exercise-media").is_visible()
        assert page.locator("#start-button").is_disabled()
        assert "暂不开放摄像头训练" in page.locator("#controls-help").inner_text()

        page.get_by_role("button", name="动作", exact=True).click()
        page.get_by_role("button", name="全部", exact=True).click()

        # 选择动作进入同一套训练流程，动作示范、肌群和纠正规则随选择更新。
        page.locator('[data-library-exercise="jumping-jack"]').click()
        assert page.locator('[data-view-section="training"]').is_visible()
        assert page.locator("#stage-title").inner_text() == "正面站立，为手脚留出张开空间"
        if page.locator("#setup-guide").get_attribute("open") is None:
            page.locator("#setup-guide summary").click()
        assert page.locator("#jumping-jack-demo").is_visible()
        assert "手脚同步张开" in page.locator("#jumping-jack-demo img").get_attribute("alt")
        assert page.locator("#live-calories").count() == 1

        # 计划详情与整套训练控制：组数、目标、休息和自动摄像头入口都可见。
        page.get_by_role("button", name="计划", exact=True).click()
        assert page.locator("#plan-page-grid .plan-card").count() == 8
        page.locator("#plan-page-grid .plan-card").first.get_by_role("button").click()
        assert page.locator("#plan-dialog").is_visible()
        assert page.locator("#plan-dialog-steps li").count() == 4
        assert "2 组 × 10 次" in page.locator("#plan-dialog-steps li").first.inner_text()
        page.locator("#plan-dialog-start").click()
        page.get_by_role("button", name="关闭摄像头").wait_for(timeout=15_000)
        assert page.locator("#plan-session-bar").is_visible()
        assert page.locator("#plan-phase-label").inner_text() == "训练前热身"
        page.locator("#plan-phase-primary").click()
        assert page.locator("#plan-phase-label").inner_text() == "准备开始"
        page.locator("#plan-phase-primary").click()
        page.wait_for_function("document.querySelector('#plan-phase-overlay').classList.contains('hidden')")
        assert page.locator("#end-button").inner_text() == "结束整套"
        page.locator("#end-button").click()
        assert page.locator('[data-view-section="summary"]').is_visible()
        assert "提前结束" in page.locator("#summary-title").inner_text()
        assert page.locator("#summary-plan-progress-card").is_visible()

        # 快速浏览记录和身体状态，检查功能入口与响应式无溢出。
        page.get_by_role("button", name="记录", exact=True).click()
        assert page.locator("#history-total-calories").count() == 1
        page.get_by_role("button", name="身体", exact=True).click()
        assert page.locator("#weight-input").get_attribute("min") == "30"
        assert page.locator("#weight-input").get_attribute("max") == "250"
        assert not page.locator("#skeleton-toggle").is_checked()

        # 手机：品牌图使用独立竖图，训练反馈不覆盖摄像头，页面无横向滚动。
        page.set_viewport_size({"width": 390, "height": 844})
        page.get_by_role("button", name="动作", exact=True).click()
        page.get_by_role("button", name="瑜伽", exact=True).click()
        assert page.locator(".exercise-library-card").count() == 5
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path="/tmp/form-coach-yoga-library-mobile.png", full_page=True)
        page.get_by_role("button", name="首页", exact=True).click()
        assert page.locator(".hero-card").is_visible()
        assert page.evaluate(
            "getComputedStyle(document.querySelector('.app-nav')).position === 'fixed'"
        )
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path="/tmp/form-coach-home-mobile.png")

        page.locator("#quick-start-button").click()
        layout = page.evaluate(
            """
            () => {
              const box = (selector) => {
                const rect = document.querySelector(selector).getBoundingClientRect();
                return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
              };
              return { camera: box('#camera-frame'), coach: box('#coach-overlay') };
            }
            """
        )
        assert layout["coach"]["top"] >= layout["camera"]["bottom"]
        assert layout["camera"]["left"] >= 0
        assert layout["camera"]["right"] <= 390
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path="/tmp/form-coach-training-mobile.png")

        # 真实控制链：开启摄像头、开始、结束、关闭摄像头并显示总结。
        page.set_viewport_size({"width": 1440, "height": 960})
        page.locator("#camera-button").click()
        page.get_by_role("button", name="关闭摄像头").wait_for(timeout=15_000)
        assert page.locator("#start-button").is_enabled()
        page.locator("#start-button").click()
        assert page.locator("#end-button").is_enabled()
        page.wait_for_timeout(700)
        page.locator("#end-button").click()
        assert page.locator('[data-view-section="summary"]').is_visible()
        assert page.locator("#summary-panel").evaluate(
            "element => document.activeElement === element"
        )
        assert page.locator("#summary-active-time").count() == 1
        assert page.locator("#summary-calories").count() == 1
        assert page.locator("#camera-video").evaluate("video => video.srcObject === null")
        page.screenshot(path="/tmp/form-coach-summary-desktop.png", full_page=True)

        print(
            json.dumps(
                {
                    "system_state": page.locator("#system-state-text").inner_text(),
                    "exercise_cards": page.locator(".exercise-library-card").count(),
                    "plan_cards": page.locator("#plan-page-grid .plan-card").count(),
                    "summary_visible": page.locator("#summary-panel").is_visible(),
                    "camera_stopped": page.locator("#camera-video").evaluate(
                        "video => video.srcObject === null"
                    ),
                    "console_errors": console_errors,
                    "page_errors": page_errors,
                },
                ensure_ascii=False,
            )
        )
        assert not console_errors
        assert not page_errors
        browser.close()


if __name__ == "__main__":
    main()
