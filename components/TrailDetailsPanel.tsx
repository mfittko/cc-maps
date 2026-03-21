import { FaArrowDownLong, FaArrowUpLong, FaHourglassHalf, FaRoute, FaXmark } from 'react-icons/fa6';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

function getCompactFreshnessLabel(prepSymbol) {
  switch (prepSymbol) {
    case 20:
      return '6h';
    case 30:
      return '>6h';
    case 40:
      return '>18h';
    case 50:
      return '>48h';
    case 60:
      return '>14d';
    case 70:
      return 'season';
    default:
      return '?';
  }
}

export default function TrailDetailsPanel({
  selectedTrail,
  selectedTrailLengthKm,
  selectedTrailElevationMetrics,
  selectedRouteInsights,
  formatDistance,
  onClose,
}) {
  if (!selectedTrail) {
    return null;
  }

  const shouldShowStyleAvailability = !(selectedTrail.has_classic && selectedTrail.has_skating);
  const freshnessLabel =
    DESTINATION_PREP_STYLES[selectedTrail.prepsymbol]?.label || DESTINATION_PREP_STYLES.default.label;
  const compactFreshnessLabel = getCompactFreshnessLabel(selectedTrail.prepsymbol);

  return (
    <aside className="trail-details-panel" aria-label="Trail details">
      <div className="trail-details-header">
        <div className={selectedRouteInsights ? 'trail-details-heading trail-details-heading-compact' : 'trail-details-heading'}>
          <p className="eyebrow">Trail details</p>
          {!selectedRouteInsights ? (
            <h2>
              {TRAIL_TYPE_STYLES[selectedTrail.trailtypesymbol]?.label ||
                TRAIL_TYPE_STYLES.default.label}
            </h2>
          ) : null}
        </div>
        <button
          type="button"
          className="trail-details-close-button"
          onClick={onClose}
          aria-label="Close trail details"
        >
          <FaXmark />
        </button>
      </div>

      <div className={selectedRouteInsights ? 'trail-details-body trail-details-body-compact' : 'trail-details-body'}>
        {shouldShowStyleAvailability ? (
          <p>
            Classic: {selectedTrail.has_classic ? 'Yes' : 'No'} · Skating:{' '}
            {selectedTrail.has_skating ? 'Yes' : 'No'}
          </p>
        ) : null}
        {selectedTrailLengthKm || selectedTrailElevationMetrics || compactFreshnessLabel ? (
          <div className="trail-stats-row trail-summary-row">
            <div className="elevation-metrics trail-summary-metrics" aria-label="Trail summary metrics">
              <span className="elevation-chip trail-freshness-chip" title={freshnessLabel}>
                <FaHourglassHalf aria-hidden="true" />
                <span>{compactFreshnessLabel}</span>
              </span>
              {selectedTrailLengthKm ? (
                <span className="elevation-chip trail-length-chip">
                  <span>{formatDistance(selectedTrailLengthKm)}</span>
                </span>
              ) : null}
              {selectedTrailElevationMetrics ? (
              <span className="elevation-chip">
                <FaArrowUpLong aria-hidden="true" />
                <span>{selectedTrailElevationMetrics.ascentMeters} m</span>
              </span>
              ) : null}
              {selectedTrailElevationMetrics ? (
                <span className="elevation-chip">
                  <FaArrowDownLong aria-hidden="true" />
                  <span>{selectedTrailElevationMetrics.descentMeters} m</span>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {selectedRouteInsights ? (
          <section className="route-insights" aria-label="Planned route insights">
            <div className="route-insights-header">
              <p className="eyebrow">Planned route</p>
              <p>
                Section {selectedRouteInsights.selectedSectionNumber} of{' '}
                {selectedRouteInsights.totalSections}
              </p>
            </div>
            <div className="trail-stats-row route-summary-row">
              <div className="elevation-metrics route-summary-metrics" aria-label="Route summary metrics">
                <span className="elevation-chip route-total-chip">
                  <FaRoute aria-hidden="true" />
                  <span>{formatDistance(selectedRouteInsights.totalDistanceKm)}</span>
                </span>
                {selectedRouteInsights.routeElevationMetrics ? (
                  <>
                    <span className="elevation-chip">
                      <FaArrowUpLong aria-hidden="true" />
                      <span>{selectedRouteInsights.routeElevationMetrics.ascentMeters} m</span>
                    </span>
                    <span className="elevation-chip">
                      <FaArrowDownLong aria-hidden="true" />
                      <span>{selectedRouteInsights.routeElevationMetrics.descentMeters} m</span>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            {selectedRouteInsights.isLocationOnRoute &&
            selectedRouteInsights.routeTraveledKm != null &&
            selectedRouteInsights.routeRemainingKm != null ? (
              <div className="route-progress-grid">
                <p>
                  Route progress: {formatDistance(selectedRouteInsights.routeTraveledKm)} traveled ·{' '}
                  {formatDistance(selectedRouteInsights.routeRemainingKm)} remaining
                </p>
                {selectedRouteInsights.currentSectionNumber ? (
                  <p>
                    Current section: {selectedRouteInsights.currentSectionNumber} of{' '}
                    {selectedRouteInsights.totalSections}
                  </p>
                ) : null}
                {selectedRouteInsights.sectionTraveledKm != null &&
                selectedRouteInsights.sectionRemainingKm != null ? (
                  <p>
                    Selected section: {formatDistance(selectedRouteInsights.sectionTraveledKm)} traveled ·{' '}
                    {formatDistance(selectedRouteInsights.sectionRemainingKm)} remaining
                  </p>
                ) : null}
              </div>
            ) : null}
            {selectedRouteInsights.isReverse ? (
              <p className="route-warning">Current movement appears to be opposite the planned route direction.</p>
            ) : null}
          </section>
        ) : null}
        {selectedTrail.warningtext ? <p>{selectedTrail.warningtext}</p> : null}
      </div>
    </aside>
  );
}