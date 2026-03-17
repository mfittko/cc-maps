import {
  FaArrowsRotate,
  FaCircleInfo,
  FaLocationDot,
  FaRoute,
  FaShareNodes,
  FaXmark,
} from 'react-icons/fa6';

export default function ControlPanel({
  isOverlay = false,
  onClose,
  onOpenInfo,
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
  isPlanningMode = false,
  onEnterPlanning,
  onShareRoute,
  onReloadPage,
}) {
  return (
    <aside
      className={`control-panel${isOverlay ? ' control-panel-overlay' : ' control-panel-desktop'}`}
      aria-label="Map settings"
    >
      <div className="panel-header">
        <div>
          <p className="eyebrow">cc-maps</p>
          <h1>{isOverlay ? 'Map settings' : 'Cross-Country maps'}</h1>
        </div>
        {isOverlay ? (
          <button
            type="button"
            className="panel-close-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <FaXmark />
          </button>
        ) : null}
      </div>

      <div id="control-panel-body">
        <div className="quick-actions">
          <button
            type="button"
            className="icon-chip quick-action-button"
            onClick={onOpenInfo}
            aria-label="Open map guide"
            title="Guide"
          >
            <FaCircleInfo aria-hidden="true" />
          </button>
          {selectedDestination ? (
            <>
              <button
                type="button"
                className="icon-chip quick-action-button"
                onClick={onEnterPlanning}
                aria-label={isPlanningMode ? 'Planning mode active' : 'Plan route'}
                aria-pressed={isPlanningMode}
                title={isPlanningMode ? 'Planning mode active' : 'Plan route'}
              >
                <FaRoute aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-chip quick-action-button"
                onClick={onShareRoute}
                aria-label="Share route"
                title="Share"
              >
                <FaShareNodes aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-chip quick-action-button"
                onClick={onReloadPage}
                aria-label="Reload page"
                title="Reload"
              >
                <FaArrowsRotate aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        <label className="field-label" htmlFor={`destination-select${isOverlay ? '-overlay' : ''}`}>
          <span className="field-label-content">
            <FaLocationDot />
            <span>Destination</span>
          </span>
        </label>
        <select
          id={`destination-select${isOverlay ? '-overlay' : ''}`}
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
      </div>
    </aside>
  );
}
