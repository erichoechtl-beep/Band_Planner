# Band Planner

Offline-First-PWA für Musikproben und Live-Auftritte: Setlists, Songs, PDF-Leadsheets, Transponierer, Bandnamen, Moodboard und persönliche Notizen. Alles läuft ohne Server und ohne Internet direkt auf dem Gerät.

## Architektur & Funktionsweise

- **App-Dateien:** Der Service Worker speichert beim ersten Aufruf die komplette App inklusive PDF-Engine. Danach startet sie ohne Internet. Es gibt keine CDNs und keine externen Schriften.
- **Daten:** Alles liegt in der IndexedDB des Browsers (Dexie.js). PDFs und Bilder liegen dort als Binärdaten und öffnen deshalb sofort.
- **Single-Admin / Multi-Viewer:** Es gibt keinen Server und keine Sync-Konflikte. Ein Admin pflegt die Daten, alle anderen übernehmen den Stand als Ganzes.

| | Band-Daten | Persönliche Notizen |
|---|---|---|
| **Tabellen** | `songs`, `pdfs`, `setlists`, `bandNames`, `moodboard` | `personalNotes` |
| **Bearbeiten** | nur im Admin-Modus | immer, auch im Bühnen-Modus |
| **Export** | ja, in `band-data.json` | nein, bleiben auf dem Gerät |
| **Sync / Import** | werden komplett ersetzt | werden nie angefasst |

Sync und Import laufen in einer Datenbank-Transaktion, zu der `personalNotes` gar nicht gehört. Die Datei wird vorher vollständig geprüft: Ist sie fehlerhaft, bleibt der alte Stand unverändert. Verschwindet ein Song aus den Band-Daten, bleiben die Notizen dazu unter „Notizen zu entfernten Songs“ erhalten.

Die App fragt nur nach, wenn etwas verloren ginge: bei nicht exportierten lokalen Änderungen oder wenn der neue Stand älter ist als der vorhandene.

> **Wichtig:** Die Daten liegen im Browser. Wer die Website-Daten löscht, verliert auch die persönlichen Notizen. Sie sind nirgends gesichert.

## Lokaler Start

Voraussetzung ist [Node.js](https://nodejs.org) (aktuelle LTS-Version).

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run preview
```

`npm test` führt die automatischen Tests aus. Der Service Worker läuft nur im Build, Offline-Tests also mit `npm run build` und `npm run preview` durchführen.

## Auf GitHub Pages veröffentlichen

Der Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) baut und veröffentlicht die App bei jedem Push auf `main`. Der Repo-Name ist egal, weil alle Pfade relativ sind.

1. Auf GitHub ein neues Repository anlegen, z. B. `band-app`.
2. Das Projekt hochladen:
   ```bash
   git init
   ```
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Band Planner"
   ```
   ```bash
   git branch -M main
   ```
   ```bash
   git remote add origin https://github.com/DEIN-NAME/band-app.git
   ```
   ```bash
   git push -u origin main
   ```
3. Auf GitHub unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen.
4. Falls der erste Lauf vor dieser Einstellung gescheitert ist: unter **Actions** den Workflow erneut starten.
5. Nach ein bis zwei Minuten ist die App unter `https://DEIN-NAME.github.io/band-app/` erreichbar.

## App auf dem Smartphone installieren

Den Link einmal **online** öffnen und kurz warten, bis die App vollständig geladen ist. Dann:

- **iPhone/iPad (Safari):** Teilen → „Zum Home-Bildschirm“
- **Android (Chrome):** Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“

Danach einmal im Reiter **Daten-Sync** auf **Band-Stand laden** tippen. Ein neues Gerät startet nämlich mit den Beispieldaten, nicht automatisch mit dem Stand der Band.

## Band-Workflow: Neue Songs verteilen

**Admin**

1. In den **Admin-Bearbeitungsmodus** wechseln und Songs, Setlists und PDFs pflegen.
2. Unter **Daten-Sync** auf **Band-Daten exportieren** tippen.
3. Datei verteilen, und zwar auf einem der beiden Wege:
   - **GitHub:** Die Datei `band-data.json` im Repo unter `public/` ersetzen, committen und pushen. Das geht auch direkt auf github.com per „Upload files“.
   - **Direkt:** Die Datei per WhatsApp oder AirDrop schicken.

**Bandmitglieder**

- **GitHub:** **Daten-Sync → Band-Stand laden** antippen.
- **Datei:** **Daten-Sync → Datei auswählen** antippen und die empfangene Datei wählen. Das klappt auch ohne Internet.

**Gut zu wissen**

- Nach einem Push dauert es meist ein bis zwei Minuten für den Workflow und bis zu etwa zehn weitere Minuten, bis GitHub Pages die neue Datei überall ausliefert.
- Als Admin immer auf demselben Gerät arbeiten und vor dem Sync exportieren. Bei mehreren Admins gewinnt, wer zuletzt exportiert.
- PDFs und Bilder stecken als Base64 in der JSON-Datei und vergrößern sie. GitHub warnt ab 50 MB und lehnt Dateien über 100 MB ab; auch Messenger setzen Grenzen. Große Fotos werden beim Hochladen ins Moodboard automatisch verkleinert, PDFs nicht.

## Bedienhinweise

- **Bühnen-Modus** ist auf jedem neuen Gerät voreingestellt. Der Umschalter ist ein Schutz vor Versehen, keine Zugangskontrolle: Jeder kann auf seinem eigenen Gerät in den Admin-Modus wechseln, Änderungen betreffen aber nur dieses Gerät, bis jemand sie exportiert.
- **Vollbild-Bühnenansicht:** Auf Geräten, die es unterstützen, bleibt das Display an. Bluetooth-Fußpedale blättern, wenn sie Pfeil- oder Bild-Tasten senden. Auf dem iPhone gibt es kein echtes Vollbild im Browser; als installierte App läuft die Ansicht trotzdem bildschirmfüllend.
- **Transponieren** ändert nur die Anzeige, nie die gespeicherten Daten. Umgerechnet werden Akkordzeilen (`Am  F  C  G`), Inline-Akkorde (`[Am]Text`), Taktstriche (`| C | G |`), beschriftete Zeilen (`Outro: C G`) und Akkorde in Klammern im Song-Ablauf (`Solo (Am)`). Textzeilen bleiben unverändert. Kommt ein H-Akkord vor, gilt der Song als deutsch notiert (H = h, B = b). `Fis`/`Cis`-Schreibweise wird nicht erkannt.
- **Voting:** Bandnamen-Stimmen sind Band-Daten und werden deshalb vom Admin eingetragen, z. B. in der Probe.
- **Beispieldaten:** Tonart, Tempo und Dauer der Start-Songs sind Beispielwerte. Die Akkordfelder enthalten nur Akkordfolgen und sollten vor der ersten Probe geprüft werden.

## Projektstruktur

```text
public/band-data.json      Band-Stand für den GitHub-Sync (vom Admin ersetzt)
scripts/generate-icons.mjs Erzeugt die App-Icons (npm run icons)
src/db/schema.ts           Dexie-Schema, Seed, Validierung, Export, Import, Sync
src/db/seedData.ts         Deutsche Start-Daten
src/db/bandActions.ts      Schreibzugriffe für Admin und Notizen
src/context/               Modus und Online-Status (AdminContext), Meldungen (FeedbackContext)
src/lib/transpose.ts       Transponier-Logik
src/components/            Alle Ansichten
```
