# Ombré Bar – Modus „Rush Hour“ (Design, kurz)

## Kern-Loop (5–8 s pro Glas, 60 s pro Schicht)
1. Gast stellt sich an die Theke → Sprechblase zeigt Drink + Schichten bis zum Strich.
2. Spieler gießt mit dem Core-Mechanik (einmal halten pro Schicht, Loslassen = Schicht fertig).
3. Bewertung → Gast reagiert (glücklich / neutral / genervt), Trinkgeld fliegt in die Leiste, Serie wächst.
4. Nächster Gast. Nach 60 s „Feierabend!“ → Ergebnis → „Nochmal“ (ein Tipp).

Eine Schicht = ein Durchgang. Kein Leben-System, kein Game-Over mitten drin – nur die Uhr.

## Bewertung & Trinkgeld
- Präzision je Schicht: `acc = 1 − |Fehler| / 0.09`, gewichtet mit sauberer Grenze (`0.7 + 0.3·Schärfe`). Mittelwert = Qualität q.
- q ≥ 0.62 → **glücklich** (≈ Core „GUT“), q ≥ 0.36 → **neutral** (≈ „KNAPP“), darunter **genervt**.
  Verfehlte Schicht (Core `miss`) → höchstens neutral. Überlauf / Timeout → genervt.
  Zu lange gewartet (Geduld leer) → Laune eine Stufe schlechter; Gast geht, wenn er gar nicht drankommt.
- Trinkgeld (glücklich): `Basis · (0.8 + 0.6q) · (0.6 + 0.4·Restgeduld) · Serie + 8 bei PERFEKT`, Stammgast ×1.5.
  Neutral: 40 % der Basis, Serie bricht. Genervt: 0.
- Serie: ×1.0 → +0.2 je glücklichem Gast in Folge, max ×3.0.

| Drink | Glas | Schichten | Basis | frei ab |
|---|---|---|---|---|
| Iced Matcha Latte | hoch | Milch · Matcha | 15 | sofort |
| Strawberry Matcha | hoch | Erdbeere · Milch · Matcha | 18 | sofort |
| Coconut Cloud | kurz | Kokos · Matcha · Cold Foam | 20 | 8 Gäste |
| Matcha Classic (Milch, Matcha, Cold Foam) | Becher | Milch · Matcha · Cold Foam | 22 | 25 Gäste |

Ziellinien je Gast ±0.04 variiert (Mindestabstand 0.13, oberste ≤ 0.95).

## Tempo (Rush steigt)
| | Start | Ende (60 s) |
|---|---|---|
| Gast-Abstand | 7.5 s | 4.5 s (±15 %) |
| Geduld | 26 s | 16 s (Stammgäste ×1.3, Opa Ferdl ×1.8) |
| Core `diff` (Band enger, Strahl schneller) | 0.05 | 0.45 |
| Core `rampMul` | 1.0 | 1.35 |
Banner „Rush Hour!“ (Start), „Endspurt!“ (40 s), „Letzte Bestellung“ (bei 60 s, laufendes Glas darf fertig werden). Schlange max. 4.

## Progression (nur Kosmetik)
- **Stammgäste** (feste Figuren, eigene Wünsche, ★): Lotte (10 glückliche Gäste), Theo (Serie 5), Frau Berger (3× Perfekt in einer Schicht), Nova (1× Tages-Challenge), Opa Ferdl (1.000 Trinkgeld gesamt). 5 Herzen → Geschenk (exklusives Glas/Deko).
- **Café-Shop**, feste Preise, alles sichtbar: Gläser 150–800, Deko 120–600 (Summe ≈ 3.670).
- **Tages-Challenge**: Gäste aus Datums-Seed (`ombre-rush-daily-JJJJ-MM-TT`), für alle gleich, alle Drinks, keine Stammgäste. Lokales Tagesbestes; Payload für spätere Rangliste vorbereitet.

## Balancing (gemessen, echter Core v1.0, Autopilot mit Zielfehler)
Siehe `/workspace/pwtest/omb_balance_results.json`. Pro Schicht ≈ 7–8 Gläser (Core braucht ~7–8 s pro 3-Schicht-Glas).
Profi/Gut ≈ 200–270 Trinkgeld, Gelegenheit ≈ 90–150 → erstes Glas nach 1–2 Schichten, ganzer Shop nach ≈ 15–30 Schichten (≈ 15–30 min).
Mit Core v1.1 (ein Halten pro Schicht) wird jedes Glas schneller → Werte neu messen (`node omb_balance.js`).

## Warum es hängen bleibt
- Sehr kurze Runden (60 s) + Ein-Tipp-„Nochmal“, Bestwert sichtbar.
- Serie ×3 macht Präzision spürbar wertvoll; ein Patzer tut weh, aber die nächste Schicht ist sofort da.
- Gesichter reagieren sofort (Hüpfen, Herzen, Grummeln) – emotionales Feedback statt nur Zahlen.
- Stammgäste = kleine Geschichten + konkrete Ziele („noch 2 Herzen für Theo“).
- Tages-Challenge = täglicher Grund zurückzukommen, fair vergleichbar.

## Fairness (EU/Österreich)
Kein Echtgeld, keine Lootboxen, keine Zufallskäufe, keine Energie/Wartezeiten, keine Timer-Angebote, kein FOMO.
Trinkgeld nur für Kosmetik, Preise fest und vorab sichtbar. Pause jederzeit, Auto-Pause beim App-Wechsel.
