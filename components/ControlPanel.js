import {
  FaCircleInfo,
  FaLocationDot,
  FaMountain,
} from 'react-icons/fa6';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

export default function ControlPanel({
  isPanelCollapsed,
  onToggleCollapse,
  onOpenInfo,
  isThreeDimensional,
  onToggleThreeDimensional,
  trailColorMode,
  onTrailColorModeChange,
  selectedDestinationId,
  onDestinationChange,
  destinationsStatus,
  trailsStatus,
  mapError,
  requestError,
  destinations,
  selectedDestination,
  activeTrailLegendItems,
  selectedTrail,
  selectedTrailCrossings,
  formatDistance,
}) {
  return (
    <aside className={`control-panel${isPanelCollapsed ? ' control-panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">cc-maps</p>
          {!isPanelCollapsed ? <h1>Cross-Country maps</h1> : null}
        </div>
        <button
          type="button"
          className="panel-collapse-button"
          onClick={onToggleCollapse}
          aria-expanded={!isPanelCollapsed}
          aria-controls="control-panel-body"
        >
          {isPanelCollapsed ? 'Open' : 'Minimize'}
        </button>
      </div>

      {!isPanelCollapsed ? (
        <div id="control-panel-body">
          <div className="quick-actions">
            <button
              type="button"
              className="icon-chip"
              onClick={onOpenInfo}
              aria-label="Open info panel"
            >
              <FaCircleInfo />
              <span>Info</span>
            </button>
            <label className="icon-toggle" htmlFor="three-d-toggle">
              <span className="icon-toggle-copy">
                <FaMountain />
                <span>3D</span>
              </span>
              <input
                id="three-d-toggle"
                type="checkbox"
                checked={isThreeDimensional}
                onChange={(event) => onToggleThreeDimensional(event.target.checked)}
              />
            </label>
          </div>

          <div className="display-mode-block">
            <p className="detail-label">Trail colors</p>
            <div className="segmented-control" role="tablist" aria-label="Trail color mode">
              <button
                type="button"
                className={`segment-button${trailColorMode === 'type' ? ' segment-button-active' : ''}`}
                onClick={() => onTrailColorModeChange('type')}
                aria-pressed={trailColorMode === 'type'}
              >
                Type
              </button>
              <button
                type="button"
                className={`segment-button${trailColorMode === 'freshness' ? ' segment-button-active' : ''}`}
                onClick={() => onTrailColorModeChange('freshness')}
                aria-pressed={trailColorMode === 'freshness'}
              >
                Freshness
              </button>
            </div>
          </div>

          <label className="field-label" htmlFor="destination-select">
            <span className="field-label-content">
              <FaLocationDot />
              <span>Destination</span>
            </span>
          </label>
          <select
            id="destination-select"
            className="select-input"
            value={selectedDestinationId}
            onChange={(event) => onDestinationChange(event.target.value)}
            disabled={destinationsStatus !== 'success'}
          >
            <option value="">Choose a ski area</option>
            {destinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>

          <div className="status-stack">
            {mapError ? <p className="status-card status-error">{mapError}</p> : null}
            {destinationsStatus === 'loading' ? <p className="status-card">Loading destinations...</p> : null}
            {trailsStatus === 'loading' ? <p className="status-card">Loading trails...</p> : null}
            {requestError ? <p className="status-card status-error">{requestError}</p> : null}
            {destinationsStatus === 'success' && destinations.length === 0 ? (
              <p className="status-card">No active destinations were returned by the API.</p>
            ) : null}
          </div>

          {selectedDestination ? (
            <section className="detail-card detail-card-compact">
              <p className="detail-label">Selected destination</p>
              <h2>{selectedDestination.name}</h2>
              <p>
                {DESTINATION_PREP_STYLES[selectedDestination.prepSymbol]?.label ||
                  DESTINATION_PREP_STYLES.default.label}
              </p>
            </section>
          ) : null}

          <section className="detail-card detail-card-compact">
            <p className="detail-label">
              {trailColorMode === 'freshness' ? 'Grooming freshness legend' : 'Trail type legend'}
            </p>
            <ul className="legend-list">
              {activeTrailLegendItems.map((item) => (
                <li key={item.code} className="legend-item">
                  <span className="legend-swatch" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </section>

          {selectedTrail ? (
            <section className="detail-card detail-card-compact">
              <p className="detail-label">Trail details</p>
              <h2>
                {TRAIL_TYPE_STYLES[selectedTrail.trailtypesymbol]?.label ||
                  TRAIL_TYPE_STYLES.default.label}
              </h2>
              <p>
                Classic: {selectedTrail.has_classic ? 'Yes' : 'No'} · Skating:{' '}
                {selectedTrail.has_skating ? 'Yes' : 'No'}
              </p>
              <p>
                Freshness:{' '}
                {DESTINATION_PREP_STYLES[selectedTrail.prepsymbol]?.label ||
                  DESTINATION_PREP_STYLES.default.label}
              </p>
              {selectedTrailCrossings ? (
                <p>
                  Length: {formatDistance(selectedTrailCrossings.totalLengthKm)} · Crossings:{' '}
                  {selectedTrailCrossings.crossings.length}
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
            </section>
          ) : null}
        </div>
      ) : selectedDestination ? (
        <div className="panel-collapsed-summary">
          <p className="detail-label">Destination</p>
          <p>{selectedDestination.name}</p>
        </div>
      ) : null}
    </aside>
  );
}