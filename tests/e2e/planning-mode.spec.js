import { expect, test } from '@playwright/test';

const destinationsFixture = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: '1', name: 'Nordmarka', prepsymbol: 20 },
      geometry: {
        type: 'Point',
        coordinates: [10.75, 59.95],
      },
    },
    {
      type: 'Feature',
      properties: { id: '2', name: 'Østmarka', prepsymbol: 10 },
      geometry: {
        type: 'Point',
        coordinates: [10.9, 59.89],
      },
    },
  ],
};

const trailsFixtureByDestinationId = {
  '1': {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: 101,
          destinationid: '1',
          trailtypesymbol: 30,
          prepsymbol: 20,
          has_classic: true,
          has_skating: true,
          has_floodlight: false,
          is_scootertrail: false,
          warningtext: '',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.75, 59.95],
            [10.76, 59.95],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          id: 202,
          destinationid: '1',
          trailtypesymbol: 40,
          prepsymbol: 20,
          has_classic: true,
          has_skating: false,
          has_floodlight: false,
          is_scootertrail: false,
          warningtext: '',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.76, 59.95],
            [10.77, 59.95],
          ],
        },
      },
    ],
  },
  '2': {
    type: 'FeatureCollection',
    features: [],
  },
};

async function stubAppApi(page) {
  await page.route('**/api/destinations', async (route) => {
    await route.fulfill({ json: destinationsFixture });
  });

  await page.route('**/api/trails**', async (route) => {
    const url = new URL(route.request().url());
    const destinationId = url.searchParams.get('destinationid');
    const payload = destinationId ? trailsFixtureByDestinationId[destinationId] : { type: 'FeatureCollection', features: [] };

    await route.fulfill({ json: payload || { type: 'FeatureCollection', features: [] } });
  });
}

test.describe('planning mode interactions', () => {
  test('desktop quick action opens and closes planning mode with desktop hint text', async ({
    page,
  }) => {
    await stubAppApi(page);
    await page.goto('/');

    await page.locator('.control-panel-desktop .select-input').selectOption('1');
    await expect(page.getByText('Nordmarka')).toBeVisible();

    await page.locator('.control-panel-desktop').getByRole('button', { name: 'Plan route' }).click();

    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeVisible();
    await expect(page.getByText('Ctrl+click a trail section to add it to your route.')).toBeVisible();

    await page.getByRole('button', { name: 'Exit planning mode' }).click();
    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeHidden();
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('mobile overlay button opens planning mode with tap hint text', async ({ page }) => {
      await stubAppApi(page);
      await page.goto('/');

      await page.getByRole('button', { name: 'Open map settings' }).click();
      await page.locator('.control-panel-overlay .select-input').selectOption('1');

      await page.getByRole('button', { name: 'Plan route' }).click();

      await expect(page.getByRole('heading', { name: 'Route plan' })).toBeVisible();
      await expect(page.getByText('Tap a trail section to add it to your route.')).toBeVisible();
    });
  });
});
