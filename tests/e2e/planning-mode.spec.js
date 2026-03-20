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
    features: [
      {
        type: 'Feature',
        properties: {
          id: 303,
          destinationid: '2',
          trailtypesymbol: 30,
          prepsymbol: 10,
          has_classic: true,
          has_skating: true,
          has_floodlight: false,
          is_scootertrail: false,
          warningtext: '',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [10.77, 59.95],
            [10.78, 59.95],
          ],
        },
      },
    ],
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

async function emitPrimaryTrailClick(page) {
  await emitMapLayerClick(page, 'trails-hit-layer', {
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
  }, { lng: 10.755, lat: 59.95 }, {});
}

async function emitPlanningTrailClick(page, layerId, feature, lngLat, originalEvent = {
  ctrlKey: true,
  metaKey: true,
}) {
  await emitMapLayerClick(page, layerId, feature, lngLat, originalEvent);
}

async function emitMapLayerClick(page, layerId, feature, lngLat, originalEvent) {
  await page.evaluate(
    ({ layerId: nextLayerId, feature: nextFeature, lngLat: nextLngLat, originalEvent: nextOriginalEvent }) => {
      const mockMap = window.__ccMapsMockMap;

      if (!mockMap) {
        throw new Error('Mock map instance not found');
      }

      mockMap.emitLayerEvent('click', nextLayerId, {
        features: [nextFeature],
        lngLat: nextLngLat,
        originalEvent: nextOriginalEvent,
      });
    },
    { layerId, feature, lngLat, originalEvent }
  );
}

async function selectDesktopDestination(page, destinationId) {
  const select = page.locator('.control-panel-desktop .select-input');

  await expect(select).toBeVisible();
  await page.waitForFunction(() => {
    const element = document.querySelector('.control-panel-desktop .select-input');
    return Boolean(element) && !element.disabled;
  });
  await select.selectOption(destinationId);
}

async function waitForSuggestedTrailPreview(page, destinationId) {
  await expect.poll(async () =>
    page.evaluate((expectedDestinationId) => {
      const mockMap = window.__ccMapsMockMap;
      const source = mockMap?.getSource('suggested-trails');
      const features = source?.data?.features || [];

      return features.some(
        (feature) => String(feature?.properties?.destinationid) === String(expectedDestinationId)
      );
    }, destinationId)
  ).toBe(true);
}

async function expectDestinationInPrimaryTrails(page, destinationId) {
  await expect.poll(async () =>
    page.evaluate((expectedDestinationId) => {
      const mockMap = window.__ccMapsMockMap;
      const source = mockMap?.getSource('trails');
      const features = source?.data?.features || [];

      return features.some(
        (feature) => String(feature?.properties?.destinationid) === String(expectedDestinationId)
      );
    }, destinationId)
  ).toBe(true);
}

async function expectDestinationNotInSuggestedTrails(page, destinationId) {
  await expect.poll(async () =>
    page.evaluate((expectedDestinationId) => {
      const mockMap = window.__ccMapsMockMap;
      const source = mockMap?.getSource('suggested-trails');
      const features = source?.data?.features || [];

      return features.every(
        (feature) => String(feature?.properties?.destinationid) !== String(expectedDestinationId)
      );
    }, destinationId)
  ).toBe(true);
}

async function waitForPersistedRoutePlan(page, destinationId, anchorCount) {
  await expect.poll(async () =>
    page.evaluate(
      ({ expectedDestinationId, expectedAnchorCount }) => {
        const rawStoredPlan = window.localStorage.getItem(
          `cc-maps:settings:plan:${expectedDestinationId}`
        );

        if (!rawStoredPlan) {
          return false;
        }

        const storedPlan = JSON.parse(rawStoredPlan);
        const routeParam = new URLSearchParams(window.location.search).get('route') || '';
        const routeParts = routeParam.split('|');
        const routeAnchorCount =
          routeParts.length >= 4 && routeParts[3]
            ? routeParts[3].split(',').filter(Boolean).length
            : 0;

        return (
          Array.isArray(storedPlan?.anchorEdgeIds) &&
          storedPlan.anchorEdgeIds.length === expectedAnchorCount &&
          routeAnchorCount === expectedAnchorCount
        );
      },
      { expectedDestinationId: destinationId, expectedAnchorCount: anchorCount }
    )
  ).toBe(true);
}

async function waitForRouteUrl(page, anchorCount) {
  await expect.poll(async () =>
    page.evaluate((expectedAnchorCount) => {
      const routeParam = new URLSearchParams(window.location.search).get('route') || '';
      const routeParts = routeParam.split('|');

      return (
        routeParts.length >= 4 &&
        routeParts[3] &&
        routeParts[3].split(',').filter(Boolean).length === expectedAnchorCount
      );
    }, anchorCount)
  ).toBe(true);
}

async function getMockMapView(page) {
  return page.evaluate(() => {
    const mockMap = window.__ccMapsMockMap;
    const center = mockMap?.getCenter?.();
    const zoom = mockMap?.getZoom?.();

    return {
      longitude: center?.lng ?? null,
      latitude: center?.lat ?? null,
      zoom: zoom ?? null,
    };
  });
}

test.describe('planning mode interactions', () => {
  test('planning mode off still opens trail details on trail click', async ({ page }) => {
    await stubAppApi(page);
    await page.goto('/');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');

    await emitPrimaryTrailClick(page);

    await expect(page.getByRole('heading', { name: 'Machine groomed' })).toBeVisible();
    await expect(page.getByText('0.6 km')).toBeVisible();
  });

  test('desktop quick action opens and closes planning mode with desktop hint text', async ({
    page,
  }, testInfo) => {
    await stubAppApi(page);
    await page.goto('/');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');

    await page.locator('.control-panel-desktop').getByRole('button', { name: 'Plan route' }).click();

    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeVisible();
    await expect(
      page.getByText(/^(Ctrl|Cmd)\+click a trail section to add it to your route\.$/)
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('planning-mode-desktop.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Exit planning mode' }).click();
    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeHidden();
  });

  test('closing planning mode keeps it closed when a stored route is rehydrated later', async ({
    page,
  }) => {
    await stubAppApi(page);
    await page.goto('/');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');

    await page.locator('.control-panel-desktop').getByRole('button', { name: 'Plan route' }).click();
    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeVisible();

    await emitPlanningTrailClick(
      page,
      'trails-hit-layer',
      trailsFixtureByDestinationId['1'].features[0],
      { lng: 10.755, lat: 59.95 }
    );

    await expect(page.getByText(/^1 section/)).toBeVisible();
    await waitForPersistedRoutePlan(page, '1', 1);

    await page.getByRole('button', { name: 'Exit planning mode' }).click();
    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeHidden();

    await selectDesktopDestination(page, '2');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('2');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');
    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeHidden();
  });

  test('planning mode can span a nearby destination sector and restore it after reload', async ({ page }) => {
    await stubAppApi(page);
    await page.goto('/');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');

    await page.locator('.control-panel-desktop').getByRole('button', { name: 'Plan route' }).click();
    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeVisible();

    await emitPlanningTrailClick(
      page,
      'trails-hit-layer',
      trailsFixtureByDestinationId['1'].features[0],
      { lng: 10.755, lat: 59.95 }
    );

    await waitForSuggestedTrailPreview(page, '2');

    await emitPlanningTrailClick(
      page,
      'suggested-trails-hit-layer',
      trailsFixtureByDestinationId['2'].features[0],
      { lng: 10.775, lat: 59.95 }
    );

    await expect(page.getByText(/^2 sections/)).toBeVisible();
    await waitForRouteUrl(page, 2);

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeVisible();
    await expect.poll(async () =>
      page.locator('.planning-anchor-list li').count()
    ).toBe(2);
    await expect(page.getByText(/^2 sections/)).toBeVisible();

    await expect.poll(async () =>
      page.evaluate(() => {
        const mockMap = window.__ccMapsMockMap;
        const source = mockMap?.getSource('trails');
        const features = source?.data?.features || [];

        return features.some((feature) => String(feature?.properties?.destinationid) === '2');
      })
    ).toBe(true);
    await expectDestinationNotInSuggestedTrails(page, '2');
  });

  test('route destinations stay in the primary trail source when focus flips between them', async ({ page }) => {
    await stubAppApi(page);
    await page.goto('/');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');

    await page.locator('.control-panel-desktop').getByRole('button', { name: 'Plan route' }).click();

    await emitPlanningTrailClick(
      page,
      'trails-hit-layer',
      trailsFixtureByDestinationId['1'].features[0],
      { lng: 10.755, lat: 59.95 }
    );

    await waitForSuggestedTrailPreview(page, '2');

    await emitPlanningTrailClick(
      page,
      'suggested-trails-hit-layer',
      trailsFixtureByDestinationId['2'].features[0],
      { lng: 10.775, lat: 59.95 }
    );

    await expect(page.getByText(/^2 sections/)).toBeVisible();
    await expectDestinationInPrimaryTrails(page, '2');
    await expectDestinationNotInSuggestedTrails(page, '2');

    await selectDesktopDestination(page, '2');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('2');
    await expect(page.getByRole('heading', { name: 'Route plan' })).toBeVisible();
    await expect.poll(async () => page.locator('.planning-anchor-list li').count()).toBe(2);
    await expectDestinationInPrimaryTrails(page, '1');
    await expectDestinationInPrimaryTrails(page, '2');
    await expectDestinationNotInSuggestedTrails(page, '1');
    await expectDestinationNotInSuggestedTrails(page, '2');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');
    await expect.poll(async () => page.locator('.planning-anchor-list li').count()).toBe(2);
    await expectDestinationInPrimaryTrails(page, '1');
    await expectDestinationInPrimaryTrails(page, '2');
    await expectDestinationNotInSuggestedTrails(page, '1');
    await expectDestinationNotInSuggestedTrails(page, '2');
  });

  test('adding and removing a secondary destination keeps the current map view', async ({ page }) => {
    await stubAppApi(page);
    await page.goto('/');

    await selectDesktopDestination(page, '1');
    await expect(page.locator('.control-panel-desktop .select-input')).toHaveValue('1');

    await page.locator('.control-panel-desktop').getByRole('button', { name: 'Plan route' }).click();

    await emitPlanningTrailClick(
      page,
      'trails-hit-layer',
      trailsFixtureByDestinationId['1'].features[0],
      { lng: 10.755, lat: 59.95 }
    );

    await waitForSuggestedTrailPreview(page, '2');

    const viewBeforeSecondaryAdd = await getMockMapView(page);

    await emitPlanningTrailClick(
      page,
      'suggested-trails-hit-layer',
      trailsFixtureByDestinationId['2'].features[0],
      { lng: 10.775, lat: 59.95 }
    );

    await expect.poll(async () => page.locator('.planning-anchor-list li').count()).toBe(2);
    await expect(await getMockMapView(page)).toEqual(viewBeforeSecondaryAdd);

    await emitPlanningTrailClick(
      page,
      'trails-hit-layer',
      trailsFixtureByDestinationId['2'].features[0],
      { lng: 10.775, lat: 59.95 }
    );

    await expect.poll(async () => page.locator('.planning-anchor-list li').count()).toBe(1);
    await expect(await getMockMapView(page)).toEqual(viewBeforeSecondaryAdd);
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
