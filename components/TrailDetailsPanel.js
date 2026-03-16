import { FaArrowDownLong, FaArrowUpLong, FaXmark } from 'react-icons/fa6';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

export default function TrailDetailsPanel({
  selectedTrail,
  selectedTrailLengthKm,
  selectedTrailElevationMetrics,
  formatDistance,
  onClose,
}) {
  if (!selectedTrail) {
    return null;
  }

  return (
    <aside className="trail-details-panel" aria-label="Trail details">
      <div className="trail-details-header">
        <div>
          <p className="eyebrow">Trail details</p>
          <h2>
            {TRAIL_TYPE_STYLES[selectedTrail.trailtypesymbol]?.label ||
              TRAIL_TYPE_STYLES.default.label}
          </h2>
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

      <div className="trail-details-body">
        <p>
          Classic: {selectedTrail.has_classic ? 'Yes' : 'No'} · Skating:{' '}
          {selectedTrail.has_skating ? 'Yes' : 'No'}
        </p>
        <p>
          Freshness:{' '}
          {DESTINATION_PREP_STYLES[selectedTrail.prepsymbol]?.label ||
            DESTINATION_PREP_STYLES.default.label}
        </p>
        {selectedTrailLengthKm ? (
          <p>Length: {formatDistance(selectedTrailLengthKm)}</p>
        ) : null}
        {selectedTrailElevationMetrics ? (
          <div className="trail-stats-row">
            <div className="elevation-metrics" aria-label="Elevation metrics">
              <span className="elevation-chip">
                <FaArrowUpLong aria-hidden="true" />
                <span>{selectedTrailElevationMetrics.ascentMeters} m</span>
              </span>
              <span className="elevation-chip">
                <FaArrowDownLong aria-hidden="true" />
                <span>{selectedTrailElevationMetrics.descentMeters} m</span>
              </span>
            </div>
          </div>
        ) : null}
        {selectedTrail.warningtext ? <p>{selectedTrail.warningtext}</p> : null}
      </div>
    </aside>
  );
}