/**
 * UI-driven E2E test with Mocked Backend
 * 
 * This test simulates the complete user operation flow but mocks all backend API calls.
 * This allows fast testing (1-2 minutes) without waiting for real AI generation.
 * 
 * Use this for:
 * - Quick UI regression testing
 * - CI/CD pipeline (fast feedback)
 * - Development iteration
 * 
 * For real E2E testing with actual AI, use ui-full-flow.spec.ts
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const MOCK_PROJECT_ID = 'mock-project-123'
const MOCK_PAGE_TITLES = ['什么是AI', 'AI的应用', 'AI的未来']
const FRONTEND_DIR = process.cwd().endsWith('frontend')
  ? process.cwd()
  : path.join(process.cwd(), 'frontend')

type MockStage = 'draft' | 'outline' | 'descriptions' | 'images'

function buildMockProject(stage: MockStage) {
  const statusByStage = {
    draft: 'DRAFT',
    outline: 'OUTLINE_GENERATED',
    descriptions: 'DESCRIPTIONS_GENERATED',
    images: 'COMPLETED',
  } as const

  const now = new Date().toISOString()
  const pages = stage === 'draft'
    ? []
    : MOCK_PAGE_TITLES.map((title, index) => ({
        page_id: `mock-page-${index + 1}`,
        order_index: index,
        outline_content: {
          title,
          points: [`${title} 要点 1`, `${title} 要点 2`],
        },
        description_content: (
          stage === 'descriptions' || stage === 'images'
            ? {
                text: `${title} 的页面描述`,
                extra_fields: { 排版布局: index === 0 ? '居中布局' : '左右分栏' },
              }
            : undefined
        ),
        generated_image_url: (
          stage === 'images'
            ? `/files/${MOCK_PROJECT_ID}/pages/mock-page-${index + 1}.png`
            : undefined
        ),
        status: stage === 'images'
          ? 'COMPLETED'
          : stage === 'descriptions'
            ? 'DESCRIPTION_GENERATED'
            : 'DRAFT',
        created_at: now,
        updated_at: now,
      }))

  return {
    project_id: MOCK_PROJECT_ID,
    idea_prompt: '创建一份关于人工智能基础的简短PPT',
    creation_type: 'idea',
    template_style: 'default',
    image_aspect_ratio: '16:9',
    status: statusByStage[stage],
    pages,
    created_at: now,
    updated_at: now,
  }
}

test.describe('UI-driven E2E test (Mocked Backend)', () => {
  test.setTimeout(2 * 60 * 1000) // 2 minutes max
  
  test('User Full Flow: Create and export PPT with mocked API', async ({ page }) => {
    console.log('\n========================================')
    console.log('🌐 Starting UI-driven E2E test (Mocked Backend)')
    console.log('========================================\n')
    
    await page.addInitScript(() => {
      localStorage.removeItem('auth-storage')
      localStorage.setItem('hasSeenHelpModal', 'true')
    })

    let mockStage: MockStage = 'draft'

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

    await page.route('**/api/output-language', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { language: 'zh' } }),
      })
    })

    // Mock API responses
    await page.route('**/api/projects', async (route) => {
      const method = route.request().method()
      if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              project_id: MOCK_PROJECT_ID,
              status: 'DRAFT'
            }
          })
        })
      } else if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              projects: [],
              total: 0,
            },
          }),
        })
      } else {
        await route.continue()
      }
    })
    
    // Mock outline generation
    await page.route('**/api/projects/*/generate/outline/stream', async (route) => {
      mockStage = 'outline'
      const project = buildMockProject(mockStage)
      const sseEvents = project.pages.map((mockPage, index) => (
        `event: page\ndata: ${JSON.stringify({
          index,
          title: mockPage.outline_content.title,
          points: mockPage.outline_content.points,
        })}\n\n`
      ))
      const doneEvent = `event: done\ndata: ${JSON.stringify({
        total: project.pages.length,
        pages: project.pages,
        complete: true,
      })}\n\n`

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: sseEvents.join('') + doneEvent,
      })
    })

    await page.route('**/api/projects/*/generate/outline', async (route) => {
      mockStage = 'outline'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { pages: buildMockProject(mockStage).pages }
        })
      })
    })
    
    await page.route(`**/api/projects/${MOCK_PROJECT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: buildMockProject(mockStage),
        })
      })
    })
    
    // Mock description generation
    await page.route('**/api/projects/*/generate/descriptions/stream', async (route) => {
      mockStage = 'descriptions'
      const project = buildMockProject(mockStage)
      const body = `event: done\ndata: ${JSON.stringify({
        total: project.pages.length,
        pages: project.pages,
      })}\n\n`

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body,
      })
    })

    await page.route('**/api/projects/*/generate/descriptions', async (route) => {
      mockStage = 'descriptions'
      await route.fulfill({
        status: 202,  // 202 Accepted for async operations
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { task_id: 'mock-desc-task' }
        })
      })
    })
    
    // Mock image generation
    await page.route('**/api/projects/*/generate/images', async (route) => {
      mockStage = 'images'
      await route.fulfill({
        status: 202,  // 202 Accepted for async operations
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { task_id: 'mock-image-task' }
        })
      })
    })

    await page.route('**/api/projects/*/tasks/*', async (route) => {
      const taskId = route.request().url().split('/').pop() || 'mock-task'
      const taskType = taskId.includes('image')
        ? 'GENERATE_IMAGES'
        : taskId.includes('desc')
          ? 'GENERATE_DESCRIPTIONS'
          : 'UNKNOWN'

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            task_id: taskId,
            task_type: taskType,
            status: 'COMPLETED',
            progress: {
              total: MOCK_PAGE_TITLES.length,
              completed: MOCK_PAGE_TITLES.length,
              failed: 0,
            },
          },
        }),
      })
    })

    await page.route(`**/files/${MOCK_PROJECT_ID}/**`, async (route) => {
      const fixturePath = path.join(FRONTEND_DIR, 'e2e', 'fixtures', 'slide_1.jpg')
      if (!fs.existsSync(fixturePath)) {
        await route.fulfill({ status: 404 })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: fs.readFileSync(fixturePath),
      })
    })
    
    // Mock PPT export
    await page.route('**/api/projects/*/export/pptx**', async (route) => {
      // Create a minimal mock PPTX file
      const mockPptxPath = path.join(FRONTEND_DIR, 'e2e', 'fixtures', 'mock-presentation.pptx')
      
      if (fs.existsSync(mockPptxPath)) {
        const buffer = fs.readFileSync(mockPptxPath)
        await route.fulfill({
          status: 200,
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          body: buffer
        })
      } else {
        // If mock file doesn't exist, return a simple response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              download_url: '/files/mock-project-123/exports/mock-presentation.pptx'
            }
          })
        })
      }
    })
    
    // ====================================
    // Step 1: Visit homepage
    // ====================================
    console.log('📱 Step 1: Opening homepage...')
    await page.goto('http://localhost:3000')
    await expect(page).toHaveTitle(/蕉幻|Banana/i)
    console.log('✓ Homepage loaded successfully\n')
    
    // ====================================
    // Step 2: Ensure "一句话生成" tab is selected (it's selected by default)
    // ====================================
    console.log('🖱️  Step 2: Ensuring "一句话生成" tab is selected...')
    // The "一句话生成" tab is selected by default, but we can click it to ensure it's active
    await page.click('button:has-text("一句话生成")').catch(() => {
      // If click fails, the tab might already be selected, which is fine
    })
    await page.waitForSelector('[role="textbox"], textarea, input[type="text"]', { timeout: 10000 })
    console.log('✓ Create form displayed\n')
    
    // ====================================
    // Step 3: Enter idea and click "Next"
    // ====================================
    console.log('✍️  Step 3: Entering idea content...')
    const ideaInput = page.locator('[role="textbox"], textarea, input[type="text"]').first()
    await ideaInput.click()
    await ideaInput.pressSequentially('创建一份关于人工智能基础的简短PPT，包含3页：什么是AI、AI的应用、AI的未来')
    
    console.log('🚀 Clicking "Next" button...')
    await page.click('button:has-text("下一步")')
    
    // Wait for navigation (mocked response should be fast)
    await page.waitForTimeout(1000)
    console.log('✓ Clicked "Next" button\n')
    
    // ====================================
    // Step 4: Verify outline editor page loaded
    // ====================================
    console.log('📋 Step 4: Verifying outline editor page...')
    await page.waitForSelector('button:has-text("自动生成大纲"), button:has-text("重新生成大纲")', { timeout: 10000 })
    console.log('✓ Outline editor page loaded\n')
    
    // ====================================
    // Step 5: Click generate outline (mocked)
    // ====================================
    console.log('📋 Step 5: Clicking batch generate outline button (mocked)...')
    const generateOutlineBtn = page.locator('button:has-text("自动生成大纲"), button:has-text("重新生成大纲")')
    await generateOutlineBtn.first().click()
    
    // Wait for mocked response (should be instant, but UI might need time to update)
    await page.waitForTimeout(2000)
    console.log('✓ Mocked outline generation triggered\n')
    
    // ====================================
    // Step 6: Verify UI shows outline (mocked data)
    // ====================================
    console.log('✅ Step 6: Verifying UI shows outline items...')
    await expect(page.locator('text=/第 \\d+ 页/').first()).toBeVisible({ timeout: 10000 })
    console.log('✓ Outline items visible in UI\n')
    
    // ====================================
    // Step 7: Navigate to description editor
    // ====================================
    console.log('➡️  Step 7: Clicking "Next" to go to description editor...')
    const nextBtn = page.locator('button:has-text("下一步")')
    if (await nextBtn.count() > 0) {
      await nextBtn.first().click()
      await page.waitForTimeout(1000)
      console.log('✓ Navigated to description editor\n')
    }
    
    // ====================================
    // Step 8: Test description generation UI (mocked)
    // ====================================
    console.log('✍️  Step 8: Testing description generation UI (mocked)...')
    await page.waitForSelector('button:has-text("批量生成描述")', { timeout: 10000 })
    const generateDescBtn = page.locator('button:has-text("批量生成描述")')
    await generateDescBtn.first().click()
    await page.waitForTimeout(2000) // Mock response should be fast
    console.log('✓ Mocked description generation triggered\n')
    
    // ====================================
    // Step 9: Navigate to image generation
    // ====================================
    console.log('➡️  Step 9: Navigating to image generation page...')
    const generateImagesNavBtn = page.locator('button:has-text("生成图片")').first()
    await generateImagesNavBtn.click()
    await page.waitForURL(/\/project\/.*\/preview/, { timeout: 10000 })
    console.log('✓ Navigated to image generation page\n')
    
    // ====================================
    // Step 10: Test image generation UI (mocked)
    // ====================================
    console.log('🎨 Step 10: Testing image generation UI (mocked)...')
    await page.waitForSelector('button:has-text("批量生成图片")', { timeout: 10000 })
    const generateImageBtn = page.locator('button:has-text("批量生成图片")')
    if (await generateImageBtn.count() > 0) {
      await generateImageBtn.first().click()
      await page.waitForTimeout(2000)
      console.log('✓ Mocked image generation triggered\n')
    }
    
    // ====================================
    // Step 11: Test export UI
    // ====================================
    console.log('📦 Step 11: Testing export UI...')
    const exportBtn = page.locator('button:has-text("导出"), button:has-text("下载"), button:has-text("完成")')
    
    if (await exportBtn.count() > 0) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
      await exportBtn.first().click()
      
      const download = await downloadPromise
      if (download) {
        const downloadPath = path.join('test-results', 'e2e-mocked-test-output.pptx')
        await download.saveAs(downloadPath)
        console.log(`✓ Mock PPT file downloaded: ${downloadPath}\n`)
      } else {
        console.log('⚠️  Download event not triggered (may be handled differently in UI)\n')
      }
    }
    
    // ====================================
    // Final verification
    // ====================================
    console.log('========================================')
    console.log('✅ Mocked E2E test completed!')
    console.log('========================================\n')
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'test-results/e2e-mocked-final-state.png',
      fullPage: true 
    })
  })
})
