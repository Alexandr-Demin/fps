# SECTOR – 17 — Game Design Document

**Version:** 0.3 (Demo)
**Status:** Single-player playable demo with in-game level editor
**Platform:** Web browser (desktop, Chromium/Firefox/Safari)
**Genre:** Hybrid arena FPS — classic arena DM core, CoD-style movement, CS-style stop-to-shoot accuracy model
**Reference points:** Counter-Strike movement / spray / bot accuracy · Quake III · Diabotical · Splitgate · CoD MW2019+ slide · Titanfall 2 slide-jump · Severance / Control art language

---

## 0. Change log

### V0.3 (current)
- **Map editor (F2)** — full in-game level authoring tool. Add/move/scale concrete & metal boxes, player/bot spawns, waypoints. Orbit camera, TransformControls gizmo (W/E/R move/rotate/scale), grid + snap, snap-to-floor button with `● ON FLOOR` indicator + green ground-contact plane. Per-entity inspector with color/emissive controls. Undo/redo 50-step history. SAVE/LOAD as JSON through File System Access API on Chromium (with persistent folder memory across save/load), `<input type=file>` fallback on Firefox/Safari. `▶ TEST` jumps straight into the draft map.
- **Map data system** — single `MapData` schema in `core/mapTypes.ts` consumed by both the runtime (`MapLoader`, `PlayerController` spawns, `Bot` spawns + waypoint graph) and the editor. JSON-serializable. Entity kinds: `concrete`, `metal`, `playerSpawn`, `botSpawn`, `waypoint`.
- **New map: TACTICAL-ARENA** — Counter-Strike-style three-lane layout (mid + A long + B/apps), two bombsite-shaped focal arenas, catwalk + stairs, sightline-breaker walls, T-spawn / CT-spawn at opposite ends. 80 × 80 m. Joins `SECTOR-17` in rotation.
- **Level select screen** — new `levelSelect` phase between main menu and match. Card grid with per-map stats (spawns, blocks). Editor `TEST` bypasses select and drops the player straight into the draft.
- **Main menu rework** — `DEPLOY · SOLO`, `DEATHMATCH` (disabled `SOON` placeholder for networked DM), `EDITOR`, `SETTINGS`. Pause menu split off: `RESUME`, `SETTINGS`, `MAIN MENU`. No more "DEPLOY" in pause masquerading as "RESUME".
- **Slide rework — CoD-style.**
  - Edge-triggered single tap of Ctrl (no longer needs simultaneous Shift+W+Ctrl).
  - Activation threshold `SLIDE_MIN_SPEED = 4.5 m/s` — walking-or-faster qualifies, standing crouch doesn't.
  - Boost `+5.5 m/s` along camera-forward (predictable launch direction, not inertial).
  - **Progressive friction**: ramps from `0.6` at start to `4.5` at end over `1.0 s` (was constant `1.6`) — CoD "slide-far-then-taper" curve.
  - **Steering**: slide velocity rotates toward camera-forward at up to `1.7 rad/s` (~97°/s) — light curving, not direction-snap.
  - **Cooldown** `0.45 s` after slide ends — prevents slide-spam, whether ended naturally, by jump-cancel, or by releasing crouch.
- **Bot AI — pathfinding overhaul.**
  - **LOS-aware waypoint graph**: raw distance-based links are filtered through Rapier raycasts, so connections blocked by walls are dropped. Built lazily in a deferred `useEffect` so map colliders are mounted first.
  - **A\* pathfinding** for both patrol (random distant waypoint) and chase (route to player's nearest waypoint). Bots roam the entire map instead of patrolling their local cluster.
  - **Path refresh** every 0.6 s while bot has visual on player — adapts as the player moves.
  - **Stuck detection**: if bot wants to move but actually stalls for > 1.2 s, force repath (handles fragmented graphs on choke-heavy maps).
  - `applyDamage` now triggers immediate chase repath — bot can't be hit and continue patrolling.
  - Fragmented-graph fallback: when no path exists, walk directly to a random waypoint; character controller slides along walls.
- **Bot accuracy — CS-bot model.**
  - Spread = `ATTACK_SPREAD_BASE (0.025)` + `ATTACK_SPREAD_PLAYER_VEL (0.014) × player_horizontal_speed` + `ATTACK_SPREAD_BURST (0.012) × shots_in_burst`, capped at `ATTACK_SPREAD_MAX = 0.22 rad`.
  - `BURST_RESET = 0.55 s` of no-fire resets the spray pattern.
  - **Reaction lag** `SPOTTING_DELAY = 0.35 s` — bot can't fire for that long after first spotting a target (CS-bot acquisition delay).
  - Bots stop to shoot (attack-phase move speed = 0) — was already true, now intentional design.
  - **Effect**: a strafing/sliding player at 9.6 m/s is dramatically harder to hit than a stationary one; sustained fire degrades over the burst; first shot after rounding a corner is forgiving.
- **Weapon — 10 rounds, infinite reserve.** `MAG_SIZE: 9 → 10`. `RESERVE: 63 → Infinity`. Reload still costs `1.6 s` (mandatory reload rhythm) but never depletes ammo. HUD shows `∞` glyph.
- **Browser shortcut suppression** — while pointer-lock is active, `preventDefault` on Space, Tab, Backspace, arrows, PageUp/Down/Home/End, F1/F3/F4/F5/F6/F7, Firefox quick-find (`/` `'`), and Ctrl/Cmd+R/S/P/F/G/D/H/J/L/U/A/E/0/+/-. Devtools combos (F12, Ctrl+Shift+I/J/C) intentionally pass through. Privileged browser shortcuts (Ctrl+T/W/N/Tab, Alt+F4) cannot be intercepted from JS without Keyboard Lock API + Fullscreen — documented as a known limit.
- **Audio** — procedural ambient layer (reactor hum + vent wind + random clanks) **removed**. Combat SFX, footsteps, reload, hurt, kill — unchanged.
- **Genre clarification** — project is now framed as a **hybrid arena FPS**: arena-DM skeleton + CoD-style movement + CS-style stop-to-shoot accuracy + CS-influenced level layouts (`TACTICAL-ARENA`). Nearest references: Splitgate / Diabotical / Quake Champions.

### V0.2
- **Rename**: project rebranded from prototype name to **SECTOR – 17**.
- **Movement**: bunny-hop tightened to CS-style timing (no auto-hop, 60 ms tap-window, skip friction *and* ground acceleration on success). Air-strafe wishspeed cap reduced.
- **Recoil**: replaced linear decay with **mass-spring-damper physics** for view-model + camera; full pattern model with growing pitch + alternating yaw, recovery delay, and camera-position punch in camera space.
- **ADS / iron sights**: RMB engages aim-down-sights. Pistol uses real **iron sights** (rear notch + front post + tritium dots) — no sniper-style scope overlay. FOV lerp 92→55, sensitivity × 0.55, view-model centers under nose, weapon sway dampened.
- **Hitboxes**: bots subdivided into 3 client-side zones (head ×2.0 / torso ×1.0 / legs ×0.7) determined by Y-offset of hit point. Debug visualization toggle in settings.
- **HP bars**: billboard health indicators over each bot, color shifts to red below 35% HP.
- **Damage zone stats**: live debug panel (top-left) with per-zone hit log, zone-progress bars, total damage, accuracy %.
- **FPS counter**: debug top-left panel — average FPS + 1% low, color-coded.
- **Settings dialog**: mute toggle (also `M` key), bots-damage radio group (safe mode / tir), hitbox-visibility radio group.
- **Audio**: pistol replaced with **sampled mp3** layered with synthesized sub-bass body thump + delayed wall reflection. Reload uses sampled mp3 hard-trimmed to the action window. Mute fades master gain in 80 ms.
- **Lighting**: brightened pass with rebalanced cool/warm fills; concrete materials lifted.
- **Performance**: cut point-light count 14 → 5, shared concrete material across all map boxes, physics step 1/120 → 1/60, removed redundant `setPlayerPos` store thrash. ~1.5–2× FPS improvement.

### V0.1
- Initial playable demo with movement, camera, weapon (procedural audio), AI bots, map, HUD, menus.

---

## 1. High Concept

> Браузерный arena FPS, где геймплей построен вокруг **сохранения momentum** в индустриальной мегаструктуре. Игрок — оператор в боевой оболочке внутри бетонного реакторного комплекса. Победа определяется не количеством снаряжения, а **владением движением и прицеливанием**.

SECTOR – 17 жертвует прогрессией, кастомизацией и сюжетом ради чистого core-loop'а: spawn → движение → перестрелка → respawn. Атмосфера — brutalism + индустриальный sci-fi, безымянный конфликт, безымянные операторы.

### Pillars

1. **Movement как механика 1-го уровня.** Стрельба обслуживает движение, а не наоборот. Игрок, овладевший air strafing и slide-bhop, в любой ситуации сильнее лучше экипированного, но менее мобильного.
2. **Тяжёлая, читаемая стрельба с patterns.** Один выстрел чувствуется. CS-стилевая отдача — паттерн, который можно выучить.
3. **Индустриальный масштаб.** Игрок ощущает себя малой точкой внутри огромного механизма. Вертикальность и пустота важнее декора.
4. **Минимализм UI и контента.** Всё, что не служит movement или combat feel, удаляется.

### Demo Scope (V0.3)

- **2 карты**: `SECTOR-17` (бетонный реакторный комплекс, vertical play) + `TACTICAL-ARENA` (CS-style 3-lane).
- **1 оружие**: `KZ-7 Heavy` (10-round mag, infinite reserve).
- **1 противник**: `Sentinel` (AI-бот) с A\*-навигацией и CS-style accuracy.
- **1 режим**: Deathmatch против ботов + опциональный режим тира (без урона от ботов).
- **In-game map editor** (F2): полный авторинг уровней + JSON SAVE/LOAD + level rotation через `LEVELS`-реестр.
- **Level select screen**: card-based выбор карты после `DEPLOY · SOLO`.
- Все игровые системы локальные (no networking yet — `DEATHMATCH` кнопка заготовка под V1.0).

### Long-term Vision (post-demo)

Multiplayer arena FPS с server-authoritative симуляцией (Colyseus + WebSocket), ротацией карт, ranked-режимом, season-based визуальной кастомизацией оператора. Без оружий-DLC, без pay-to-win, без battle royale.

---

## 2. Core Gameplay Loop

```
        ┌──────────────────────────────┐
        │   spawn (≤2.5s after death)  │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  набор скорости (sprint→bhop)│
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  визуальный/звуковой контакт │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  duel: movement vs aim       │
        │  hip-fire ←→ ADS ←→ reposition│
        │  spray-control / tap-fire    │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  kill ИЛИ death              │
        └──────────────┬───────────────┘
                       └──→ loop
```

Среднее время дуэли — **2–4 секунды**. Среднее время между перестрелками — **5–10 секунд** при 4 ботах.

**Win condition (demo):** первый достичь `MATCH.KILL_TARGET = 20`. После достижения матч продолжается без явного победного экрана (демо-режим).

**Safe mode / тир:** через Settings можно отключить урон от ботов. В этом режиме боты передвигаются и aim-track'ат игрока, но **не открывают огонь** (ни выстрелов, ни impact'ов, ни urona). Используется для тренировки aim/спрея на движущихся целях.

---

## 3. Movement System

Главная механика. Параметры в [`PLAYER`](../src/core/constants.ts).

### 3.1 Базовое перемещение

| Параметр | Значение | Заметки |
| --- | --- | --- |
| Walk speed | 6.0 m/s | базовая горизонтальная |
| Sprint speed | 9.6 m/s | × 1.6, только при удержании W + Shift |
| Crouch speed | 3.0 m/s | |
| Ground acceleration | 90 | Quake-style accelerate(): добавляет до wishSpeed по wishDir |
| Ground friction | 8.5 | exponential decay с stopspeed=4.8 |
| Air acceleration | **100** | bumped to compensate for tighter wishspeed cap |
| Air max wish-speed | **0.9** | enables CS-strict air strafing |
| Gravity | 28 m/s² | |
| Jump velocity | 8.4 m/s | apex ≈ 1.26m, time-to-apex ≈ 0.3s |
| Air control | 1.0 | full input authority в воздухе |

**Air-strafe rationale:** `AIR_MAX_WISH_SPEED = 0.9 m/s` — заведомо ниже `WALK_SPEED = 6.0`. В воздухе невозможно разогнаться «прямо вперёд» — только по компоненте, перпендикулярной текущей скорости. Это и есть air strafing: чтобы добавить скорость, надо одновременно поворачивать камеру и стрейфить в ту же сторону.

### 3.2 Расширенные техники

**Bunny hop (CS-style).**
- Жёсткое окно `BHOP_WINDOW = 0.06 s` (60 ms) после приземления.
- При успешном попадании в окно пропускаются **friction + ground acceleration того же кадра** → momentum carries through 1-в-1.
- **Auto-hop отсутствует**: удержание Space не сработает, нужно нажимать ритмично.
- Промах окна → за 1 кадр friction съест скорость до walk-cap.

Это копирует Source-engine логику `CheckJumpButton()` → `Friction()` → `WalkMove()`: jump на той же кадре, что landing, обходит и фрикцию, и ground-accel.

**Slide (CoD-style, V0.3).** Edge-триггер на тап Ctrl при горизонтальной скорости > `SLIDE_MIN_SPEED = 4.5 m/s` (порог проходим из ходьбы или быстрее).
- Начальный буст `+5.5 m/s` **по направлению камеры** (не инерционный — слайд летит куда ты смотришь).
- **Прогрессирующее трение**: рампа `0.6 → 4.5` за 1.0 с — низкое в начале (далеко улетаешь), нарастает к концу (явный таппер).
- **Подруливание камерой**: вектор скорости поворачивается к camera-forward со скоростью `1.7 rad/s` (~97°/с). Покрутил мышью — слайд изгибается.
- FOV расширяется на `+4°`, камера опускается до crouch eye height.
- Макс. длительность `1.0 s`. Завершается на: отпускании Ctrl, прыжке (slide-jump cancel сохраняет горизонтальный импульс), просадке скорости ниже `3.0 m/s`, или таймауте.
- **Cooldown** `0.45 s` после любого завершения — нельзя слайдить подряд.
- Единственная активирующая клавиша — Ctrl. Шифт и W держать необязательно: порог 4.5 м/с уже подразумевает, что игрок до этого двигался.

**Air control.** Полный контроль направления через `AIR_CONTROL = 1.0`. Игрок может корректировать траекторию прыжка.

**Coyote time.** 120 ms grace window после схождения с края — можно прыгнуть.

### 3.3 Skill ceiling

| Skill | Effective speed | Сложность |
| --- | --- | --- |
| WASD-новичок | 6.0 m/s | trivial |
| Sprint + перепрыг препятствий | 9.6 m/s | low |
| Bhop одиночный (попасть в 60ms окно) | 10–12 m/s | medium |
| Bhop + air strafe в коридоре | 14–18 m/s | high |
| Slide-jump chains через карту | 18–22+ m/s | expert |

Top-end игрок пересекает карту (~80 m) за **~4 секунды**. Новичок — за **~13 секунд**.

---

## 4. Combat System

### 4.1 KZ-7 Heavy

Полуавтоматический индустриальный кинетический пистолет. Параметры в [`WEAPON`](../src/core/constants.ts).

| Параметр | Значение |
| --- | --- |
| Damage | 34 (× zone multiplier) |
| TTK headshot (HP 60) | **2 выстрела** (≈0.18 s) |
| TTK torso | 3 выстрела (≈0.36 s) |
| TTK leg-only | 5 выстрелов (≈0.72 s) |
| Range | 200 m |
| Fire interval | 0.18 s (333 RPM) |
| Mag size | **10** |
| Reserve | **∞ (infinite)** |
| Reload time | 1.6 s (mandatory rhythm; reload never depletes anything) |
| Base spread | 0.0015 rad (essentially pinpoint) |

### 4.2 Hitbox zones (client-side)

Боты subdivided на 3 зоны по Y-offset попадания относительно центра rigid body. Один Rapier-capsule collider для физики/raycast, зоны вычисляются client-side из `hit.point.y - bot.position.y`.

| Зона | Цвет | Y_min (m) | Damage × | Notes |
| --- | --- | --- | --- | --- |
| **HEAD** | `#ff3030` | +0.49 | **2.0** | 0.50 × 0.42 × 0.46 m box |
| **TORSO** | `#48c8ff` | −0.17 | **1.0** | 0.72 × 0.66 × 0.52 m box |
| **LEGS** | `#62f59a` | −∞ | **0.7** | 0.58 × 0.78 × 0.46 m box |

Зоны определяются в [`HITBOX`](../src/core/constants.ts) — единый источник правды для wireframe-визуализации, damage-multiplier'ов, и цветов в hit-log UI.

### 4.3 Recoil model — spring physics + CS-style pattern

[Реализация](../src/systems/combat/Weapon.tsx) дробится на 3 слоя:

**Слой 1 — Camera pitch/yaw pattern (Weapon → PlayerController через `gz:recoil` event):**
- Счётчик `shotsInBurst` инкрементируется на каждый выстрел, сбрасывается через `RECOIL_BURST_RESET = 0.32 s` без стрельбы.
- Pitch kick: `RECOIL_PITCH × min(RECOIL_PITCH_MAX, 1 + (n−1) × RECOIL_PITCH_GROWTH) × jitter`. Растёт линейно, cap = 2.6× базы.
- Yaw kick: альтернирует ± (нечёт-чёт), множитель растёт по `RECOIL_YAW_GROWTH = 0.22`, cap = 2.2×. Лёгкий jitter добавляет реализма без нарушения предсказуемости.
- **Recovery delay:** камера НЕ возвращается обратно, пока не прошло `RECOIL_RECOVERY_DELAY = 0.18 s` после последнего выстрела. Во время серии прицел реально drift'ит — игрок должен либо tap-fire'ить, либо компенсировать вручную.

**Слой 2 — Camera punch (PlayerController):**
Mass-spring-damper в camera-local space:
```
v += (-K·x - C·v) · dt
x += v · dt
```
- `K = 90` (stiffness), `C = 12` (damping) → slightly underdamped, камера пружинит.
- На каждый выстрел: импульс +Y (вверх), +Z (назад), ±X (jitter).
- Применяется как world-space смещение `camera.position += R · punch`, где R = camera quaternion.

**Слой 3 — View-model spring (ViewModel):**
Аналогичная mass-spring-damper для двух каналов:
- `kickPos` → откат gun-mesh по +Z (назад) + +Y (вверх)
- `kickRot` → barrel-up pitch через `rotateX(+angle)`

Spring-параметры синхронизированы с camera-punch → камера и оружие пружинят в фазе.

### 4.4 ADS / Iron sights (RMB hold)

Не sniper-scope! Это пистолетный sight picture:
- FOV 92 → 55 за ~70 ms (lerp 14).
- View-model центрируется и приближается к камере: `adsOffset = (0, −0.114, −0.28)` — Y выбран так, чтобы оптическая ось камеры проходила точно через rear-sight notch.
- Sights: rear-sight состоит из **двух вертикальных столбиков** с зазором (notch), плюс два tritium-dot'а по бокам. Front-sight — высокий тонкий post с яркой эмиссивной точкой на вершине. Три оранжевых точки выстраиваются в линию = «3-dot sight picture».
- Mouse sensitivity × 0.55 для steady aim.
- Crosshair скрывается, заменяется на subtle radial-vignette focus.
- Weapon sway гасится на 85%.

### 4.5 Damage feedback

| Event | Visual | Audio |
| --- | --- | --- |
| Shot fired | Muzzle flash quad + point light (8 intensity, 80/s decay) + view-model spring | Sampled mp3 + sub-bass thump + delayed wall reflection (см. §7) |
| Wall hit | Impact decal aligned to normal + spark point light + emissive flash | High-passed noise burst → reverb send |
| Bot hit | Damage flash on head material (red tint) + hit marker (4-line) | Spatial impact sample |
| Bot kill | Bot drops below floor, respawn 4.5 s later | Ascending sine 880→1320 Hz |
| Player hit | Damage vignette (red radial) | Square 90 Hz thud |

### 4.6 Reload

Triggered: нажатие R, или auto при пустом mag и нажатой LMB. Animation: view-model дип вниз + вращение, sin-curve по фазе.
**Audio:** sampled mp3 hard-trimmed к `WEAPON.RELOAD_TIME = 1.6 s` с tail-fade в последние 120 ms — звук кончается ровно когда заканчивается анимация.

---

## 5. AI — Sentinel

Простой состоянийный бот. [Реализация](../src/systems/ai/Bot.tsx).

### 5.1 Параметры

| Stat | Value | Notes |
| --- | --- | --- |
| HP | 60 | = 2 headshots, 3 torso, 5 legs |
| Walk speed | 3.2 m/s | Patrol |
| Chase speed | 4.6 m/s | Following A\* path to player |
| Sight range | 38 m | |
| Sight FOV | ~125° | Cone test before raycast |
| Attack range | 28 m | Switches `chase` → `attack` inside |
| Attack interval | 0.85 s | |
| Attack damage | 9 | ≈ 11 hits to kill player |
| Reaction time | 0.25 s | Continuous-sight requirement before phase switch |
| **Spotting delay (V0.3)** | **0.35 s** | Pre-first-shot reaction lag after acquiring target |
| **Burst reset (V0.3)** | **0.55 s** | No-fire interval that resets spray pattern |
| Respawn delay | 4.5 s | |
| Match bot count | 4 | |
| **Stuck repath time (V0.3)** | **1.2 s** | Movement-stalled → force A\* repath |

### 5.1.1 Accuracy model — CS-bot (V0.3)

Per-shot spread is dynamically computed:

```
spread = ATTACK_SPREAD_BASE                                 (0.025 rad)
       + player_horizontal_speed × ATTACK_SPREAD_PLAYER_VEL (0.014 per m/s)
       + shots_in_burst         × ATTACK_SPREAD_BURST       (0.012 per shot)
spread = min(spread, ATTACK_SPREAD_MAX)                     (0.22 rad cap)
```

Practical reads:
- **Standing target** at any distance → ~`0.025 rad` (≈ ±0.7° at 28 m → tight)
- **Sprinting target** (9.6 m/s) → `0.025 + 0.134 = 0.159 rad` (≈ ±4.5° → unreliable hits)
- **Sliding target** (up to ~15 m/s with boost) → close to cap, very hard to track
- **5th shot in sustained burst** → +0.048 rad spray growth
- Pausing fire for 0.55 s resets the spray pattern.

Bots stop to shoot (attack-phase move speed = 0). Reaction lag `SPOTTING_DELAY = 0.35 s` means the first shot after rounding a corner is forgiving — gives the player one beat to react before any incoming fire.

### 5.2 State machine

```
       ┌─────────┐  enemy spotted   ┌─────────┐
       │ PATROL  ├─────────────────►│ CHASE   │
       └────┬────┘                  └────┬────┘
            │                            │
   (graph)  │                            │ in attack range
            │                            ▼
            │                       ┌─────────┐
            │                       │ ATTACK  │
            │                       └────┬────┘
            │                            │ lost sight
            │                            ▼
            │                       ┌─────────┐
            │                       │ SEARCH  │ ── timeout ─► PATROL
            │                       └─────────┘
            ▼
       ┌─────────┐
       │  DEAD   │ ── respawn 4.5s ─► PATROL
       └─────────┘
```

### 5.3 Perception (3-stage filter)

1. **Range:** `dist² < SIGHT_RANGE²` (cheapest)
2. **FOV cone:** `dot(facing, toPlayer) > cos(SIGHT_FOV/2)`
3. **Raycast LOS:** Rapier ray от глаз бота к игроку, проверка `timeOfImpact + 0.6 ≥ dist` (учёт радиуса игрока)

Перцепция требует `REACTION_TIME = 0.25 s` непрерывного контакта перед переключением в `CHASE`/`ATTACK`.

### 5.4 Spawn distribution

Initial spawn использует `id % BOT_SPAWNS.length` — каждый из 4 ботов получает свою стартовую точку (8 точек по карте) с лёгким jitter ±1.5 m. Респавн выбирает случайную точку из «дальней половины» относительно текущей позиции игрока — боты не лезут к игроку сразу после смерти.

### 5.5 HP visualization

Billboard HP-bar (0.7 m wide) над каждым ботом:
- Fill scaled from left edge via `scale.x = ratio; position.x = −0.35 × (1 − ratio)`
- Color shifts от белого к красному при HP < 35%
- `depthTest = false` → видно сквозь стены
- Скрывается при смерти (mesh уезжает к y = −1000)

### 5.6 Navigation — A\* + LOS-aware waypoint graph (V0.3)

[`waypoints.ts`](../src/systems/ai/waypoints.ts) + [`Bot.tsx`](../src/systems/ai/Bot.tsx).

1. **Build raw graph** from all `waypoint` entities in the active map. Two waypoints are linked if their euclidean distance < `28 m`.
2. **LOS filter** (`filterGraphLOS`): each candidate link is checked with a Rapier raycast at `y + 0.3`. Links blocked by walls/columns are dropped. Built lazily in a deferred `useEffect` so map colliders have time to mount.
3. **A\* search** (`findPath`) over the filtered graph for both:
   - **Patrol target picking**: random distant waypoint, repath when path is exhausted → bots roam the entire map.
   - **Chase**: route to player's nearest waypoint, refreshed every `0.6 s` while bot has visual.
4. **Node-by-node traversal**: `nextPathNode` advances the cursor when bot enters `WAYPOINT_TOLERANCE` of the current target. Once path is exhausted in chase, fall back to direct steering toward `lastSeenPlayer`.
5. **Stuck detection**: if `actualMovement < 0.25 × desiredMovement` for > `STUCK_REPATH_TIME = 1.2 s`, force a repath. Handles fragmented graphs (choke-points without waypoints in the opening — common on `TACTICAL-ARENA`).
6. **Fragmented-graph fallback**: when `findPath` returns empty (no connected path), `pickPatrolPath` directs the bot straight at a random waypoint. The character controller slides along walls and may discover a way through.
7. **Damage-triggered repath**: `applyDamage` immediately rebuilds a chase path to the attacker's position. A wounded bot pursues, not patrols.

### 5.7 Tir / safe mode

Через Settings → «Боты наносят урон → ВЫКЛЮЧЕНО»:
- Боты сохраняют patrol / chase / attack state machine, отслеживают игрока, поворачиваются к нему
- `fireAtPlayer()` имеет early-return: **никаких выстрелов, никаких impact'ов на стенах, никакого урона** → чистые moving practice dummies
- HUD показывает pill `SAFE MODE`

---

## 6. Maps & Map System

### 6.1 Map data schema (V0.3)

All map content lives as plain data in [`MapData`](../src/core/mapTypes.ts). Single source of truth for the rendering pipeline, physics, gameplay systems, AI, and the editor. JSON-serializable.

```ts
type MapEntity =
  | { id, kind: 'concrete', pos: Vec3, size: Vec3, color? }
  | { id, kind: 'metal',    pos: Vec3, size: Vec3, color?, emissive?, emissiveIntensity? }
  | { id, kind: 'playerSpawn', pos: Vec3 }
  | { id, kind: 'botSpawn',    pos: Vec3 }
  | { id, kind: 'waypoint',    pos: Vec3 }

type MapData = {
  name: string
  entities: MapEntity[]
  fog?: { near, far, color }
}
```

Coordinate convention: 1 unit = 1 m, Y up, `pos` is the box center, `size` is the full extent on each axis. A box "stands on the floor" when `pos.y == size.y / 2`.

**Read-only pipelines** that consume `MapData`:
- `MapLoader` → renders geometry + builds physics colliders.
- `PlayerController` → reads `playerSpawn` entities for respawn picking.
- `BotSwarm` / `Bot` → reads `botSpawn` for spawn distribution.
- `buildWaypointGraph` → constructs A\* graph from `waypoint` entities.
- `FogSetter` → applies `map.fog`.

Adding a new entity type is: +1 union member in `MapEntity`, +1 render branch in `MapLoader` or a dedicated system, +1 button in editor. No format migration.

### 6.2 Map: SECTOR-17

**Theme:** brutalist concrete reactor complex. **Dimensions:** 80 × 80 × 22 m. **Style:** vertical arena, central reactor focal point, upper walkways.

[Data](../src/core/maps/sector17.ts) (~80 entities).

| Зона | Назначение | Высота |
| --- | --- | --- |
| Центральный реактор | open arena, мощный warm-light источник | 0–11 m |
| 4 опорные колонны | break-of-sight, cover | 0–22 m |
| Outer perimeter walls | bounding | 0–22 m |
| Upper walkways (NW + SE) | flanking / vertical | y = 7 m |
| West ramp + East stairs | подъём на walkways | gradient |
| Crates / cover blocks | mid-arena cover | 2 m high |
| Central wall fragments | breaking long sightlines | 6 m |

5 player spawns, 8 bot spawns, 13 waypoints.

### 6.3 Map: TACTICAL-ARENA (V0.3)

**Theme:** Counter-Strike-style tactical map. **Dimensions:** 80 × 80 × 12 m. **Style:** three-lane competitive layout.

[Data](../src/core/maps/tactical_arena.ts) (~58 entities).

```
        (CT / "north" — bot side)
        ┌──────────────┬──────────────┐
        │   B site     │   A site     │
        │              │              │
        │  ┌──────┐    │    ┌──────┐  │
        │  │ apps │  mid    │ long │  │
        │  │  B   │ corridor│  A   │  │
        │  │ lane │         │ lane │  │
        │  └──────┘    │    └──────┘  │
        │              │              │
        │     T spawn (player side)   │
        └──────────────┴──────────────┘
```

- **Mid lane** (x ≈ 0): central corridor with low cover ("mid window") and a connector room blocking direct N-S sightline — forces flanking.
- **A long** (x ≈ +18..+30): long sightline like Dust-2's Long-A, half/full/boost cover at intervals.
- **B / apps** (x ≈ -18..-30): tighter route with similar cover variety.
- **A site** (NE) and **B site** (NW): bombsite-shaped focal areas with mixed half/full/boost cover.
- **Catwalk** over B-side at y ≈ 3.75 m, accessed by 6-step staircase.
- **Spawn sight-blockers** at z = ±18 prevent direct T↔CT firing lines.
- **Emissive accents**: blue ceiling lamps (4×), warm central pillar, color-coded warning strips at spawns (orange T, blue CT).

1 T-spawn (player), 6 CT-spawns (bots), 18 waypoints.

### 6.4 Map editor (V0.3)

In-game level authoring tool (F2 from menu or pause). [`src/editor/`](../src/editor).

**Capabilities:**
- Templates: start from empty 80×80 slab or clone `SECTOR-17`.
- Entity placement via toolbar buttons; positioned at the orbit-camera focus point with a slight jitter.
- TransformControls gizmo: W = move, E = rotate, R = scale. Snap-to-grid (configurable step, default 0.5 m).
- **Snap-to-floor** button (`⤓ SNAP TO FLOOR`): boxes go to `y = size.y/2`, markers to `y = 0`. Inspector badge `● ON FLOOR` and in-scene green ground-contact plane show flush state.
- Inspector: position, size, color (concrete), emissive + intensity (metal). Per-entity duplicate/delete.
- Undo/redo: 50-step history (Ctrl+Z / Ctrl+Y).
- SAVE/LOAD: File System Access API (Chromium) — picks a folder once, both SAVE and LOAD remember it via shared `id`. Firefox/Safari fallback to `<input type=file>` + `<a download>`.
- `▶ TEST`: drops into a live match on the draft map, bypassing level select.

### 6.5 Level select & rotation (V0.3)

[`src/core/levels.ts`](../src/core/levels.ts) holds the registry. `DEPLOY · SOLO` opens the card grid; clicking a card calls `setCurrentMap(entry.map)` + `startMatch()`. Adding a map: drop file in `src/core/maps/`, push entry into `LEVELS` array.

### 6.6 Lighting & atmosphere

Свет сбалансирован под FPS-budget — линейный рост стоимости fragment shader от количества point-лайтов на `meshStandardMaterial` заставил сократить количество до 5:

| Light | Role | Intensity / Distance |
| --- | --- | --- |
| Ambient | Indirect lift | 1.25 |
| Hemisphere | Sky/ground gradient | 1.1 |
| Directional (key, shadow caster) | Sun-equivalent | 2.6 |
| Reactor core point | Warm rim accent | 5.0 / 44 m |
| Ceiling fixture × 2 (diagonal) | Room illumination | 6.0 / 48 m each |

Fog: 40 → 180 m, цвет `#1c2230`. ACES Filmic tone-mapping, exposure 1.75.

---

## 7. Audio Design

[`AudioSystem.ts`](../src/systems/audio/AudioSystem.ts). Гибрид: **sampled-on-disk** для критичных combat SFX + **procedural Web-Audio synthesis** для всего остального + spatial routing.

### 7.1 Samples (public/sounds/)

| File | Use | Processing |
| --- | --- | --- |
| `pistol-shot.mp3` | Главный выстрел | Slight pitch jitter (±4%), tail-fade |
| `reload.mp3` | Перезарядка | Hard-trim to `WEAPON.RELOAD_TIME` + 120 ms tail-fade |

Загружаются через `loadSample(c, key)` в `AudioBus.init()` — параллельно с первым user-gesture, к моменту первого выстрела декодированы.

### 7.2 Layered pistol shot

При выстреле проигрываются **3 параллельных слоя**:

1. **Dry crack** — sampled mp3 через HRTF panner (refDistance 4, rolloff 1.0), reverb send 0.85. Gain 1.1.
2. **Sub-bass body** — 75→38 Hz sine drop через мягкий `tanh` waveshaper, 220 ms envelope. Идёт мимо реверба (низкие частоты в reverb получаются мутными). Это то, что делает выстрел «телесным» — даёт chest-punch которого нет в mp3.
3. **Wall reflection** — второй BufferSource через `DelayNode (85 ± 15 ms)` → lowpass 900 Hz → gain 0.45 → master + reverb send 0.6. Имитирует bounce от дальних бетонных стен.

Plus длинный convolution reverb (2.6 s decay) → industrial-space tail.

### 7.3 Secondary SFX

> Procedural ambient music layer (reactor hum + vent wind + random clanks) was **removed in V0.3** per design — the room is now silent except for combat and traversal.

| Layer | Source | Purpose |
| --- | --- | --- |
| Footstep | Low-passed noise burst | Тихий, не отвлекает |
| Impact (wall) | High-passed noise burst | Sharp, «metal on concrete» |
| Hurt | Square osc 90 Hz | Низкочастотный thud при damage |
| Kill | Sine 880 → 1 320 Hz | Tonal positive feedback |
| Jump | Low-pass noise + sine | Short rising tone |
| Slide | Filtered noise sweep | Surface friction texture |

### 7.4 Spatialization & mute

- HRTF `PannerNode` для всех combat-звуков.
- Convolution reverb с procedurally-generated impulse response.
- Listener pose обновляется каждый кадр из camera position + forward vector.
- **Mute:** master gain плавно ramp'ится 0 ↔ 0.55 за 80 ms (linear). Hotkey `M`, также checkbox-toggle в Settings.

---

## 8. UI / UX

### 8.1 HUD

Минималистичный, монохромный. [Реализация](../src/ui/HUD.tsx).

```
┌────────────────────────────────────────────────────────┐
│ SECTOR-17 // KZ-7 HEAVY              KILLS / DEATHS    │
│ READY                                07 / 02           │
│                                       TARGET 20        │
│                                                        │
│ ┌──────┐                            ┌──────────┐       │
│ │FPS 60│  ← debug only              │ SAFE MODE│       │
│ │1% 58 │                            │ HITBOXES │       │
│ └──────┘                            └──────────┘       │
│                                                        │
│ ┌──────────────┐                                       │
│ │HIT LOG       │  ← debug only                         │
│ │[H] 68  KILL  │                                       │
│ │[T] 34        │                                       │
│ │TOTALS        │                                       │
│ │HEAD  3 ▌▌▌   │                                       │
│ │TORSO 1 ▌     │                                       │
│ │DMG 170 ACC 75│                          ·            │ ← crosshair
│ └──────────────┘                                       │
│                                                        │
│ VITALS                                AMMO             │
│ 087                                   09 / 63          │
│ ▰▰▰▰▰▰▰░░                            KZ-7 HEAVY       │
└────────────────────────────────────────────────────────┘
```

**Принципы:**
- Никаких эффектов поверх gameplay (нет миникарты, нет компасса).
- Hit marker — 4 коротких диагонали в центре, 150 ms.
- Damage vignette — красный radial gradient, opacity controlled by recent damage.
- Кадр scanline — тонкая рамка по периметру для cinematic feel.
- **Status pills (top-right):** `SFX OFF · M` (при mute), `SAFE MODE` (при выкл damage от ботов), `HITBOXES` (при включ debug-визуализации).

### 8.2 Debug overlays (top-left)

Появляются когда `showHitboxes || !botsCanDamage`:

**FPS counter:**
- Avg FPS + 1% low (worst-frame), окно семплирования 500 ms.
- Цветовая индикация: ≥90 зелёный, 55–90 жёлтый, <55 красный.
- Tabular-nums, monospace — цифры не дёргаются.

**Hit Stats panel** (только при `showHitboxes`):
- `HIT LOG`: последние 8 хитов с цветным zone-tag'ом, точным damage, optional `KILL` бэйджем. Каждая запись fade'ит из opacity 1.0 → 0.35 за 3 s, потом исчезает.
- `TOTALS`: per-zone progress bars (HEAD / TORSO / LEGS) + counter попаданий.
- `SUMMARY`: общий нанесённый damage, total shots fired, accuracy % (= bodyHits / shots × 100).

### 8.3 Menus (V0.3 flow)

```
                 ┌───────────────┐
                 │   MAIN MENU   │
                 │ ─ DEPLOY·SOLO ├──► LEVEL SELECT ──► PLAYING ─► (DEAD ─► auto-respawn)
                 │ ─ DEATHMATCH  │      (cards)             ▲             │
                 │   (SOON,off)  │                          │             │
                 │ ─ EDITOR      ├──► EDITOR ── TEST ───────┘             │
                 │ ─ SETTINGS    │                                        ▼
                 └───────┬───────┘                                  ┌─────────┐
                         ▲                                          │ PAUSED  │
                         │                                          │ RESUME  ├─► PLAYING
                         └── MAIN MENU ◄──────────────────────────── │ SETTINGS│
                                                                    │ MAIN MENU│
                                                                    └─────────┘
```

- **Main menu** (`phase === 'menu'`): wordmark `SECTOR – 17`, subtitle `ARENA FPS / DEMO V0.3`. Buttons: `DEPLOY · SOLO` (→ level select), `DEATHMATCH` (locked, `SOON` badge — placeholder for V1.0 networked DM), `EDITOR`, `SETTINGS`. Controls hint at bottom.
- **Level select** (V0.3, `phase === 'levelSelect'`): card grid. Each card shows map name, tagline, per-map stats (bot spawns, player spawns, block count) and `DEPLOY ▸` CTA. `← BACK` returns to main menu.
- **Pause** (`phase === 'paused'`): `RESUME`, `SETTINGS`, `MAIN MENU` (abandon current match). Editor is no longer reachable from pause via UI; F2 still works as a hotkey.
- **Death screen** (`phase === 'dead'`): красный overlay, `TERMINATED`, timer `RESPAWN IN X.X S`, auto-resume.
- **Settings dialog**:
  - **AUDIO:** toggle-button `SOUND: ON/OFF` (knob slides green ↔ red).
  - **COMBAT:** radio group «Боты наносят урон» → `ВКЛЮЧЕНО` / `ВЫКЛЮЧЕНО · режим тира`.
  - **DEBUG:** radio group «Отображение хитбоксов» → `ПОКАЗАТЬ` / `СКРЫТЬ`.
  - Закрывается по ESC, клику на бэкдроп или `ЗАКРЫТЬ`.
- **Editor UI** (V0.3, `phase === 'editor'`): top toolbar (`← EXIT`, map name, add-buttons, snap, grid, undo/redo, SAVE/LOAD, `▶ TEST`), right-side panel (inspector + entity list), bottom status bar.

### 8.4 Controls

| Input | Action |
| --- | --- |
| WASD / Arrows | Move |
| Mouse | Aim |
| Shift | Sprint |
| Ctrl / C | Crouch (hold) · **Slide (tap while moving > 4.5 m/s)** |
| Space | Jump · slide-cancel when sliding |
| LMB | Fire |
| **RMB (hold)** | **ADS / iron sights** |
| R | Reload |
| **M** | **Mute toggle** |
| **F2** | **Open / close map editor** (from menu or pause) |
| ESC | Pause / release cursor |

While pointer-lock is active, the input system suppresses browser shortcuts that would steal focus or scroll the page (Space, Tab, Backspace, arrows, F1/3/4/5/6/7, Ctrl+R/S/P/F/G/D/H/J/L/U/A/E/0/+/-). Devtools (F12, Ctrl+Shift+I/J/C) and fullscreen (F11) pass through. Privileged combos (Ctrl+T/W/N, Alt+F4) cannot be intercepted from JS without Keyboard Lock API + Fullscreen.

Pointer lock через `requestPointerLock()` после клика DEPLOY. ESC → автоматический pause через `pointerlockchange` event.

---

## 9. Technical Design

### 9.1 Stack

| Layer | Tech | Why |
| --- | --- | --- |
| Rendering | Three.js + React Three Fiber | Declarative scene + ecosystem maturity |
| Physics | Rapier (WASM) | Fast, deterministic, character controller out-of-box |
| State | Zustand (subscribeWithSelector) | Tiny, no provider needed, selector-based re-renders |
| Build | Vite + TypeScript | Fast HMR, ES2022, strict typing |
| Audio | Web Audio API + sampled MP3 | Hybrid: critical SFX from disk, ambient/secondary synthesized |

### 9.2 Architecture principles

```
core/        ← pure data, types, maps  (no deps)
state/       ← Zustand stores           (depends on core)
   ├ gameStore       — match state, HP, ammo, current map
   └ editorStore     — editor map draft, selection, history
systems/     ← gameplay simulation     (depends on core + state)
   ├ movement/       — PlayerController, slide, bhop, air strafe
   ├ combat/         — Weapon, hitscan, recoil
   ├ ai/             — Bot FSM, A* pathfinding, waypoints
   ├ input/          — input manager, browser-shortcut suppression
   └ audio/          — Web Audio mixer + samples
scene/       ← gameplay rendering layer (depends on all above)
   └ map/MapLoader   — renders MapData → meshes + colliders
editor/      ← in-game map authoring   (depends on state/editor + core)
   ├ EditorScene     — orbit camera, TransformControls, picker meshes
   ├ EditorUI        — toolbar, inspector, entity list, file ops
   └ TemplateChooser — empty / clone-existing entry
ui/          ← DOM overlay              (depends on state)
   ├ Menu / LevelSelect / DeathScreen / HUD / SettingsDialog
public/      ← static assets (audio samples)
```

Симуляция (`systems/`) не импортирует ничего из `scene/`. Готова к multiplayer-переносу:
- Клиент отправляет сериализованные `InputState` на сервер.
- Сервер запускает `systems/movement/` + `systems/combat/` + `systems/ai/` в headless-режиме.
- Сервер ширит `playerHandle` / `BotRegistry` snapshot'ы обратно через WebSocket.
- `scene/` остаётся client-only, рендерит интерполированные snapshot'ы.

### 9.3 Performance budget

| Метрика | Target | Текущее |
| --- | --- | --- |
| Frame rate | 60 FPS @ 60 Hz vsync / 120 FPS @ 120 Hz vsync | стабильно держит vsync на mid-tier laptop |
| Frame budget | 16.6 ms (60 Hz) / 8.3 ms (120 Hz) | render ~3 ms, physics ~1 ms, JS ~1.5 ms |
| Draw calls | < 200 | ~80 (после shared concrete material) |
| Triangles | < 60 k | ~25 k |
| Memory | < 200 MB | ~120 MB (WASM + textures + audio buffers) |
| Active point lights | ≤ 5 | 3 point + 1 directional + 1 hemi + 1 ambient |

**Применённые оптимизации (V0.2):**
- Cut point lights 14 → 5 (главный win — fragment shader перекомпилируется с `NUM_POINT_LIGHTS = 3` вместо 14).
- Shared concrete material для всех ~80 map-боксов вместо unique-clone (один WebGL texture upload, batchable draw calls).
- Physics step 1/120 → 1/60 (для kinematic CCT разница неощутима).
- Удалён `setPlayerPos` per-frame store update — никто не подписан на это поле, боты используют `playerHandle.pos` напрямую.
- DPR clamp `[1, 1.5]`.
- FX-impacts capped @ 24 одновременно.
- Bot AI: LOS raycast только когда player в `SIGHT_RANGE`.

### 9.4 Browser FPS ceiling

`requestAnimationFrame` синхронизирован с vsync монитора. На 60 Hz дисплее API даёт ровно 60 кадров/секунду — это **не** ограничение игры, а контракт rAF. На 120 / 144 / 240 Hz моники rAF фаерит соответственно. Web не имеет аналога disable-vsync.

### 9.5 Determinism (forward-looking)

В демо физика — **не детерминированная** (Rapier работает на render dt). При переходе к server-authoritative модели:
- Fixed timestep 1/60 на сервере.
- Клиент lerp/predict между серверными snapshot'ами.
- Movement математика ([`movement.ts`](../src/systems/movement/movement.ts)) уже изолирована и готова к headless-исполнению.

---

## 10. Demo Scope vs Out-of-Scope

### In scope (V0.3)

- ✅ Movement: sprint, **CoD-style edge-triggered slide with progressive friction + steering + cooldown**, CS-style bhop, air strafe
- ✅ First-person camera: FOV shift, head bob, sway, tilt, spring-physics recoil
- ✅ ADS / iron sights (RMB) with real rear-notch + front-post + tritium dots
- ✅ KZ-7 heavy pistol: hitscan, pattern-recoil, sampled audio, **10-round mag, infinite reserve**
- ✅ Procedural view model with spring-physics kick
- ✅ AI bots (4): FSM + **A\* over LOS-aware waypoint graph** + stuck-detection + path-refresh
- ✅ **CS-bot accuracy model** — spread scales with player velocity + burst-spray, with reaction lag
- ✅ Hitbox zones (head/torso/legs) with damage multipliers + debug wireframe
- ✅ HP bars над ботами
- ✅ Debug overlays: FPS counter, hit-stats panel
- ✅ **2 maps**: `SECTOR-17` + `TACTICAL-ARENA` (CS-style 3-lane)
- ✅ **In-game map editor** — full authoring + JSON SAVE/LOAD via File System Access API
- ✅ **Level select screen** — card grid with per-map stats
- ✅ Hybrid combat audio (sampled + synthesized) + HRTF spatial + reverb tail
- ✅ HUD + menus + settings dialog + death/respawn loop
- ✅ Mute (hotkey M + setting)
- ✅ Safe mode / tir — bots don't shoot
- ✅ **Browser-shortcut suppression** during gameplay
- ✅ **Pause-menu rework** — separate flow (RESUME / SETTINGS / MAIN MENU)

### Explicitly out-of-scope (current)

- ❌ Multiplayer / networking (`DEATHMATCH` button stub present, deferred to V1.0)
- ❌ Additional weapons (HM-3 Burst planned for V0.4)
- ❌ Game modes (capture, payload, S&D, etc.) — DM only
- ❌ Progression / cosmetics
- ❌ Real navmesh — A\* over hand-placed waypoints with LOS filtering is acceptable
- ❌ Tutorial / in-game tips
- ❌ Localization (RU/EN currently mixed in UI)
- ❌ Voice / VOIP
- ❌ Reporting / moderation
- ❌ Privileged-shortcut suppression (Ctrl+T/W/N) — needs Keyboard Lock + Fullscreen, deferred

---

## 11. Roadmap

### ✅ V0.3 — Editor, second map, AI overhaul, slide rework (current)

Delivered (see Section 0 change-log):
- Map editor + JSON save/load + level-select
- `TACTICAL-ARENA` (CS-style)
- A\* + LOS-aware navigation for bots
- CS-style accuracy model
- CoD-style slide rework
- Browser-shortcut suppression
- Weapon: 10 mag / ∞ reserve
- Ambient music layer removed

### V0.4 — Polish + content (next)

- Reload cancel при стрельбе
- Death-cam (третье лицо при killed)
- Match-end screen с итогами + restart / map switch
- Sensitivity slider, FOV slider, key rebinding
- Третья карта: **SECTOR-04** — открытый промышленный двор с длинными sightlines
- Оружие 2: **HM-3 Burst Rifle** — 3-shot burst, средняя дистанция
- Bot variant: **Hunter** — медленный, тяжёлый, dual-fire
- Optional: Keyboard Lock API + Fullscreen mode for full shortcut suppression

### V1.0 — Networked (DEATHMATCH unlock)

- Colyseus dedicated server (or custom `ws` + ECS)
- Server-authoritative movement + combat
- Client-side prediction + reconciliation for local player
- Snapshot interpolation for remote players (~100 ms buffer)
- Lag compensation for hitscan (server rewinds enemy positions)
- Matchmaking 1v1 / 2v2 / FFA up to 6
- Anti-cheat baseline (server-side movement validation, input rate-limits)
- Spectator mode
- Lobby UI in front of the existing level-select

### Stretch goals

- Replay system (record InputState, deterministic playback)
- Community map browser (import via the existing JSON LOAD flow → cloud share)
- Modding API for weapons (data-only, no code exec in browser)
- Highlight reel / clip export
- Mobile / touch controls (ambitious — would need a separate input layer)

---

## 12. Risks & Open Questions

| Risk | Mitigation |
| --- | --- |
| CS-style 60 ms bhop window слишком жёсткий для новичков | V0.4: настройка «easy bhop» (200 ms окно + auto-hop) в Settings |
| Iron sights + ADS sensitivity scale могут сбивать muscle memory | Sensitivity slider в V0.4 с раздельной hip/ADS чувствительностью |
| Hitbox через Y-offset не уважает позы (наклоны, slide) | Acceptable для демо; полная Rapier multi-collider rig в V1.0 |
| Waypoint LOS-граф фрагментируется на чокпоинт-картах (как `TACTICAL-ARENA`) | Stuck-detection + direct-walk fallback покрывают; долгосрочно — auto-place waypoints in choke gaps from editor |
| User-authored maps могут иметь невалидные данные (отрицательный size, отсутствие player spawn) | Editor добавляет 1 player spawn в каждый template; runtime фолбэк FALLBACK_SPAWN. V0.4: валидатор перед TEST |
| Бесконечные патроны снижают тактическое давление reload-rhythm | Намеренный design — фокус на movement + accuracy, а не ammo management. Можно вернуть конечный резерв на конкретных режимах в V1.0 |
| Pistol sample может звучать неестественно с разной hardware reverb | Convolution reverb compensates; опционально second-stage delay в V0.4 |
| Rapier WASM не загружается на iOS Safari < 16 | Detect + show requirements screen |
| Server costs при V1.0 multiplayer | Match-instances short-lived, idle сервера спящие; first deploy — laptop-host + Tailscale для friends-only |
| Privileged browser shortcuts (Ctrl+T/W) могут оборвать матч | Документировано; V0.4 опционально предложить fullscreen-mode с Keyboard Lock |

---

## 13. References & Inspiration

| Game / Source | What we take |
| --- | --- |
| Quake III Arena | Air strafing physics, RPS-style speed-vs-aim mind game |
| Counter-Strike 1.6 / Source / 2 | **Bhop timing (no auto-hop), recoil pattern (growing pitch + alt yaw), 3-zone hitboxes, iron sights, bot accuracy model (player-velocity penalty + burst-spray + reaction lag)** |
| **CS Mirage / Dust 2 / Inferno** | **3-lane competitive layout (`TACTICAL-ARENA`) — mid + A long + B/apps, bombsite-shaped focal areas, choke connectors** |
| **CoD MW2019+** | **Slide rework — edge-triggered tap, camera-forward launch, progressive friction, light steering, cooldown** |
| Splitgate | Hybrid arena + modern movement positioning |
| Diabotical / Quake Champions | Минимализм UI, фокус на competitive feel |
| Titanfall 2 | Slide-jump chaining ритм |
| Valorant | Recovery delay before camera return, pattern memorability |
| Severance (TV) | Brutalist concrete language, индустриальная пустота |
| Control (Remedy) | Volumetric лайт + warm/cool color contrast |

---

*End of GDD V0.3. Living document — updates с каждой major version.*
