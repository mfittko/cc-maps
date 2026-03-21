import {
  FaLayerGroup,
  FaPersonSkiingNordic,
  FaSnowflake,
  FaXmark,
} from 'react-icons/fa6';

export default function InfoPanel({ onClose }) {
  return (
    <aside className="info-panel" aria-label="Map information">
      <div className="info-panel-header">
        <div>
          <p className="eyebrow">Guide</p>
          <h2 className="info-title">How to use the map</h2>
        </div>
        <button
          type="button"
          className="info-close-button"
          onClick={onClose}
          aria-label="Close info panel"
        >
          <FaXmark />
        </button>
      </div>

      <div className="info-list">
        <section className="info-item">
          <FaPersonSkiingNordic className="info-icon" />
          <div>
            <p className="detail-label">Browse</p>
            <p>Pick a ski area from the destination menu or tap a destination marker on the map.</p>
          </div>
        </section>

        <section className="info-item">
          <FaSnowflake className="info-icon" />
          <div>
            <p className="detail-label">Winter mode</p>
            <p>The base map is winter-styled by default. Turn on 3D only when you want terrain depth.</p>
          </div>
        </section>

        <section className="info-item">
          <FaLayerGroup className="info-icon" />
          <div>
            <p className="detail-label">Trail colors</p>
            <p>Freshness is the default view. Switch to type colors when you want trail categories instead.</p>
          </div>
        </section>
      </div>
    </aside>
  );
}