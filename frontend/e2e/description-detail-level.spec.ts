/**
 * E2E tests for hidden description detail level behavior.
 *
 * The detail-level selector is intentionally hidden in the current UI,
 * but batch/single-page generation should still send a default value and
 * preserve legacy sessionStorage overrides for backward compatibility.
 */
import { test, expect, type Page } from '@playwright/test'

test.use({ baseURL: process.env.BASE_URL || 'http://localhost:3000' })

const PROJECT_ID = 'mock-proj-detail-level'

function makePage(id: string, index: number, title: string, description?: string) {
  return {
    id,
    page_id: id,
    title,
    sort_order: index,
    order_index: index,
    status: description ? 'DESCRIPTION_GENERATED' : 'DRAFT',
    outline_content: { title, points: [`Point for ${title}`] },
    description_content: description ? { text: description } : null,
    generated_image_path: null,
  }
}

const pages = [
  makePage('p1', 0, 'Title Page'),
  makePage('p2', 1, 'Introduction'),
  makePage('p3', 2, 'Conclusion'),
]

async function setupMockRoutes(page: Page) {
  await page.route('**/api/access-code/check', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { enabled: false } }),
    })
  })

  await page.route('**/api/settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { description_generation_mode: 'parallel' },
      }),
    })
  })

  await page.route(`**/api/projects/${PROJECT_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          project_id: PROJECT_ID,
          id: PROJECT_ID,
          status: 'OUTLINE_GENERATED',
          creation_type: 'idea',
          pages,
        },
      }),
    })
  })

  await page.route(`**/api/reference-files/project/${PROJECT_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { files: [] },
      }),
    })
  })
}

test.describe('Detail level selector — current behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('banana-settings', JSON.stringify({
        description_generation_mode: 'parallel',
      }))
      window.sessionStorage.removeItem('banana-detail-level')
    })
  })

  test('description settings keep generation mode controls but hide detail-level controls', async ({ page }) => {
    await setupMockRoutes(page)

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForSelector('text=批量生成描述')

    await page.getByRole('button', { name: '描述设置' }).click()

    await expect(page.getByRole('button', { name: '流式' })).toBeVisible()
    await expect(page.getByRole('button', { name: '并行' })).toBeVisible()
    await expect(page.getByText('详细程度')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '精简' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '默认' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '详细' })).toHaveCount(0)
  })

  test('batch generate sends default detail_level when selector is hidden', async ({ page }) => {
    await setupMockRoutes(page)

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/api/projects/*/generate/descriptions', async (route) => {
      capturedBody = JSON.parse(route.request().postData() || '{}')
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { task_id: 'mock-task-1' } }),
      })
    })

    await page.route(`**/api/projects/${PROJECT_ID}/tasks/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { task_id: 'mock-task-1', status: 'COMPLETED', progress: { total: 3, completed: 3 } },
        }),
      })
    })

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForSelector('text=批量生成描述')
    await page.getByRole('button', { name: '批量生成描述' }).click()

    await expect.poll(() => capturedBody).toBeTruthy()
    expect(capturedBody?.detail_level).toBe('default')
  })

  test('batch generate keeps legacy sessionStorage detail_level overrides', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('banana-detail-level', 'detailed')
    })
    await setupMockRoutes(page)

    let capturedBody: Record<string, unknown> | null = null
    await page.route('**/api/projects/*/generate/descriptions', async (route) => {
      capturedBody = JSON.parse(route.request().postData() || '{}')
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { task_id: 'mock-task-2' } }),
      })
    })

    await page.route(`**/api/projects/${PROJECT_ID}/tasks/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { task_id: 'mock-task-2', status: 'COMPLETED', progress: { total: 3, completed: 3 } },
        }),
      })
    })

    await page.goto(`/project/${PROJECT_ID}/detail`)
    await page.waitForSelector('text=批量生成描述')
    await page.getByRole('button', { name: '批量生成描述' }).click()

    await expect.poll(() => capturedBody).toBeTruthy()
    expect(capturedBody?.detail_level).toBe('detailed')
  })
})
