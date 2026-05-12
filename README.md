# SECTOR – 17 — Demo

Browser arena FPS demo. Single map, one weapon (KZ-7 Heavy), AI bots, no networking. Built around fast, momentum-preserving movement and tactile gunplay.

## Stack

- **Three.js** + **React Three Fiber** — rendering
- **Rapier Physics** (`@react-three/rapier`) — kinematic character controller + raycasts
- **Zustand** — game state
- **Web Audio API** — fully synthesized procedural audio (no external samples)
- **Vite** + **TypeScript**

No external assets — all geometry is procedural, all textures generated via canvas, all sounds synthesized at runtime.

## Run

```bash
npm install
npm run dev
```

Open the dev URL Vite prints (defaults to `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Shift | Sprint |
| Ctrl (held) while sprinting | Slide |
| Space | Jump (hold to bunny-hop) |
| LMB | Fire |
| R | Reload |
| ESC | Pause / release cursor |

**Movement tips**

- Jump and hold space while landing to preserve momentum (auto-bhop window).
- In the air, rotate the mouse and press strafe + forward in the same direction to gain speed (classic Quake-style air strafing).
- Slide off ledges to launch with extra forward velocity.

## Architecture

The project is organized so that the gameplay simulation is decoupled from the rendering layer, in preparation for an eventual server-authoritative multiplayer model:

```
src/
├── core/                # Tunable constants & shared types
├── state/               # Zustand store (HUD/match state only)
├── systems/
│   ├── input/           # Pointer-lock + key/mouse → input state
│   ├── movement/        # Player kinematic controller + Quake-style movement math
│   ├── combat/          # Weapon, hitscan, view-model
│   ├── ai/              # Bot state machine, waypoint graph
│   └── audio/           # Procedural Web Audio synthesis + spatial panning
├── scene/
│   ├── map/             # SECTOR-17 brutalist geometry
│   ├── lighting/        # Lights + fog setup
│   └── fx/              # Impact decals, FX ticker
├── ui/                  # HUD, menu, death screen
├── App.tsx              # Canvas + overlay composition
└── main.tsx
```

### Movement

`PlayerController.tsx` builds a Rapier `KinematicCharacterController` and runs Quake-derived ground/air acceleration with explicit friction. Key features:

- **Air strafing** via capped wish-speed (`AIR_MAX_WISH_SPEED`) — strafing tangent to velocity adds speed beyond walking pace.
- **Bunny-hop window** — pressing or holding jump within ~150ms of landing skips friction.
- **Slide** — crouch while moving fast on the ground gives an initial boost and applies low friction; FOV widens.
- **Coyote time** — short grace window after walking off a ledge during which jump still triggers.

### Camera

The first-person camera is driven by the player controller every frame:

- FOV interpolates with horizontal speed (sprint widens to 102°).
- Procedural head bob keyed to step phase + speed.
- Subtle roll (tilt) when strafing.
- View-look sway from rate of mouse delta.
- Recoil kick (pitch + yaw) injected by `Weapon` via a `gz:recoil` window event.

### Weapon

Hitscan via `world.castRayAndGetNormal` with a tiny base spread. The view model is a procedurally-built pistol (boxes + cylinders) parented to the camera in world space, with reload/recoil/sway animation. Muzzle flash is a quick `PointLight` + emissive quad.

Bots register their collider handles into a global map so the player's hitscan can resolve hits → damage by id.

### AI

`Bot.tsx` runs a state machine: `patrol → chase → attack → search → patrol`, with a baked waypoint graph (`waypoints.ts`) for navigation. Line-of-sight is a 3-step check: range → FOV-cone dot product → raycast occlusion. Reaction time gates the perception → action transition.

This is intentionally simple (waypoint steering instead of a real navmesh) — sufficient for demo combat-flow.

### Audio

`AudioSystem.ts` synthesizes every sound at call-time:

- Pistol shot: low oscillator pop blended with bandpass-filtered noise burst.
- Impacts: high-passed noise.
- Footsteps: low-passed noise envelope.
- Ambient: low oscillator hum + filtered pink noise + scheduled random metallic clanks.

Spatial sounds route through `PannerNode` (HRTF) with a convolution reverb send to evoke the industrial space.

## Performance

- Single fixed-body world container holds ~80 cuboid colliders.
- Shadow map 1024×1024, single directional light shadow caster.
- Fog hides distant geometry (far = 95m).
- Physics step 1/120s.
- Cap on simultaneous impact decals (24) to bound state size.
- DPR clamped to 1–1.5 to avoid blowing fillrate on retina.

## Known limitations (demo scope)

- One map, one weapon, no progression.
- Bots use a waypoint graph rather than a baked navmesh — they don't path around dynamic obstacles.
- No serverside simulation. All state lives client-side.
- Procedural assets only — no GLTF models, no audio samples.

## What's next (post-demo)

- Colyseus or raw WebSocket networking with server-authoritative movement.
- Real navmesh (recast.js) for bots.
- More weapons + map rotation.
- Hit confirmation prediction & reconciliation.
