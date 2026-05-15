# Character assets

Skinned humanoid models + locomotion animations sourced from Adobe
Mixamo (https://www.mixamo.com/). Each `.fbx` carries one Mixamo
character mesh in T-pose plus one named animation clip:

Meshes (skin used at runtime):
- `walk.fbx`   — base mesh for human-piloted remote players, plus the
                 "Walk With Rifle" loop.
- `idle.fbx`   — base mesh for waypoint-AI bots (Mixamo's "Orc Idle"
                 page is bound to the orc character by default), plus
                 the looped idle animation used at speed ~ 0.

Animation-only (skin discarded at runtime):
- `run_forward.fbx`   — "Run Forward" cycle. Played at horizontal
                        speed ≥ RUN_MIN_SPEED.
- `strafe.fbx`        — "Strafe" cycle. Used for sliding (and, in
                        future, dedicated lateral movement).
- `jump.fbx`          — "Standing Jump" cycle. Played while the
                        visible vertical speed crosses
                        ±JUMP_MIN_ABS_VY.
- `start_walking.fbx` — "Start Walking" transition. Played LoopOnce
                        on the idle → walk boundary so the body
                        doesn't snap into a mid-stride pose.

Per Adobe's terms, Mixamo characters and animations are royalty-free
for use in personal and commercial projects.

Each file is ~1.8–2.2 MB; total download once per session, cached
thereafter. Both `walk.fbx`'s and `idle.fbx`'s meshes are cloned per
remote-player instance with SkeletonUtils.clone; clips are shared.
