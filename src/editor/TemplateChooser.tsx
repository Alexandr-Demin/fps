import { useEditorStore } from '../state/editorStore'
import { useGameStore } from '../state/gameStore'

/** First-screen card chooser shown when the editor opens. */
export function TemplateChooser() {
  const startEditing = useEditorStore((s) => s.startEditing)
  const exitEditor = useGameStore((s) => s.exitEditor)

  return (
    <div className="overlay interactive" style={{ zIndex: 40 }}>
      <div className="ed-chooser-bg" />
      <div className="ed-chooser">
        <div className="ed-chooser-head">
          <div className="sub">MAP EDITOR</div>
          <button className="dialog-close" onClick={exitEditor} aria-label="Close">×</button>
        </div>
        <div className="ed-chooser-prompt">Выберите шаблон</div>

        <div className="ed-cards">
          <button className="ed-card" onClick={() => startEditing('empty')}>
            <div className="ed-card-icon">▢</div>
            <div className="ed-card-title">ПУСТОЙ ШАБЛОН</div>
            <div className="ed-card-sub">
              Чистый бетонный пол 80 × 80, точка спавна, базовые точки ботов.
              Всё остальное расставите сами.
            </div>
          </button>

          <button className="ed-card" onClick={() => startEditing('sector17')}>
            <div className="ed-card-icon">▦</div>
            <div className="ed-card-title">SECTOR – 17</div>
            <div className="ed-card-sub">
              Готовая карта со всеми колоннами, мостами и спавнами. Можно
              править: двигать, добавлять, удалять любые объекты.
            </div>
          </button>
        </div>

        <div className="ed-chooser-hint">
          ESC — отмена &nbsp;·&nbsp; F2 — закрыть редактор позже
        </div>
      </div>
    </div>
  )
}
