import { FaArrowsRotate, FaXmark } from 'react-icons/fa6';
import { TRAIL_TYPE_STYLES } from '../lib/sporet';
import { formatDistance } from '../lib/map-domain';

/**
 * Planning mode panel — displays the active route plan and provides controls
 * for modifying it (exit, clear, reverse, remove individual anchors).
 *
 * Props:
 *   isPlanning       boolean   - whether planning mode is active
 *   routePlan        object    - { anchorEdgeIds: string[] } | null
 *   routeResult      object    - resolved route from resolveRoute | null
 *   routeGraph       object    - { edges: Map } | null
 *   isMacOS          boolean   - affects modifier-key hint text
 *   isMobileHint     boolean   - when true, show mobile tap hint instead
 *   onExitPlanning   function  - called when user exits planning mode
 *   onClearPlan      function  - called when user clears the route plan
 *   onReverseRoute   function  - called when user reverses the anchor order
 *   onRemoveAnchor   function(index) - called when user removes an anchor
 */
export default function PlanningPanel({
  isPlanning,
  routePlan,
  routeResult,
  routeGraph,
  isMacOS,
  isMobileHint,
  onExitPlanning,
  onClearPlan,
  onReverseRoute,
  onRemoveAnchor,
}) {
  if (!isPlanning) {
    return null;
  }

  const anchorEdgeIds = routePlan?.anchorEdgeIds ?? [];
  const anchorCount = anchorEdgeIds.length;

  const totalAnchorDistanceKm = anchorEdgeIds.reduce((sum, edgeId) => {
    const edge = routeGraph?.edges?.get(edgeId);
    return sum + (edge?.distanceKm ?? 0);
  }, 0);

  const totalConnectorDistanceKm = routeResult?.totalConnectorDistanceKm ?? 0;
  const totalDistanceKm = totalAnchorDistanceKm + totalConnectorDistanceKm;
  const hasGaps = routeResult?.hasUnresolvedGaps ?? false;

  const modifierKey = isMacOS ? 'Cmd' : 'Ctrl';
  const selectionHint = isMobileHint
    ? 'Tap a trail section to add it to your route.'
    : `${modifierKey}+click a trail section to add it to your route.`;

  return (
    <aside className="planning-panel" aria-label="Route plan">
      <div className="planning-panel-header">
        <div>
          <p className="eyebrow">Planning mode</p>
          <h2>Route plan</h2>
        </div>
        <button
          type="button"
          className="panel-close-button"
          onClick={onExitPlanning}
          aria-label="Exit planning mode"
        >
          <FaXmark />
        </button>
      </div>

      {anchorCount === 0 ? (
        <p className="planning-hint">{selectionHint}</p>
      ) : (
        <>
          <div className="planning-summary">
            <p>
              <strong>{anchorCount}</strong> {anchorCount === 1 ? 'section' : 'sections'}
              {totalDistanceKm > 0 ? ` · ${formatDistance(totalDistanceKm)}` : null}
            </p>
            {hasGaps ? (
              <p className="planning-gap-warning">Some sections could not be connected.</p>
            ) : null}
          </div>

          <ol className="planning-anchor-list" aria-label="Planned sections">
            {anchorEdgeIds.map((edgeId, index) => {
              const edge = routeGraph?.edges?.get(edgeId);
              const typeLabel =
                TRAIL_TYPE_STYLES[edge?.trailType]?.label ?? TRAIL_TYPE_STYLES.default.label;
              const distLabel = edge?.distanceKm ? formatDistance(edge.distanceKm) : null;

              return (
                <li key={`${edgeId}-${index}`} className="planning-anchor-item">
                  <span className="planning-anchor-info">
                    <span className="planning-anchor-index">{index + 1}</span>
                    <span className="planning-anchor-label">
                      {typeLabel}
                      {distLabel ? <span className="planning-anchor-dist"> · {distLabel}</span> : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="planning-anchor-remove"
                    onClick={() => onRemoveAnchor(index)}
                    aria-label={`Remove section ${index + 1}`}
                  >
                    <FaXmark />
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="planning-actions">
            {anchorCount > 1 ? (
              <button type="button" className="icon-chip" onClick={onReverseRoute}>
                <FaArrowsRotate aria-hidden="true" />
                <span>Reverse</span>
              </button>
            ) : null}
            <button type="button" className="icon-chip planning-clear-btn" onClick={onClearPlan}>
              Clear
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
