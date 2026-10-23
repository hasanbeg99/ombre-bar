# Ombré Bar – Extension API (v1)

(Project dir is still /workspace/oh-my-matcha; global object stays `window.OMM`.)

Stable interface for game modes (e.g. the "Rush Hour" customer/rush mode; menu placeholder "Rush Hour (bald)", mode id suggestion: 'rush').
Core "Endlos" mode itself is built on exactly this API.

```js
window.OMM = {
  T,                 // tuning object (read; tweak at own risk)
  startGlass(recipe),// slide in a new glass and start pouring it
  onGlassDone(cb),   // register callback, called once per finished glass; returns unsubscribe fn
  setHUD(obj),       // override HUD texts (see below)
  mode,              // current mode id string: 'menu' | 'endless' | <your id>
  // extra helpers (optional):
  registerMode(id, { label, start(api), stop() }), // adds/enables a menu button
  setMode(id),       // switch mode ('menu' returns to menu)
  random(seed?)      // seeded RNG helper -> function returning [0,1)
};
```

## recipe
```js
{
  id: 'any-string',
  glass: 'tall' | 'short' | 'cup',
  layers: [ { type: 'milk'|'matcha'|'strawberry'|'coconut'|'foam',
              target: 0..1 } ]   // CUMULATIVE fill fraction of the glass (top line of that layer)
}
```
- targets must be strictly increasing; last target <= ~0.95.
- Optional per-recipe extras: `band` (tolerance multiplier, default 1), `rampMul` (stream ramp multiplier, default 1).
- Ice is always present (visual only, does not displace volume).
- Player holds = pours current layer, release = stop; the layer is judged after its after-flow settles,
  then the next layer becomes active. Overflow (level > 1.0) ends the glass immediately.

## done payload (passed to every onGlassDone callback)
```js
{
  recipeId, score,            // score = points earned in this glass (incl. multipliers of core mode only if endless)
  perfect: bool,              // all layers PERFEKT
  overflow: bool,
  failed: bool,               // overflow OR any layer missed badly (|error| > T.missTol)
  layers: [ { type, target, actual, error /* actual-target, signed */, sharpness /* 0..1, 1 = crisp */ } ]
}
```

## setHUD(obj)
Any of: `{ title, score, sub, lives, hint, order: bool }` – strings/numbers shown in the top HUD.
Pass `null` for a field to restore the default. `setHUD(null)` resets all.

## Lifecycle for a mode
1. `OMM.registerMode('rush', { label:'Rush Hour', start(api){...}, stop(){...} })` (enables the menu button).
2. In `start`: call `OMM.startGlass(recipe)`; on `onGlassDone` decide next glass / game over.
3. To end the run: `OMM.gameOver({ score, title, lines:[...] })` shows the game-over panel (restart re-calls start).

## Additions (v1 final)
- `recipe.time` (seconds, optional): per-glass ice-melt timer; when it runs out the glass ends with `timeout: true, failed: true`. Omit = no timer.
- `recipe.name` (optional): drink name shown on the order card. `recipe.hints` (bool): show tutorial hints.
- done payload also has `timeout: bool`, `reason: 'ok'|'miss'|'overflow'|'timeout'`, `time` (s used), `timeLeft`.
- `target` is the HEIGHT fraction of the glass interior (0 = bottom, 1 = rim) where that layer's top must end.
  Glasses have different shapes ('cup' is a bowl: fills fast at the bottom, slow at the top).
- Player may re-hold to top up the current layer; a layer is committed after `T.COMMIT` s idle (after its after-flow settled).
- `onGlassDone` callbacks are cleared automatically on `setMode` (register them again in `start`).
- `OMM.pop(text, color?)` shows a floating text; `OMM.gameOver({ score, title, sub, lines })`; `OMM.state()` returns read-only engine info.
- Game title is a config value `T.TITLE` (title is 'Ombré Bar'); do not hardcode a name.
- Repo: hasanbeg99/ombre-bar (Pages: https://hasanbeg99.github.io/ombre-bar/). Global object name stays `window.OMM`.
