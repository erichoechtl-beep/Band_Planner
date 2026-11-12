# Band Planner

Offline-First-PWA für Musikproben und Live-Auftritte: Startseite mit Überblick, Setlists mit Song-Status, Songs mit PDF-Leadsheets und Drum Sheets, Transponierer, Terminkalender für Proben und Konzerte, Medien (Rider, Angebote, Pressetexte) und persönliche Notizen. Alles läuft ohne Server und ohne Internet direkt auf dem Gerät.

## Architektur & Funktionsweise

- **App-Dateien:** Der Service Worker speichert beim ersten Aufruf die komplette App inklusive PDF-Engine. Danach startet sie ohne Internet. Es gibt keine CDNs und keine externen Schriften.
- **Daten:** Alles liegt in der IndexedDB des Browsers (Dexie.js). PDFs und Bilder liegen dort als Binärdaten und öffnen deshalb sofort.
- **Single-Admin / Multi-Viewer:** Es gibt keinen Server und keine Sync-Konflikte. Ein Admin pflegt die Daten, alle anderen übernehmen den Stand als Ganzes.

| | Band-Daten | Persönliche Notizen |
|---|---|---|
| **Tabellen** | `songs`, `pdfs`, `setlists`, `rehearsals`, `documents` (dazu `bandNames`, `moodboard` aus älteren Versionen) | `personalNotes` |
| **Bearbeiten** | nur im Admin-Modus | immer, auch im Bühnen-Modus |
| **Export** | ja, in `band-data.json` | nein, bleiben auf dem Gerät |
| **Sync / Import** | werden komplett ersetzt | werden nie angefasst |

Sync und Import laufen in einer Datenbank-Transaktion, zu der `personalNotes` gar nicht gehört. Die Datei wird vorher vollständig geprüft: Ist sie fehlerhaft, bleibt der alte Stand unverändert. Verschwindet ein Song aus den Band-Daten, bleiben die Notizen dazu in der Datenbank erhalten und tauchen wieder auf, sobald der Song zurückkommt.

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

Beim ersten Öffnen mit Internet holt sich das Gerät automatisch den aktuellen Band-Stand von GitHub.

## Band-Workflow: Neue Songs verteilen

**Admin**

1. In den **Admin-Bearbeitungsmodus** wechseln und Songs, Setlists und PDFs pflegen.
2. Unter **Daten-Sync** auf **Band-Daten exportieren** tippen.
3. Datei verteilen, und zwar auf einem der beiden Wege:
   - **GitHub (empfohlen):** Unter **Daten-Sync** auf **Auf GitHub hochladen** tippen. Das öffnet github.com direkt im Ordner `public/` des Repos. Dort `band-data.json` hineinziehen bzw. auswählen und unten **Commit changes** drücken. Die alte Datei wird dabei ersetzt.
   - **Direkt:** Die Datei per WhatsApp oder AirDrop schicken.

**Bandmitglieder**

- **GitHub:** Nichts zu tun. Jedes Gerät prüft beim Öffnen der App, beim Zurückkehren in die App, wenn das Internet wiederkommt, und alle drei Minuten, ob ein neuer Stand vorliegt, und übernimmt ihn automatisch. Wer auf dem eigenen Gerät Änderungen gemacht und nicht exportiert hat, bekommt stattdessen einen Hinweis mit **Übernehmen** oder **Später**. Sofort geht es mit **Daten-Sync → Band-Stand laden**.
- **Datei:** **Daten-Sync → Datei auswählen** antippen und die empfangene Datei wählen. Das klappt auch ohne Internet.

**Gut zu wissen**

- Nach dem Hochladen dauert es etwa eine Minute, bis GitHub die Seite neu gebaut hat. Danach erhalten alle Geräte den neuen Stand beim nächsten Öffnen oder spätestens nach drei Minuten.
- Als Admin immer auf demselben Gerät arbeiten und vor dem Sync exportieren. Bei mehreren Admins gewinnt, wer zuletzt exportiert.
- PDFs und Bilder stecken als Base64 in der JSON-Datei und vergrößern sie. GitHub warnt ab 50 MB und lehnt Dateien über 100 MB ab; auch Messenger setzen Grenzen. Deshalb sind Dateien in den Medien auf 10 MB pro Stück begrenzt.

## Bedienhinweise

- **Termine:** Im Reiter **Termine** trägt der Admin Proben (blau) und Konzerte (orange) ein: Datum, optional Uhrzeit, Bezeichnung (z. B. „Adventmarkt“), Ort und Notiz. Zum Anlegen auf **Termin hinzufügen** tippen oder einen Tag im Kalender wählen, zum Ändern oder Löschen auf den Termin tippen. Termine stecken in der band-data.json und werden wie alles andere verteilt.
- **Drum Sheets:** Jeder Song kann neben dem Leadsheet ein zweites PDF für den Drummer haben. Hochladen im Song-Editor unter „Leadsheet & Drum Sheet“; aufrufen in der Probeansicht (Knopf „Drums“, mit Auto-Scroll), in den Song-Details und unter **Medien**. Akkord-Texte werden nicht mehr gepflegt.
- **Lead Vocals:** Bei jedem Song lässt sich auswählen, wer singt (Benji, Marc, Eric). Die Namen stehen in `src/config.ts`, ebenso der Bandname in der Kopfzeile.
- **Song-Status in der Setlist:** Jeder Song hat einen Status: **Fix in Setlist**, **In Abklärung** oder **Nicht in Setlist**. Der Admin ändert ihn über den Status-Knopf rechts in der Zeile; dort lässt sich ein Song auch ganz entfernen. Die Probeansicht spielt erst alle fixen Songs, danach die in Abklärung (markiert); „Nicht in Setlist“ erscheint dort nicht. Die Gesamtdauer zählt nur fixe Songs.
- **Persönliche Notizen:** Der kleine Zettel in jeder Setlist-Zeile leuchtet gelb, wenn es eine eigene Notiz gibt. Antippen öffnet die Notiz – das geht für alle, auch im Bühnen-Modus. Notizen bleiben auf dem Gerät.
- **Medien:** Unter **Medien** liegen eigene Band-Dokumente (Technischer Rider, Stageplot, Angebot, Pressetext, Vertrag, Foto/Logo, Sonstiges – PDF, Bilder oder Office-Dateien bis 10 MB) und darunter alle Leadsheets aus den Songs mit Angabe, in welcher Setlist sie stehen. Hochladen, umbenennen und löschen kann der Admin, ansehen und herunterladen alle.
- **Startseite:** Beim Öffnen zeigt die App den nächsten Termin, den Stand der Setlist und das Repertoire im Überblick.
- **Darstellung:** Standard ist hell (Weiß und Blau). Den Dunkelmodus schaltet man am Handy über **Menü → Darstellung**, am Computer und in der Probeansicht über den Mond-Knopf ein. Die Wahl gilt pro Gerät.
- **Bühnen-Modus** ist auf jedem neuen Gerät voreingestellt. Der Umschalter ist ein Schutz vor Versehen, keine Zugangskontrolle: Jeder kann auf seinem eigenen Gerät in den Admin-Modus wechseln, Änderungen betreffen aber nur dieses Gerät, bis jemand sie exportiert.
- **Probeansicht:** Zeigt Song für Song Titel, Tonart (mit Transponieren), Tempo mit Metronom-Puls, Lead Vocals, Dauer, Ablauf und die eigene Notiz. Im Admin-Modus lässt sich der Status (Fix / Abklärung / Raus) direkt umschalten; die Reihenfolge bleibt dabei bis zum Schließen gleich. Im PDF-Leadsheet startet **Auto-Scroll** einen gleichmäßigen Bildlauf, dessen Grundtempo zur Songlänge passt (− / + ändern das Tempo, Leertaste startet und stoppt).
- **Vollbild:** Auf Geräten, die es unterstützen, bleibt das Display an. Bluetooth-Fußpedale blättern, wenn sie Pfeil- oder Bild-Tasten senden. Auf dem iPhone gibt es kein echtes Vollbild im Browser; als installierte App läuft die Ansicht trotzdem bildschirmfüllend.
- **Transponieren** ändert nur die Anzeige, nie die gespeicherten Daten. Umgerechnet werden Akkordzeilen (`Am  F  C  G`), Inline-Akkorde (`[Am]Text`), Taktstriche (`| C | G |`), beschriftete Zeilen (`Outro: C G`) und Akkorde in Klammern im Song-Ablauf (`Solo (Am)`). Textzeilen bleiben unverändert. Kommt ein H-Akkord vor, gilt der Song als deutsch notiert (H = h, B = b). `Fis`/`Cis`-Schreibweise wird nicht erkannt.
- **Beispieldaten:** Tonart, Tempo und Dauer der Start-Songs sind Beispielwerte. Die Akkordfelder enthalten nur Akkordfolgen und sollten vor der ersten Probe geprüft werden.

## Projektstruktur

```text
public/band-data.json      Band-Stand für den GitHub-Sync (vom Admin ersetzt)
public/icons/icon.svg      Vorlage der App-Icons; die PNG-Dateien daneben sind daraus gerendert
src/db/schema.ts           Dexie-Schema, Seed, Validierung, Export, Import, Sync
src/db/seedData.ts         Deutsche Start-Daten
src/db/bandActions.ts      Schreibzugriffe für Admin und Notizen
src/context/               Modus, Darstellung und Online-Status (AdminContext; angezeigt unter Daten-Sync), Meldungen (FeedbackContext)
src/lib/transpose.ts       Transponier-Logik
src/components/            Alle Ansichten
```
