type ViewerControlsProps = {
  cloudUpdatedAt: string | null
  cloudMessage: string | null
  cloudBusy: boolean
  hasUserPosition: boolean
  onRefreshFromCloud: () => void
  onCenterOnUser: () => void
}

export function ViewerControls({
  cloudUpdatedAt,
  cloudMessage,
  cloudBusy,
  hasUserPosition,
  onRefreshFromCloud,
  onCenterOnUser,
}: ViewerControlsProps) {
  const cloudTime =
    cloudUpdatedAt &&
    (() => {
      try {
        return new Date(cloudUpdatedAt).toLocaleString()
      } catch {
        return cloudUpdatedAt
      }
    })()

  return (
    <div className="viewer-controls" aria-label="Följ resan">
      {cloudTime ? (
        <p className="viewer-controls__meta">Uppdaterad: {cloudTime}</p>
      ) : null}
      <div className="viewer-controls__buttons">
        <button
          type="button"
          className="button button--secondary"
          disabled={cloudBusy}
          onClick={onRefreshFromCloud}
        >
          Hämta senaste
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
