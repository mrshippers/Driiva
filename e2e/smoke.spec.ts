import { test, expect } from '@playwright/test';

// =============================================================================
// SMOKE TESTS — Core pages load without errors
// =============================================================================

test.describe('Public pages load', () => {
  test('welcome page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Driiva/i);
  });

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.locator('h1')).toContainText('Terms');
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('h1')).toContainText('Privacy');
  });

  test('IPID page loads', async ({ page }) => {
    await page.goto('/ipid');
    await expect(page.locator('h1')).toContainText(/Insurance Product/i);
  });

  test('trust page loads', async ({ page }) => {
    await page.goto('/trust');
    await expect(page.locator('text=Trust')).toBeVisible();
  });
});

// =============================================================================
// AUTH FLOW — Sign-in page renders correctly
// =============================================================================

test.describe('Auth pages', () => {
  test('sign-in page renders with email and password fields', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('sign-up page renders', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
  });

  test('forgot password page renders', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
  });

  test('unauthenticated user redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to signin or welcome
    await page.waitForURL(/\/(signin|welcome|login|$)/);
  });
});

// =============================================================================
// COOKIE CONSENT — Banner appears for new visitors
// =============================================================================

test.describe('Cookie consent', () => {
  test('cookie banner appears on first visit', async ({ page, context }) => {
    await context.clearCookies();
    // Clear localStorage
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const banner = page.locator('text=We use cookies');
    await expect(banner).toBeVisible({ timeout: 5000 });
  });

  test('accepting cookies hides banner', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const acceptButton = page.locator('button:has-text("Accept")');
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
      await expect(page.locator('text=We use cookies')).not.toBeVisible();
    }
  });

  test('rejecting cookies hides banner', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const rejectButton = page.locator('button:has-text("Reject")');
    if (await rejectButton.isVisible()) {
      await rejectButton.click();
      await expect(page.locator('text=We use cookies')).not.toBeVisible();
    }
  });

  test('banner does not reappear after choice', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('driiva_analytics_consent', 'true'));
    await page.reload();
    await expect(page.locator('text=We use cookies')).not.toBeVisible();
  });
});

// =============================================================================
// NAVIGATION — Links work between pages
// =============================================================================

test.describe('Navigation', () => {
  test('terms link from welcome page works', async ({ page }) => {
    await page.goto('/');
    const termsLink = page.locator('a[href="/terms"]').first();
    if (await termsLink.isVisible()) {
      await termsLink.click();
      await expect(page).toHaveURL(/\/terms/);
    }
  });

  test('privacy link works', async ({ page }) => {
    await page.goto('/');
    const privacyLink = page.locator('a[href="/privacy"]').first();
    if (await privacyLink.isVisible()) {
      await privacyLink.click();
      await expect(page).toHaveURL(/\/privacy/);
    }
  });
});

// =============================================================================
// API HEALTH — Backend is responsive
// =============================================================================

test.describe('API', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});

// =============================================================================
// RESPONSIVE — Pages render on mobile viewport
// =============================================================================

test.describe('Mobile responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X

  test('welcome page renders on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Driiva/i);
    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('signin page renders on mobile', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
  });
});
