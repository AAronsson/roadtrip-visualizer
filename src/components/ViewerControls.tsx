type ViewerControlsProps = {
  hasUserPosition: boolean
  onCenterOnUser: () => void
}

export function ViewerControls({
  hasUserPosition,
  onCenterOnUser,
}: ViewerControlsProps) {
  return (
    <div className="viewer-controls" aria-label="Följ resan">
      <button
        type="button"
        className="button button--secondary"
        onClick={onCenterOnUser}
        disabled={!hasUserPosition}
      >
        Hitta oss
      </button>
      <a href="#/itinerary" className="viewer-controls__link">Resplan</a>
      <a
        href="https://www.instagram.com/a_aronsson"
        target="_blank"
        rel="noopener noreferrer"
        className="viewer-controls__link"
      >
        Instagram
      </a>
    </div>
  )
}
