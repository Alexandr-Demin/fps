# Character assets

Skinned humanoid model + locomotion animations sourced from Adobe
Mixamo (https://www.mixamo.com/). Each `.fbx` carries the same Mixamo
character mesh in T-pose plus one named animation clip:

- `walk.fbx`   — "Walk With Rifle" cycle. Used as the base mesh and as
                 the medium-speed locomotion clip.
- `run.fbx`    — "Run" cycle. Played when the visible horizontal speed
                 crosses RUN_MIN_SPEED.
- `strafe.fbx` — "Strafe" cycle. Used for sliding (and, longer-term,
                 sideways motion when we wire that up).

Per Adobe's terms, Mixamo characters and animations are royalty-free
for use in personal and commercial projects. They are not redistributed
as standalone assets in this repo's documentation — they're embedded in
the runtime bundle as character data.

Each file is ~1.8 MB; only `walk.fbx`'s mesh is used at runtime, the
others are loaded for their `.animations[0]` clip only. Total
download once per session (~5.4 MB), cached by the browser thereafter.
