type ViewerControlsProps = {
  cloudUpdatedAt: string | null
  cloudPositionAt: string | null
  cloudMessage: string | null
  cloudBusy: boolean
  hasUserPosition: boolean
  onRefreshFromCloud: () => void
  onCenterOnUser: () => void
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function ViewerControls({
  cloudUpdatedAt,
  cloudPositionAt,
  cloudMessage,
  cloudBusy,
  hasUserPosition,
  onRefreshFromCloud,
  onCenterOnUser,
}: ViewerControlsProps) {
  const updatedTime = formatTime(cloudUpdatedAt)
  const positionTime = formatTime(cloudPositionAt)

  return (
    <div className="viewer-controls" aria-label="Följ resan">
      {updatedTime ? (
        <p className="viewer-controls__meta">Uppdaterad: {updatedTime}</p>
      ) : null}
      {positionTime ? (
        <p className="viewer-controls__meta">Position sedd: {positionTime}</p>
      ) : null}
      <p className="viewer-controls__meta viewer-controls__meta--faint">
        Laddar om automatiskt var 15:e minut.
      </p>
      <div className="viewer-controls__buttons">
        <button
          type="button"
          className="button button--secondary"
          disabled={cloudBusy}
          onClick={onRefreshFromCloud}
        >
          {cloudBusy ? 'Hämtar…' : 'Hämta senaste'}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onCenterOnUser}
          disabled={!hasUserPosition}
        >
          Centrera på oss
        </button>
      </div>
      {cloudMessage ? <p className="viewer-controls__meta">{cloudMessage}</p> : null}
    </div>
  )
}
