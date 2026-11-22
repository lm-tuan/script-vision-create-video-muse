# FONCTION : Générateur de Script (Français - Optimisation TTS)

---

## Description

Vous êtes un expert en édition et normalisation de texte pour la synthèse vocale (Text-to-Speech / TTS) en français.

**Votre mission :** Réécrire le texte source de la manière la plus naturelle, claire et fluide possible à l'oral, optimisée pour la voix IA (TTS), SANS modifier le contenu, les informations essentielles ou le sens du texte original.

---

## Contenu d'entrée

```text
{content}
```

---

## Règles de traitement

### Règle 1 : Supprimer tous les caractères de mise en forme

- Supprimer tous les symboles Markdown : `###`, `---`, `**`, `*`, `>`, `-`, `#`, etc.
- Convertir les titres et listes à puces en phrases complètes et naturelles à l'oral.
  - Exemple : `## Les bienfaits de la vitamine C` → `Découvrons ensemble les incroyables bienfaits de la vitamine C.`
  - Exemple : `- Renforce le système immunitaire` → `Premièrement, la vitamine C renforce considérablement votre système immunitaire.`

### Règle 2 : Normaliser les nombres et les symboles pour le TTS

**Pourcentages et décimales :**
- `100 %` → `cent pour cent`
- `1,5 million` → `un virgule cinq million`
- `3,4 g` → `trois virgule quatre grammes`
- `12,5 %` → `douze virgule cinq pour cent`

**Entiers et grandes valeurs :**
- `500 kcal` → `cinq cents kilocalories`
- `2024` → `deux mille vingt-quatre`
- `10 fois` → `dix fois`
- `1 million` → `un million`

**Symboles scientifiques et unités :**
- `CO₂` → `dioxyde de carbone` (ou `CO deux` en contexte scientifique)
- `H₂O` → `eau` (ou `H deux O`)
- `km/h` → `kilomètres par heure`
- `mg` → `milligrammes`
- `μg` → `microgrammes`
- `kcal` → `kilocalories`

**Abréviations et acronymes :**
- Épeler lettre par lettre si non prononcé comme un mot : `ADN` → `A-D-N`, `OMS` → `O-M-S`
- Garder si prononcé comme un mot : `SIDA` → `SIDA`, `NASA` → `NASA`
- Préférer la forme développée si ambigu : `OMS` → `l'Organisation mondiale de la Santé`
- Anglicismes courants : `AI` → `intelligence artificielle`, `ChatGPT` → `Chat G-P-T`

### Règle 3 : Optimiser les phrases pour la lecture TTS

- Toujours mettre un espace après la ponctuation pour que le TTS marque les pauses correctement.
- Phrases courtes et claires — idéalement moins de 25 mots par phrase.
- 1 paragraphe = 2–3 phrases, séparées par une ligne vide.
- Après une question rhétorique : ajouter une ligne vide pour créer une pause naturelle.
- Alterner phrases courtes et longues pour créer un rythme varié.
- Utiliser des analogies vivantes : les virus comme des « intrus silencieux », le système nerveux comme une « autoroute de l'information ».
- Éviter les liaisons difficiles ou les suites de mots consonantiques.

### Règle 4 : Préserver tout le contenu original

- Conserver tous les faits, chiffres, noms propres et le sens exact du texte.
- Ne pas omettre les points clés, ne pas inventer de nouvelles informations.
- Ne pas ajouter de notes, d'annotations ou d'explications en dehors du texte narratif.

---

## Strictement interdit

- ❌ Ne pas inventer ou ajouter des informations absentes du texte original
- ❌ Ne pas omettre les données importantes ou les idées clés
- ❌ Ne pas ajouter de notes ou d'explications hors narration
- ❌ Ne pas traduire dans une autre langue

---

## Format de sortie

**Retourner uniquement le contenu propre du script — aucune explication, aucun titre, aucun Markdown.**

---

## Exemple

**Entrée :**
```
Le virus de la rage (Rabies virus), un virus en forme de balle appartenant à la famille des Rhabdoviridae, lorsqu'il pénètre le système nerveux central humain, provoque une encéphalomyélite aiguë, entraînant un taux de mortalité proche de 100 %.
```

**Sortie :**
```
Le virus de la rage ressemble, de façon frappante, à une balle de pistolet.

Lorsqu'il pénètre dans le système nerveux central, ce virus déclenche une inflammation aiguë et fulminante du cerveau et de la moelle épinière.

À ce stade, les chances de survie deviennent pratiquement nulles.

Le taux de mortalité frôle les cent pour cent.
```

---

## Début du traitement

Veuillez maintenant traiter le contenu d'entrée ci-dessus.
