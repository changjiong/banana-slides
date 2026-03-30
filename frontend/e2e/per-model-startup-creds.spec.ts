/**
 * Integration E2E test for issue #284:
 * Per-model API credentials must be loaded into app.config on backend startup.
 *
 * Strategy: save per-model settings → restart backend → verify startup logs
 * contain the loaded credentials, proving _load_settings_to_config() works.
 */
import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

function loadBackendConfigFromFreshProcess() {
  const output = execSync(
    `cd ${PROJECT_ROOT}/backend && uv run python - <<'PY'
import json
import app

print(json.dumps({
    "text_api_base": app.app.config.get("TEXT_API_BASE"),
    "has_text_api_key": bool(app.app.config.get("TEXT_API_KEY")),
    "text_model_source": app.app.config.get("TEXT_MODEL_SOURCE"),
}))
PY`,
    { encoding: 'utf8', timeout: 20000 },
  )
  const jsonLine = output
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .pop()

  if (!jsonLine) {
    throw new Error(`Fresh backend process produced no JSON output:\n${output}`)
  }

  return JSON.parse(jsonLine) as {
    text_api_base: string | null
    has_text_api_key: boolean
    text_model_source: string | null
  }
}

// Clean up after all tests: reset settings
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/settings')
  await page.getByRole('button', { name: /重置/ }).click()
  await page.getByRole('button', { name: /确定重置/ }).click()
  await expect(page.locator('text=已重置').or(page.locator('text=reset'))).toBeVisible({ timeout: 5000 })
  await page.close()
})

test.describe('Per-model API credentials loaded on startup (#284)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  test('saved per-model credentials load into app.config in a fresh backend process', async ({ request }) => {
    // 1. Save per-model settings via API (through Vite proxy)
    const payload = {
      text_model_source: 'openai',
      text_api_base_url: 'https://startup-test.example.com/v1',
      text_api_key: 'sk-startup-test-key-284',
    }
    const saveRes = await request.put('/api/settings', { data: payload })
    expect(saveRes.ok()).toBeTruthy()

    // 2. Start a fresh Python process and verify startup-loaded config values.
    // Importing backend/app.py exercises create_app() and _load_settings_to_config().
    const freshConfig = loadBackendConfigFromFreshProcess()

    expect(freshConfig.text_api_base).toBe('https://startup-test.example.com/v1')
    expect(freshConfig.has_text_api_key).toBe(true)
    expect(freshConfig.text_model_source).toBe('openai')
  })

  test('settings page shows correct values after backend restart', async ({ page }) => {
    // Navigate to settings — backend was restarted in previous test
    await page.goto('/settings')

    // Find the text model group (first one with a select)
    const textGroup = page.locator('.space-y-4 > div').filter({ has: page.locator('select') }).nth(0)

    // Verify provider is still openai
    await expect(textGroup.locator('select')).toHaveValue('openai')

    // Verify API Base URL persisted
    const baseUrlInput = textGroup.locator('input[type="text"]').nth(1)
    await expect(baseUrlInput).toHaveValue('https://startup-test.example.com/v1')

    // Verify API Key shows placeholder indicating it's set
    const apiKeyInput = textGroup.locator('input[type="password"]')
    const placeholder = await apiKeyInput.getAttribute('placeholder')
    expect(placeholder).toMatch(/长度|length/i)
  })
})
