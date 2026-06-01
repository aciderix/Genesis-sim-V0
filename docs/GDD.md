# GENESIS — Game Design Document

> **Titre de travail** : GENESIS (sous-titres candidats : *Aether*, *Spark*, *Crucible*, *Origin*)
> **Genre** : God-game / Évolution ouverte / Idle-progression / Asynchronous PvP
> **Plateformes cibles** : iOS 15+, Android 9+ (en priorité), Web/PWA, Steam (plus tard)
> **Format** : Free-to-play éthique avec monétisation cosmétique + saisons
> **Sessions cibles** : 2–5 min (commute), 10–20 min (lean-back), idle 24/7 en arrière-plan

---

## 1. Vision

> *Vous êtes une étincelle de causalité dans un monde sans dieu. Sous votre regard, des molécules deviennent des cellules, des cellules deviennent des essaims, des essaims deviennent des esprits. Chaque partie est unique : il n'y a pas de bonne réponse, seulement une vie que vous avez aidée à exister.*

GENESIS prend le moteur de **vie artificielle ouverte** du prototype Genesis-sim-V0 (génomes, sélection naturelle, spéciation émergente, multicellularité) et le transforme en un **vrai jeu mobile** avec :

- une **direction** (Eras, jalons d'ascension)
- un **objectif** clair à chaque session (objectifs courts) **et** à long terme (Ascension)
- une **boucle d'investissement** (collection d'espèces, génétique persistante, méta-progression)
- une **dimension sociale** (Arène asynchrone, partage de génomes)
- une **expérience sensorielle** soignée (art, audio réactif, hapics, animations)

Ce n'est pas un clone de *Spore* (qui est dirigé) ni un simple *Conway* (qui est passif). C'est un **god-game contemplatif et stratégique** où la simulation reste honnête (rien n'est scripté), mais où le joueur a des leviers signifiants et un horizon de récompenses.

---

## 2. Game Design Pillars

1. **Vivant, jamais scripté.** Toutes les espèces qui apparaissent sont des produits réels de la sim. Aucune cinématique forcée. La narration émerge.
2. **Lisibilité avant fidélité.** Une cellule doit *se lire* en un coup d'œil sur un écran de 5". L'esthétique est stylisée, pas réaliste.
3. **Idle qui respecte le joueur.** Le monde tourne hors ligne, mais on ne perd jamais sa progression à cause d'un crash écologique. Filet de sécurité ("Sanctuary").
4. **Décisions, pas micro-management.** Le joueur ne place pas chaque cellule ; il influence des pressions sélectives, des biomes, des évènements.
5. **Mobile-first, sans compromis.** UI au pouce, batterie raisonnable, pas de friction réseau, mode avion OK.
6. **Pas de pay-to-win.** L'avantage compétitif vient de la sélection que vous avez menée, pas de votre carte bancaire.

---

## 3. Audience cible

- **Cœur de cible** : 18–40 ans, joueurs de *Spore*, *Cell to Singularity*, *Eufloria*, *Reus*, *Plague Inc.*, *The Bonsai Bar*, *Universe Sandbox*, *Sandspiel*. Aiment la science, la biologie, les systèmes émergents.
- **Cible secondaire** : joueurs idle / incremental (*Adventure Capitalist*, *NGU*, *Antimatter Dimensions*) — pour la couche méta-progression.
- **Cible tertiaire** : éducation (lycéens, étudiants en bio/SVT/data-sciences). Mode "Free Lab" devient outil pédagogique → marketing organique.

---

## 4. Boucle de gameplay

### 4.1 Boucle minute-à-minute (Session 2-5 min)

```
Ouvrir l'app
  ↓
Récolter les "Sparks" générés hors ligne (proportionnels à la diversité, pas au nb d'individus)
  ↓
Lire le journal : 3 events émergents pendant l'absence (ex. "Espèce-47 a appris la photosynthèse")
  ↓
Effectuer 1-3 actions stratégiques (pression sélective : sécheresse, prédateur, nouvel élément chimique)
  ↓
Capturer un "snapshot" d'un individu remarquable pour la collection
  ↓
Fermer
```

### 4.2 Boucle session (10–20 min)

```
Définir un objectif court ("évoluer un trait X" / défi du jour)
  ↓
Manipuler le monde (ajouter biome, déclencher événement, injecter mutation)
  ↓
Observer les conséquences en accéléré (jusqu'à 100× speed)
  ↓
Itérer (échec attendu — c'est un sandbox darwinien)
  ↓
Réussir → débloquer trait/perk persistant
```

### 4.3 Boucle long terme (jours/semaines)

```
Compléter une Era (jalon évolutif)
  ↓
Débloquer nouvelle dimension de simulation (organes, mémoire, sociétés…)
  ↓
Affronter l'Arène (envoyer son espèce-champion contre celle d'un autre joueur)
  ↓
Recommencer un cycle avec bonus permanent (méta-progression "Big Bang reset")
```

---

## 5. Modes de jeu

### 5.1 **Campagne d'Ascension** (mode principal)
Sept **Eras** débloquées séquentiellement. Chaque Era impose une condition de validation et offre des outils nouveaux.

| Era | Nom | Condition de passage | Débloque |
|---|---|---|---|
| 0 | **Soupe Primordiale** | Faire émerger une réaction auto-catalytique stable (chimie) | Particules + chimie 4 espèces |
| 1 | **Procaryotes** | 50 cellules vivantes sur 5 minutes | NN minimal, mutation, sélection |
| 2 | **Eucaryotes** | Une cellule développe ≥2 organelles fonctionnels | Chimie 8 espèces, photosynthèse |
| 3 | **Multicellularité** | Bond stable de 5+ cellules avec division du travail | Organes, rôles spécialisés |
| 4 | **Mobilité & Sens** | Une espèce poursuit activement sa proie sur 100 ticks | Vision, ouïe, mémoire (NN étendu) |
| 5 | **Communication** | Une espèce coordonne 10+ individus via phéromones/sons | Langage, comportements sociaux |
| 6 | **Sapience** | Émergence d'un outil (modification d'environnement par espèce) | Civilisation primitive |
| 7 | **Singularité** | (post-game) Une espèce dépasse l'écosystème | Méta-reset "Big Bang" + bonus |

Chaque Era est un **biome unique** avec sa physico-chimie et son ambiance audio-visuelle. Le passage débloque un **Trait Tree** (perks permanents du compte joueur, type *Hades* — augmente les chances de mutation favorable, double les nutriments, réduit la rigueur hivernale, etc.).

### 5.2 **Sanctuary** (sandbox / mode libre)
Le mode "diorama" relaxant : pas d'objectif, jusqu'à 10 000 entités, tous les outils débloqués, monde 4× plus grand. Idéal pour lean-back, screenshots, partage.

### 5.3 **Scenarios** (défis quotidiens / hebdo)
Conditions de départ contraintes, objectif unique, leaderboard.
Exemples :
- *Hivernage* : monde glacé permanent. Faire survivre une population pendant 10 minutes.
- *Carcinisation* : faire évoluer 3 espèces différentes vers la même morphologie.
- *Pandémie* : un virus létal est introduit. Faire évoluer une immunité.
- *Photosynthèse Only* : aucun nutriment libre. Toute énergie doit venir du soleil.

Récompense : devise premium gagnée gratuitement + badges saisonniers.

### 5.4 **Arène** (PvP asynchrone)
- Chaque joueur "fige" son espèce-champion (un génome + une stratégie). Coût : Genesis Crystals (devise douce).
- Le serveur lance des **simulations déterministes** où deux écosystèmes fusionnent en bordure.
- Le résultat (combat de 60 secondes accéléré) est rejouable en replay.
- Système d'ELO doux ; saisons mensuelles avec ladder.
- **Pas de timer punitif** : on perd des points, jamais l'espèce. Pas de skill-tree pay-to-win.

### 5.5 **Atlas** (collection / *Pokédex* génomique)
Tout organisme remarquable (nouvelle espèce, mutation rare, traits exotiques) est automatiquement archivé. Le joueur peut "épingler" 200 favoris. Chaque entrée affiche : génome décodé, lignée, biome d'origine, statistiques de survie, screenshot animé. Partageable par lien (deeplink).

---

## 6. Évolution des systèmes de simulation

Le moteur actuel reste la base. Voici les **extensions** pour le jeu mobile.

### 6.1 Chimie étendue
- 8 → **16 espèces chimiques** avec familles (acides, sucres, lipides, ions, "energie pure")
- Réactions auto-catalytiques et cycles métaboliques (Krebs-like)
- pH local, gradients de température
- **Conséquence gameplay** : créer un biome riche en X favorise certaines mutations

### 6.2 Génome enrichi
- Brain actuel (9→6→9) → **NN modulaire** (sensoriel, moteur, cognitif), 32–128 neurones max
- **Génétique structurée** : génome = liste de "gènes" nommés (motilité, photosynthèse, attaque, mémoire…) avec promoteurs régulateurs (gène X activé si chem-Y > seuil)
- **Épigénétique** : certains traits sont activés par l'environnement, hérités sur 2–3 générations
- **Sexual reproduction** déjà présente → étendue avec **dimorphisme** émergent

### 6.3 Multicellularité → Organes
- Bonds actuels → **rôles spécialisés** (Motor, Mouth, Brain, Photo, Womb, Sensor, Armor)
- Le rôle est codé dans le génome et activé selon la position dans l'organisme (système coord-based proche de Hox genes)
- Un organisme = un **super-individu** avec énergie partagée et "système nerveux" central (le neuron d'une cellule Brain commande les Motor adjacentes)
- **Mort partielle** possible (perdre un membre)

### 6.4 Biomes & Climat
- 7 biomes thématiques (un par Era) : Hydrothermal, Tide-Pool, Coral-Reef, Savana, Tundra, Canopy, Abyssal
- Climat dynamique : courants marins, jours/nuits, saisons (déjà présentes), événements extrêmes (volcans, météores)
- **Joueur peut peindre** des zones (température, ressources) avec un coût en Sparks

### 6.5 Écosystèmes
- Vraies chaînes trophiques : herbivores → carnivores → décomposeurs
- **Symbioses** (deux espèces qui se nourrissent mutuellement = bonus de fitness)
- **Parasitisme** (les virus actuels → parasites complexes avec génome propre)
- **Compétition territoriale** (territoires marqués par phéromones)

### 6.6 Émergence d'outils & sociétés (Era 6–7)
- Cellules avec rôle "Builder" → peuvent déposer de la matière inerte structurée (nids, barrages)
- "Memory clusters" : informations apprises transmises socialement (mèmes), pas seulement génétiquement
- Préfigure une "civilisation" : agriculture primitive (cultive ses propres nutriments)

---

## 7. Player Verbs (ce que le joueur PEUT faire)

| Verbe | Coût | Effet | Era unlock |
|---|---|---|---|
| **Inspecter** | gratuit | Voir génome, stats, lignée | 0 |
| **Peindre biome** | Sparks | Modifier T°, chimie locale, lumière | 1 |
| **Sécheresse** / **Inondation** | Sparks | Pression sélective globale courte | 2 |
| **Injecter mutation** | Crystals | Augmenter taux de mutation localement | 2 |
| **Cloner & sanctuariser** | Crystals | Sauver une espèce dans le Sanctuary | 3 |
| **Forger un trait** | Crystals + DNA | Garantir une mutation précise sur N individus | 4 |
| **Catastrophe** | Sparks | Météore, peste, éruption — chaos accéléré | 5 |
| **Big Bang** | gratuit | Reset complet avec bonus de Trait Tree | post-Era 7 |

**Principe** : le joueur n'a JAMAIS de contrôle direct sur le comportement d'un individu. Il modifie **l'environnement** ou la **probabilité** de quelque chose. C'est ça, jouer à dieu — pas micro-gérer.

---

## 8. Méta-progression

### Devises
- **Sparks** (devise douce, régénère hors ligne) — actions in-game
- **Genesis Crystals** (devise dure, gagnée par défis & succès) — actions plus puissantes, slots de Sanctuary
- **Bio-DNA** (devise de prestige, gagnée en "Big Bang" reset) — Trait Tree permanent

### Trait Tree (permanent, type *Slay the Spire* meta)
~60 perks débloquables avec DNA. Exemples :
- *Génétique stable* : -20% mutations délétères
- *Soleil généreux* : +15% production de Sparks hors ligne
- *Mémoire ancestrale* : 1 espèce sauvegardée traverse le Big Bang
- *Œil de Darwin* : voir le détail des mutations en temps réel
- *Mécène* : double Atlas slots

### Saisons (live ops)
Tous les 6 semaines, un nouveau **biome événementiel** + 1 nouveau gène + skin cosmétique de l'UI. Battle pass cosmétique (jamais de pay-to-win).

---

## 9. UI / UX (mobile-first)

### 9.1 Anatomie d'écran (portrait)

```
┌─────────────────────────────────┐
│ ☰ Era 3   ⚡127  💎12  🧬3      │  ← Header compact
├─────────────────────────────────┤
│                                 │
│                                 │
│         [CANVAS GAME]           │
│       pinch zoom / pan          │
│                                 │
│                                 │
├─────────────────────────────────┤
│ ⏸  ▶  ⏩ 4x   📊  📖  🌍       │  ← Bottom dock
├─────────────────────────────────┤
│ [Quick action carousel]         │
│  💧 Eau  ☀ Soleil  🔥 Feu      │
└─────────────────────────────────┘
```

- **Pas de menus à plus de 2 niveaux de profondeur**
- **Pan/zoom** : pinch standard + double-tap to focus species
- **Long-press** sur un organisme → inspector overlay (carte plein écran qui slide depuis le bas)
- **Glisser depuis la droite** → Atlas
- **Glisser depuis la gauche** → Trait Tree
- **Bottom dock** = tous les contrôles temporels (jamais cachés)
- **Tutoriel** : "show, don't tell" — 5 mini-tâches dans la première session, jamais de wall-of-text

### 9.2 Animations & feedback
- Hapics : tick sur l'apparition d'une nouvelle espèce, succès, mutation rare
- Sound design réactif (voir §11)
- Effets shader pour les biomes (caustics aquatiques, neige, brume)
- Particules de "Sparks" qui flottent vers le compteur quand on récolte

### 9.3 Accessibilité
- **Daltonisme** : palette alternative + formes distinctes pour les rôles (pas juste couleur)
- **Texte adaptable** (Dynamic Type iOS, Android scaling)
- **Réduction des mouvements** (option pour désactiver pan/zoom auto et effets parallaxe)
- **Mode mono-main** : tous les contrôles tactiles au pouce dominant

---

## 10. Direction artistique

### 10.1 Mood
*Carl Sagan rencontre Vincent Van Gogh.*
Stylisé, lumineux, jamais photoréaliste. Du contraste, des bleus profonds, des oranges chauds. Inspirations : *Eufloria*, *Journey*, *Sky: Children of the Light*, l'animation *Migrations* de Microsoft, le travail de Beeple en plus organique.

### 10.2 Cellules & organismes
- Procaryotes : taches lumineuses pulsantes, halo
- Eucaryotes : forme cohérente avec "noyau" visible et organelles colorées
- Multicellulaires : corps articulés en bonds, parfois bras, parfois flagelles, parfois tentacules
- Toutes les morphologies sont **dérivées du génome** (pas d'asset 3D) — l'art est procédural et signature unique de la simulation

### 10.3 Environnement
- 7 palettes (1 par Era/Biome) pour ne jamais lasser
- Effets : caustiques, particules ambiantes, brume volumétrique 2D (shader)
- **Day/night cycle** déjà présent → étendu avec aurores, éclipses

### 10.4 UI
- **Style** : "glassmorphism" sobre, typo Inter (déjà dans les deps), accent JetBrains Mono pour les valeurs scientifiques
- **Theme** : sombre par défaut (économie batterie OLED), thème clair en option

---

## 11. Audio

L'audio est **75% de l'immersion** dans un god-game contemplatif. Budget audio = budget visuel.

### 11.1 Musique
- **Score adaptatif** par Era (7 thèmes principaux, layered : ambient, percussion, lead)
- Layers s'activent selon la population, la diversité, les évènements
- Inspirations : *Ori* (Gareth Coker), *Endless Legend* (FlybyNo), *Subnautica* (Simon Chylinski), *Spore* (Brian Eno)
- Compositeur freelance recommandé (budget ~15–30k€ pour 7 thèmes de 4 min + variations)

### 11.2 SFX
- Chaque action du joueur = SFX clair (tap, glissement, succès)
- Évènements émergents = "cues" musicaux courts (nouvelle espèce = arpège ascendant)
- Sons d'organismes : générés procéduralement à partir du génome (synth FM)
  → chaque espèce a son "cri" — incroyable pour l'attachement
- Ambiances par biome (bulles sous-marines, vent glacial, …)

### 11.3 Haptique (iOS Core Haptics / Android Vibrator API)
- Apparition d'espèce rare = "tick" léger
- Crash écologique = vibration grave
- Récolte de Sparks = stacatto

---

## 12. Monétisation (éthique)

**Aucune mécanique addictive prédatrice.** Le projet sera certifié Fair-Play (PEGI, ESRB, et soumissions Apple/Google sans loot box).

### 12.1 Free-to-play
Tout le contenu gameplay est gratuit. Les progressions ne sont jamais bloquées par un timer ou un mur monétaire.

### 12.2 Sources de revenu
1. **Battle Pass saisonnier** (~6€ / saison, 6 semaines) — cosmétiques UI, biomes spéciaux, skins de planète/petri-dish
2. **Pack "Founder"** (~10€ one-time) — accès anticipé, Atlas illimité, badge cosmétique
3. **Pack "Lab Pro"** (~20€ one-time) — édition de scénarios custom + partage, mode pédagogique (B2B éducation)
4. **Crystals** achetables — uniquement pour skip de petits coûts, jamais nécessaire, capped à €5/jour
5. **Cosmétiques pures** (skins de cellules, ambiances UI)

### 12.3 Ce qu'on NE fait PAS
- Pas d'ads forcées (option opt-in pour récolte bonus de Sparks, max 1/h)
- Pas de loot box, pas de gacha
- Pas d'energy system, pas de "wait 4h pour rejouer"
- Pas de PvP payant (l'Arène est 100% skill + sélection patiente)

---

## 13. Live ops

- **Saisons** mensuelles : nouveau biome événementiel + scénarios + récompenses cosmétiques
- **Communauté** : Discord officiel, partage de génomes par lien (deeplink), highlights communautaires hebdomadaires
- **Concours** : "Évoluez la créature la plus rapide / la plus complexe / la plus sociable" — récompenses : crédits in-game + featuring
- **User-generated content** : éditeur de scénarios débloqué par succès → soumissions communautaires, les meilleurs sont intégrés officiellement

---

## 14. Risques de design & mitigations

| Risque | Mitigation |
|---|---|
| **"C'est joli mais je ne sais pas quoi faire"** | Objectifs courts par session + tutorial des 5 mini-tâches |
| **Sim trop chaotique** (extinction permanente) | "Sanctuary" garde toujours une espèce-graine sauvée |
| **Lisibilité écran 5"** | UI au pouce + zoom auto sur les évènements importants |
| **Batterie/chaleur** | Cap FPS auto à 30 sur appareils chauds, mode "low-power" qui réduit la pop visible |
| **Acquisition coûteuse** | Marketing organique (TikTok/YouTube : "regardez ma créature évoluer"), pas de UA payant agressif |
| **Cycle de joueur épuisé** | Big Bang reset + Trait Tree = "newgame+" infini |

---

## 15. KPIs cibles (12 mois post-launch)

| Métrique | Cible |
|---|---|
| D1 retention | 45% |
| D7 retention | 22% |
| D30 retention | 10% |
| Session length moyenne | 7 min |
| Sessions/jour/DAU | 3.2 |
| Conversion paying | 4–6% (au-dessus médiane mobile) |
| ARPDAU | 0.15–0.25 € (sain pour un cœur de niche) |
| Rating store | 4.6+ étoiles |

---

## 16. Vision long terme (post-1.0)

- **Genesis: Cosmos** (extension) — joueur passe de l'écosystème à la planète, plusieurs écosystèmes connectés, événements interplanétaires
- **Genesis EDU** (B2B) — version éducative pour lycées/collèges avec scénarios pédagogiques et tableau de bord enseignant
- **Genesis Console** (port Steam/Switch) — quand la base mobile sera stable
- **API publique** — laisser les chercheurs en ALife exporter/importer des génomes (renforce le côté "vrai" du moteur)

---

*Fin du GDD v0.1 — vivant, à itérer avec les playtests.*
