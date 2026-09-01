# Structured single-exercise training session

## Outcome

Turn single-exercise camera training into a complete session: configure a target, enter frame, train by sets, rest, continue, end early, save, and understand the calorie estimate. Preserve the existing exercise analyzers, workout plans, stored profile, and warm-light visual system.

## Entry and setup

- Single-exercise training defaults to structured mode.
- Before starting, show editable sets, target reps or hold duration, and rest duration.
- Provide a secondary free-training option for users who do not want targets.
- Rest recommendation is explainable and derived from exercise intensity, training goal/difficulty, stored body profile, and recent set performance. Body height and weight are context, not the sole determinant.

## Persistent controls

- Camera, start/pause, end-and-save, and audio controls remain visible with strong contrast.
- End-and-save is visible during an active session and never depends on scrolling or a hidden exit action.
- Ending early produces an honest partial-session summary and saves completed work.

## Set and rest state machine

`setup -> framing -> active -> set-complete -> resting -> ready-next-set -> active -> complete`

- Reaching the set target announces completion once and starts the rest countdown.
- Rest offers skip and +15 seconds.
- When rest ends, announce the next set and return to framing/ready state.
- Manual pause is distinct from rest and does not advance the set.
- Free-training mode retains manual ending and does not auto-rest.

## Voice timing

- Stable framing produces one readiness announcement.
- If the user remains still for two seconds, provide a short next-action cue.
- If still inactive four seconds later, provide one detailed cue.
- Starting movement immediately cancels idle guidance.
- Phase speech uses short, current-stage phrases. Stale phrases are discarded instead of playing in the next phase.
- Corrections remain higher priority than phase narration; one primary audible cue is selected per movement window.

## Demonstration visibility

- Keep the existing in-camera demonstration as a movable overlay.
- Enlarge it during setup, idle guidance, and rest; shrink it during active motion.
- Synchronize its caption with the current or next phase.
- The pre-start state provides a large preview so a user can learn the movement before stepping away from the computer.

## Calories and saving

- Use the existing MET equation: `MET × 3.5 × weight kg / 200 × recognized active minutes`.
- Repetitions do not map to a fixed calorie value, and pose amplitude is not presented as a measured energy input.
- Show the estimate basis: action MET, stored weight, and recognized active time.
- If weight or active time is unavailable, show an explanation instead of a fabricated number.
- Save automatically at a valid completion/end, with a visible direct save/end control during training.

## Visual treatment

- Warm-light page background remains unchanged.
- Training controls use dark solid surfaces, lime for the primary action, and a clearly outlined/destructive end action.
- Disabled controls retain readable labels and do not blend into the page.

## Validation

- Unit-test rest recommendations and the single-exercise session state transitions.
- Unit-test idle reminders, stale-speech cancellation, and movement interruption.
- Verify calorie calculations vary with weight, MET, and active duration.
- Browser-test starting, pausing, ending/saving, rest skip/extend, and responsive visibility.
