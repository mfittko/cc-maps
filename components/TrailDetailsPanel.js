import { FaXmark } from 'react-icons/fa6';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

export default function TrailDetailsPanel({
  selectedTrail,
  selectedTrailLengthKm,
  selectedTrailCrossings,
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
          <p>
            Length: {formatDistance(selectedTrailLengthKm)}
            {selectedTrailCrossings ? ` · Crossings: ${selectedTrailCrossings.crossings.length}` : ''}
          </p>
        ) : null}
        {selectedTrail.warningtext ? <p>{selectedTrail.warningtext}</p> : null}
        {selectedTrailCrossings?.segments?.length ? (
          <div className="crossing-list-block">
            <p className="detail-label">Trail segments</p>
            <ul className="crossing-list">
              {selectedTrailCrossings.segments.map((segment, index) => (
                <li
                  key={`${segment.fromLabel}-${segment.toLabel}-${index}`}
                  className="crossing-item"
                >
                  <span>
                    {segment.fromLabel} to {segment.toLabel}
                  </span>
                  <strong>{formatDistance(segment.distanceKm)}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : selectedTrailCrossings?.crossings?.length === 1 ? (
          <p>Only one crossing was found on this trail, so no interval can be shown yet.</p>
        ) : selectedTrailCrossings ? (
          <p>No crossings were found for this trail within the loaded destination network.</p>
        ) : null}
      </div>
    </aside>
  );
}