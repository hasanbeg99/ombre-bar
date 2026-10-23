# Ombré Bar

Hypercasual-Demo (HTML5 Canvas 2D, PWA, Hochformat). Schichte Iced Matcha Lattes:
**Halten = gießen, Loslassen = stoppen.** Jede Schicht hat ihren eigenen Strich am Glas.
Je länger du am Stück hältst, desto schneller fließt es – und schnelles Gießen macht die Grenze zur Schicht darunter trüb.
Matcha läuft nach und sinkt als grüne Wolke in die Milch, Cold Foam steigt nach. Kurz nachgießen ist erlaubt; nach kurzer Pause ist die Schicht fertig.

- Live: https://hasanbeg99.github.io/ombre-bar/
- Modus **Endlos**: 3 Leben (Becher), Leben weg bei Überlaufen, verfehlter Schicht (außerhalb der Toleranz) oder geschmolzenem Eis (Timer).
  Perfektes Glas (alle Schichten PERFEKT + saubere Grenzen) = Serien-Multiplikator bis ×5.
- Modus **Rush Hour (bald)**: Platzhalter, wird über die Erweiterungs-Schnittstelle eingesteckt – siehe `EXTENSION_API.md` (`window.OMM`).
- Alle Spielwerte stehen im Objekt `T` oben in `game.js` (inkl. `T.TITLE`, Zutaten `T.ING`, Glasformen `T.GLASS`).
- Build-Marker: `OMM_BUILD v1.0.0 2026-10-23`. Tests: `/workspace/pwtest/omm_test.js`.
- Kleines Detail: „O.T.“-Gravur auf dem Glas und „inspiriert von O.T.“ auf dem Startbildschirm.

© 2026 Oruci Sabahudin. Code, Grafik und Sound prozedural/original.
