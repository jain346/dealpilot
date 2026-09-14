import asyncio
import time
import os
import subprocess
import httpx
from playwright.async_api import async_playwright

RAW_VIDEO_DIR = "/Users/punitgarg/Documents/Hackathon_NEW/dealpilot/video_assets/raw_video"
AUDIO_DIR = "/Users/punitgarg/Documents/Hackathon_NEW/dealpilot/video_assets/audio"
OUTPUT_DIR = "/Users/punitgarg/Documents/Hackathon_NEW/dealpilot/video_assets"
FFMPEG = "/Users/punitgarg/Documents/Hackathon_NEW/dealpilot/.venv/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"

os.makedirs(RAW_VIDEO_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

# Scene timeline (in seconds from start):
# Scene 1: 0.00 -> 24.38 (gap -> 25.18)
# Scene 2: 25.18 -> 50.50 (gap -> 51.30)
# Scene 3: 51.30 -> 74.65 (gap -> 75.45)
# Scene 4: 75.45 -> 100.34 (gap -> 101.14)
# Scene 5: 101.14 -> 120.87 (gap -> 121.67)
# Scene 6: 121.67 -> 145.84

async def inject_cursor(page):
    await page.evaluate("""() => {
        if (document.getElementById('custom-mouse-pointer')) return;
        const cursor = document.createElement('div');
        cursor.id = 'custom-mouse-pointer';
        cursor.style.position = 'fixed';
        cursor.style.top = '0';
        cursor.style.left = '0';
        cursor.style.width = '22px';
        cursor.style.height = '22px';
        cursor.style.border = '2px solid #6366f1';
        cursor.style.borderRadius = '50%';
        cursor.style.backgroundColor = 'rgba(99, 102, 241, 0.4)';
        cursor.style.pointerEvents = 'none';
        cursor.style.zIndex = '999999';
        cursor.style.transition = 'transform 0.1s ease-out, background-color 0.15s ease';
        cursor.style.transform = 'translate(-50%, -50%)';
        cursor.style.boxShadow = '0 0 12px rgba(99, 102, 241, 0.8)';
        document.body.appendChild(cursor);

        window.addEventListener('mousemove', (e) => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
        });
        window.addEventListener('mousedown', () => {
            cursor.style.transform = 'translate(-50%, -50%) scale(0.7)';
            cursor.style.backgroundColor = 'rgba(236, 72, 153, 0.7)';
        });
        window.addEventListener('mouseup', () => {
            cursor.style.transform = 'translate(-50%, -50%) scale(1)';
            cursor.style.backgroundColor = 'rgba(99, 102, 241, 0.4)';
        });
    }""")

async def move_cursor(page, x, y, steps=25):
    await page.mouse.move(x, y, steps=steps)

async def smooth_scroll(page, target_y, duration=1.5, steps=30):
    current_y = await page.evaluate("() => window.scrollY")
    diff = target_y - current_y
    for i in range(1, steps + 1):
        y = current_y + (diff * (i / steps))
        await page.evaluate(f"window.scrollTo(0, {y})")
        await asyncio.sleep(duration / steps)

async def main():
    print("Starting DealPilot Presentation Recording...")
    start_time = time.time()

    # 1. Fetch valid auth token for punit12
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://dealpilot-1051036456747.us-central1.run.app/auth/google",
            json={"email": "punitgarg1234@gmail.com", "name": "Punit Garg"}
        )
        token_data = resp.text
        print("Backend token obtained.")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=RAW_VIDEO_DIR,
            record_video_size={"width": 1920, "height": 1080},
            device_scale_factor=1
        )
        page = await context.new_page()

        # Intercept auth token to bind punit12 login seamlessly
        await page.route("**/auth/token", lambda r: r.fulfill(status=200, content_type="application/json", body=token_data))

        print("[0.0s] Scene 1: Opening DealPilot landing page...")
        await page.goto("https://dealpilot-1051036456747.us-central1.run.app/")
        await page.wait_for_selector(".auth-screen")
        await inject_cursor(page)
        await move_cursor(page, 500, 300, steps=20)

        # Highlight value proposition
        await asyncio.sleep(4.0)
        await move_cursor(page, 450, 420, steps=25)
        await asyncio.sleep(3.0)
        await move_cursor(page, 480, 500, steps=25)
        await asyncio.sleep(4.0)

        # Move to auth card on right
        await move_cursor(page, 1300, 350, steps=30)
        await asyncio.sleep(3.0)
        await move_cursor(page, 1250, 240, steps=20)
        await asyncio.sleep(2.0)

        # Wait until Scene 2 start (25.18s)
        elapsed = time.time() - start_time
        if elapsed < 25.18:
            await asyncio.sleep(25.18 - elapsed)

        print(f"[{time.time() - start_time:.2f}s] Scene 2: Authentication & Profile...")
        # Ensure login tab is active
        login_tab = page.locator('.auth-tabs button:has-text("Log in")')
        if await login_tab.count() > 0:
            box = await login_tab.bounding_box()
            if box:
                await move_cursor(page, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
                await login_tab.click()
                await asyncio.sleep(0.5)

        # Fill username punit12 smoothly
        u_input = page.locator('input[placeholder="Enter your username"]')
        box_u = await u_input.bounding_box()
        if box_u:
            await move_cursor(page, box_u["x"] + 50, box_u["y"] + box_u["height"]/2, steps=15)
            await u_input.click()
            await page.keyboard.type("punit12", delay=120)
        await asyncio.sleep(1.0)

        # Fill password punit1234garg
        p_input = page.locator('input[type="password"]')
        box_p = await p_input.bounding_box()
        if box_p:
            await move_cursor(page, box_p["x"] + 50, box_p["y"] + box_p["height"]/2, steps=15)
            await p_input.click()
            await page.keyboard.type("punit1234garg", delay=90)
        await asyncio.sleep(1.2)

        # Click submit
        sub_btn = page.locator(".auth-submit-btn")
        box_s = await sub_btn.bounding_box()
        if box_s:
            await move_cursor(page, box_s["x"] + box_s["width"]/2, box_s["y"] + box_s["height"]/2, steps=15)
            await sub_btn.click()

        # Wait for dashboard
        await page.wait_for_selector(".product-sidebar", timeout=15000)
        await inject_cursor(page)
        print(f"[{time.time() - start_time:.2f}s] Logged in! Exploring Creator Profile...")
        await asyncio.sleep(2.0)

        # Move cursor to Creator Profile card
        await move_cursor(page, 950, 420, steps=30)
        await asyncio.sleep(3.0)
        await move_cursor(page, 1050, 520, steps=25)
        await asyncio.sleep(3.0)
        await move_cursor(page, 880, 680, steps=25)
        await asyncio.sleep(2.0)

        # Wait until Scene 3 start (51.30s)
        elapsed = time.time() - start_time
        if elapsed < 51.30:
            await asyncio.sleep(51.30 - elapsed)

        print(f"[{time.time() - start_time:.2f}s] Scene 3: Navigating to Opportunities...")
        opp_btn = page.locator('aside button:has-text("Opportunities")')
        box_opp = await opp_btn.bounding_box()
        if box_opp:
            await move_cursor(page, box_opp["x"] + box_opp["width"]/2, box_opp["y"] + box_opp["height"]/2, steps=20)
            await opp_btn.click()
        await page.wait_for_timeout(1500)
        await inject_cursor(page)

        # Explore opportunities feed
        await move_cursor(page, 700, 320, steps=25)
        await asyncio.sleep(3.0)
        # Hover over Cursor opportunity card
        cursor_card = page.locator('text=Cursor').first
        box_c = await cursor_card.bounding_box()
        if box_c:
            await move_cursor(page, box_c["x"] + 150, box_c["y"] + 60, steps=25)
        await asyncio.sleep(4.0)
        # Move across confidence score and Why You tags
        await move_cursor(page, 950, 480, steps=20)
        await asyncio.sleep(3.0)
        await move_cursor(page, 1100, 520, steps=20)
        await asyncio.sleep(3.0)
        # Scroll down slightly to show other opportunities (Hostinger, Sentry)
        await page.evaluate("window.scrollBy({top: 250, behavior: 'smooth'})")
        await asyncio.sleep(3.0)

        # Wait until Scene 4 start (75.45s)
        elapsed = time.time() - start_time
        if elapsed < 75.45:
            await asyncio.sleep(75.45 - elapsed)

        print(f"[{time.time() - start_time:.2f}s] Scene 4: Deep Brand Research Agent...")
        res_btn = page.locator('aside button:has-text("Research")')
        box_res = await res_btn.bounding_box()
        if box_res:
            await move_cursor(page, box_res["x"] + box_res["width"]/2, box_res["y"] + box_res["height"]/2, steps=20)
            await res_btn.click()
        await page.wait_for_timeout(1500)
        await inject_cursor(page)

        # Show brand intelligence
        await move_cursor(page, 800, 350, steps=25)
        await asyncio.sleep(4.0)
        # Scroll through research findings
        await page.evaluate("window.scrollBy({top: 300, behavior: 'smooth'})")
        await move_cursor(page, 900, 500, steps=25)
        await asyncio.sleep(4.0)
        await page.evaluate("window.scrollBy({top: 350, behavior: 'smooth'})")
        await move_cursor(page, 850, 600, steps=25)
        await asyncio.sleep(4.0)
        await page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
        await asyncio.sleep(2.0)

        # Wait until Scene 5 start (101.14s)
        elapsed = time.time() - start_time
        if elapsed < 101.14:
            await asyncio.sleep(101.14 - elapsed)

        print(f"[{time.time() - start_time:.2f}s] Scene 5: Quantitative Fit Scoring...")
        fit_btn = page.locator('aside button:has-text("Fit")')
        box_fit = await fit_btn.bounding_box()
        if box_fit:
            await move_cursor(page, box_fit["x"] + box_fit["width"]/2, box_fit["y"] + box_fit["height"]/2, steps=20)
            await fit_btn.click()
        await page.wait_for_timeout(1500)
        await inject_cursor(page)

        # Highlight fit score 93 and score cards
        await move_cursor(page, 750, 360, steps=25)
        await asyncio.sleep(3.5)
        await move_cursor(page, 1050, 360, steps=25)
        await asyncio.sleep(3.5)
        # Scroll down to Pitch Hooks
        await page.evaluate("window.scrollBy({top: 350, behavior: 'smooth'})")
        await move_cursor(page, 900, 550, steps=25)
        await asyncio.sleep(4.0)
        await move_cursor(page, 850, 700, steps=25)
        await asyncio.sleep(2.0)

        # Wait until Scene 6 start (121.67s)
        elapsed = time.time() - start_time
        if elapsed < 121.67:
            await asyncio.sleep(121.67 - elapsed)

        print(f"[{time.time() - start_time:.2f}s] Scene 6: Deal Copilot & Architecture Outro...")
        conv_btn = page.locator('aside button:has-text("Conversations")')
        box_conv = await conv_btn.bounding_box()
        if box_conv:
            await move_cursor(page, box_conv["x"] + box_conv["width"]/2, box_conv["y"] + box_conv["height"]/2, steps=20)
            await conv_btn.click()
        await page.wait_for_timeout(1500)
        await inject_cursor(page)

        # Focus chat workspace
        await move_cursor(page, 850, 450, steps=25)
        await asyncio.sleep(3.0)
        # Select or show active conversation thread
        thread_item = page.locator('.chat-history-item, .recents-item, button:has-text("Research")').first
        if await thread_item.count() > 0:
            box_t = await thread_item.bounding_box()
            if box_t:
                await move_cursor(page, box_t["x"] + box_t["width"]/2, box_t["y"] + box_t["height"]/2, steps=15)
                await thread_item.click()
                await asyncio.sleep(1.0)

        # Scroll down chat messages to show Director Agent synthesis
        await page.evaluate("window.scrollBy({top: 400, behavior: 'smooth'})")
        await move_cursor(page, 950, 550, steps=25)
        await asyncio.sleep(4.0)
        await move_cursor(page, 900, 700, steps=25)
        await asyncio.sleep(4.0)

        # Wait until total duration 146.0s
        elapsed = time.time() - start_time
        if elapsed < 146.0:
            await asyncio.sleep(146.0 - elapsed)

        print(f"Recording complete at {time.time() - start_time:.2f}s. Saving context...")
        await context.close()
        await browser.close()

    print("Browser closed. Finding recorded webm file...")
    files = [os.path.join(RAW_VIDEO_DIR, f) for f in os.listdir(RAW_VIDEO_DIR) if f.endswith(".webm")]
    if not files:
        raise RuntimeError("No recorded webm video found in " + RAW_VIDEO_DIR)
    latest_video = max(files, key=os.path.getmtime)
    print("Latest video:", latest_video)

    master_audio = os.path.join(AUDIO_DIR, "master_narration.wav")
    final_output = os.path.join(OUTPUT_DIR, "dealpilot_hackathon_demo.mp4")

    print(f"Muxing final MP4 with high quality audio to {final_output}...")
    cmd = [
        FFMPEG, "-y",
        "-i", latest_video,
        "-i", master_audio,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        final_output
    ]
    subprocess.run(cmd, check=True)

    # Inspect final video info
    info = subprocess.run([FFMPEG, "-i", final_output], capture_output=True, text=True)
    for line in info.stderr.splitlines():
        if "Duration:" in line or "Video:" in line or "Audio:" in line:
            print("Final Video Info:", line.strip())

    file_size_mb = os.path.getsize(final_output) / (1024 * 1024)
    print(f"DONE! Final video generated: {final_output} ({file_size_mb:.2f} MB)")

if __name__ == "__main__":
    asyncio.run(main())
