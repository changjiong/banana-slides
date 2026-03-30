import { test, expect, type Locator, type Page } from '@playwright/test';

test.use({ baseURL: process.env.BASE_URL || 'http://localhost:3000' });

type MockReferenceFile = {
  id: string;
  filename: string;
  created_at: string;
  file_size: number;
  project_id?: string | null;
  parse_status?: 'pending' | 'parsing' | 'completed' | 'failed';
};

const mockReferenceFile = ({
  id,
  filename,
  created_at,
  file_size,
  project_id = null,
  parse_status = 'completed',
}: MockReferenceFile) => ({
  id,
  project_id,
  filename,
  file_size,
  file_type: 'application/pdf',
  parse_status,
  markdown_content: null,
  error_message: null,
  created_at,
  updated_at: created_at,
});

const mockProjects = [
  { project_id: 'proj1', idea_prompt: 'Project Alpha' },
  { project_id: 'proj2', idea_prompt: 'Project Beta' },
  { project_id: 'proj3', idea_prompt: 'Project Gamma' },
];

const openReferenceFileSelector = async (page: Page): Promise<Locator> => {
  await page.goto('/');
  await page.getByRole('button', { name: '选择参考文件' }).click();

  const modal = page.getByRole('dialog', { name: '选择参考文件' });
  await expect(modal).toBeVisible();
  return modal;
};

test.describe('Attachment Sorting and Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('hasSeenHelpModal', 'true');
    });

    await page.route('**/api/user-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { templates: [] },
        }),
      });
    });
  });

  test('should sort attachments by newest first (default)', async ({ page }) => {
    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { projects: [], total: 0 },
        }),
      });
    });

    await page.route('**/api/reference-files/project/all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            files: [
              mockReferenceFile({ id: '1', filename: 'old.pdf', created_at: '2024-01-01T00:00:00Z', file_size: 1000 }),
              mockReferenceFile({ id: '2', filename: 'new.pdf', created_at: '2024-12-01T00:00:00Z', file_size: 2000 }),
              mockReferenceFile({ id: '3', filename: 'middle.pdf', created_at: '2024-06-01T00:00:00Z', file_size: 1500 }),
            ],
          },
        }),
      });
    });

    const modal = await openReferenceFileSelector(page);
    const fileItems = modal.locator('.divide-y > div');

    await expect(fileItems.nth(0)).toContainText('new.pdf');
    await expect(fileItems.nth(1)).toContainText('middle.pdf');
    await expect(fileItems.nth(2)).toContainText('old.pdf');
  });

  test('should sort attachments by oldest first', async ({ page }) => {
    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { projects: [], total: 0 },
        }),
      });
    });

    await page.route('**/api/reference-files/project/all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            files: [
              mockReferenceFile({ id: '1', filename: 'old.pdf', created_at: '2024-01-01T00:00:00Z', file_size: 1000 }),
              mockReferenceFile({ id: '2', filename: 'new.pdf', created_at: '2024-12-01T00:00:00Z', file_size: 2000 }),
            ],
          },
        }),
      });
    });

    const modal = await openReferenceFileSelector(page);
    await modal.getByRole('button', { name: '从新到旧' }).click();

    const fileItems = modal.locator('.divide-y > div');
    await expect(fileItems.nth(0)).toContainText('old.pdf');
    await expect(fileItems.nth(1)).toContainText('new.pdf');
  });

  test('should sort attachments by name A-Z', async ({ page }) => {
    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { projects: [], total: 0 },
        }),
      });
    });

    await page.route('**/api/reference-files/project/all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            files: [
              mockReferenceFile({ id: '1', filename: 'zebra.pdf', created_at: '2024-01-01T00:00:00Z', file_size: 1000 }),
              mockReferenceFile({ id: '2', filename: 'apple.pdf', created_at: '2024-01-01T00:00:00Z', file_size: 2000 }),
              mockReferenceFile({ id: '3', filename: 'banana.pdf', created_at: '2024-01-01T00:00:00Z', file_size: 1500 }),
            ],
          },
        }),
      });
    });

    const modal = await openReferenceFileSelector(page);
    await modal.getByRole('button', { name: '从新到旧' }).click();
    await modal.getByRole('button', { name: '从旧到新' }).click();

    const fileItems = modal.locator('.divide-y > div');
    await expect(fileItems.nth(0)).toContainText('apple.pdf');
    await expect(fileItems.nth(1)).toContainText('banana.pdf');
    await expect(fileItems.nth(2)).toContainText('zebra.pdf');
  });

  test('should sort attachments by name Z-A', async ({ page }) => {
    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { projects: [], total: 0 },
        }),
      });
    });

    await page.route('**/api/reference-files/project/all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            files: [
              mockReferenceFile({ id: '1', filename: 'apple.pdf', created_at: '2024-01-01T00:00:00Z', file_size: 1000 }),
              mockReferenceFile({ id: '2', filename: 'zebra.pdf', created_at: '2024-01-01T00:00:00Z', file_size: 2000 }),
            ],
          },
        }),
      });
    });

    const modal = await openReferenceFileSelector(page);
    await modal.getByRole('button', { name: '从新到旧' }).click();
    await modal.getByRole('button', { name: '从旧到新' }).click();
    await modal.getByRole('button', { name: 'A-Z' }).click();

    const fileItems = modal.locator('.divide-y > div');
    await expect(fileItems.nth(0)).toContainText('zebra.pdf');
    await expect(fileItems.nth(1)).toContainText('apple.pdf');
  });

  test('should show all projects in filter dropdown', async ({ page }) => {
    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            projects: mockProjects,
            total: mockProjects.length,
          },
        }),
      });
    });

    await page.route('**/api/reference-files/project/all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { files: [] },
        }),
      });
    });

    const modal = await openReferenceFileSelector(page);
    const filterSelect = modal.locator('select').first();

    await expect(filterSelect.locator('option')).toHaveCount(5);
    await expect(filterSelect).toContainText('Project Alpha');
    await expect(filterSelect).toContainText('Project Beta');
    await expect(filterSelect).toContainText('Project Gamma');
  });

  test('should filter by specific project with one click', async ({ page }) => {
    let requestedProjectId = '';

    await page.route('**/api/projects*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            projects: mockProjects.slice(0, 2),
            total: 2,
          },
        }),
      });
    });

    await page.route('**/api/reference-files/project/**', async (route) => {
      const url = new URL(route.request().url());
      requestedProjectId = url.pathname.split('/').pop() ?? '';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            files: requestedProjectId === 'proj2'
              ? [
                  mockReferenceFile({
                    id: 'f1',
                    filename: 'beta-file.pdf',
                    created_at: '2024-01-01T00:00:00Z',
                    file_size: 1000,
                    project_id: 'proj2',
                  }),
                ]
              : [],
          },
        }),
      });
    });

    const modal = await openReferenceFileSelector(page);
    const filterSelect = modal.locator('select').first();

    await filterSelect.selectOption('proj2');
    await expect
      .poll(() => requestedProjectId, {
        message: 'project filter request should target the selected project',
      })
      .toBe('proj2');
    await expect(modal.locator('.divide-y > div')).toContainText('beta-file.pdf');
  });
});
