type ViewerControlsProps = {
  cloudBusy: boolean
  hasUserPosition: boolean
  onRefreshFromCloud: () => void
  onCenterOnUser: () => void
}

export function ViewerControls({
  cloudBusy,
  hasUserPosition,
  onRefreshFromCloud,
  onCenterOnUser,
}: ViewerControlsProps) {
  return (
    <div className="viewer-controls" aria-label="Följ resan">
      <button
        type="button"
        className="button button--secondary"
        disabled={cloudBusy}
        onClick={onRefreshFromCloud}
      >
        {cloudBusy ? 'Hämtar…' : 'Ladda om'}
      </button>
      <button
        type="button"
        className="button button--secondary"
        onClick={onCenterOnUser}
        disabled={!hasUserPosition}
      >
        Senaste position
      </button>
    </div>
  )
}
