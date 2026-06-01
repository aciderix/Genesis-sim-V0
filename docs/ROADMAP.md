# GENESIS — Roadmap technique & production

> Compagnon du [GDD](./GDD.md). Ce document couvre la **stack**, l'**architecture**, les **phases** de développement, l'estimation **équipe & budget**, et les **risques techniques**.

---

## 1. État actuel — bilan du prototype

Le repo `Genesis-sim-V0` contient :

| Composant | Stack | Lignes | État |
|---|---|---|---|
| Engine JS | TypeScript | `engine.ts` 707 | ✅ Fonctionnel, optimisé (5 OPT) |
| Engine WASM | AssemblyScript | `assembly/index.ts` 1692 | ✅ Compile, 55KB, 1.4–2.8× vs JS |
| Worker | Web Worker | `worker.ts` 501 | ✅ Solide, fallback JS↔WASM |
| Rendering | Canvas 2D | `App.tsx` 658 | ✅ Sprite cache, culling, ~60fps à 2K pop |
| CLI | Node + tsx | `src/cli/*` 924 | ✅ Headless run, benchmarks |
| UI | React 19 + Tailwind v4 | `App.tsx` | ⚠️ Desktop-only, monolithe |
| Audio | — | — | ❌ Absent |
| Méta-progression | — | — | ❌ Absent |
| Mobile build | — | — | ❌ Absent |

### Ce qu'on garde
- **Le moteur de sim** (logique de génome/NN/réactions/bonds). C'est la valeur unique.
- **L'architecture Worker** (sim ≠ rendu ≠ UI).
- **L'idée de double-implémentation** (JS pour debug, WASM pour prod).
- **Le CLI** (utile pour CI/balance/régression).

### Ce qu'on remplace
- **React DOM Canvas 2D** → moteur de rendu **GPU** (instanced rendering, jusqu'à 100K particules à 60 fps).
- **Tailwind/HTML UI** → UI native du moteur cible (ou Flutter en overlay).
- **Stack web pure** → **packaging mobile natif** + web preview.

### Ce qu'on ajoute
- Audio, haptique, animations, état persistant, comptes joueur, leaderboards, IAP, analytics, crash-reporting, A/B testing.

---

## 2. Choix de stack — analyse comparée

Le projet a un cœur de calcul exigeant (10K+ agents avec NN) + une UI mobile soignée + une visu fluide. Trois grandes options réalistes :

### Option A — **Godot 4 + Rust core (GDExtension)**
- Pros : moteur **open source**, léger (~50MB), excellent 2D, scripting GDScript rapide, export iOS/Android/Web natif, communauté grandissante. Rust pour le hot-path = perf maximale et code partageable avec WASM.
- Cons : moins d'assets/plugins prêts à l'emploi que Unity, courbe sur GDExtension non triviale.
- **Verdict** : ⭐⭐⭐⭐ idéal pour solo/petite équipe ambitieuse.

### Option B — **Unity 6 (LTS) + DOTS/Burst**
- Pros : industry standard, IAP/Analytics/Ads SDKs intégrés (Unity Gaming Services), Burst-compiled jobs = perf C/Rust-like, Addressables pour le contenu live-ops.
- Cons : coût (Unity Personal OK <200k$/an, sinon Pro), bloat moteur (~150MB binaire iOS), licensing imprédictible (cf. 2023).
- **Verdict** : ⭐⭐⭐⭐ si l'équipe a déjà l'expérience Unity.

### Option C — **Flutter + Flame + Rust FFI**
- Pros : UI native excellente (votre force JS/TS se transpose à Dart sans douleur), Flame pour la 2D, Rust en FFI pour le moteur. Web/iOS/Android avec un seul codebase.
- Cons : Flame moins outillé qu'un vrai moteur de jeu, animations complexes plus ardues.
- **Verdict** : ⭐⭐⭐ bon pour UI mais limité pour 50K+ agents simultanés.

### Option D — **Web + Capacitor (PWA → app native)**
- Pros : on capitalise sur ce qui existe (React + WASM AssemblyScript), TTM le plus court, mêmes devs.
- Cons : perf et UX mobile typiquement 2× inférieures au natif, audio/haptique limités, store policies plus strictes pour PWAs wrappées.
- **Verdict** : ⭐⭐ bon pour MVP/preview, pas pour 1.0 ambitieux.

### Option E — **Bevy (Rust pur)**
- Pros : ECS de classe mondiale, perf optimale, code unique. WebGPU + iOS/Android possibles.
- Cons : écosystème mobile encore immature (toolchain Android laborieuse, iOS pas de templates), UI moins prête.
- **Verdict** : ⭐⭐ trop tôt pour un projet mobile commercial.

### **Recommandation : Option A (Godot 4 + Rust core)**

- **Coût** : 0€ de licence, prod-ready, exports natifs propres.
- **Perf** : Rust pour le sim = 5–10× JS, GPU instancing en GDScript pour 100K agents.
- **Migration progressive** : le `engine.ts` actuel sert de référence pendant le port Rust. Tests CLI gardent la régression sous contrôle.
- **Réutilisation** : on peut compiler le core Rust en **WASM aussi** → on garde une version web preview gratuite (idéal marketing).

---

## 3. Architecture cible

```
┌─────────────────────────────────────────────────────────┐
│                    GODOT 4 (UI + Render)                │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │   Scenes   │  │   GDScript │  │  Multimesh /    │  │
│  │ (Menu, HUD,│  │   logic    │  │  GPU Particles  │  │
│  │  Atlas)    │  │ (events,   │  │  (10K+ inst)    │  │
│  │            │  │   inputs)  │  │                 │  │
│  └─────┬──────┘  └─────┬──────┘  └────────┬────────┘  │
│        │               │                   │           │
└────────┼───────────────┼───────────────────┼──────────┘
         │               │                   │
   ┌─────▼───────────────▼───────────────────▼─────┐
   │           GDExtension bridge (FFI)            │
   └─────────────────────┬─────────────────────────┘
                         │
   ┌─────────────────────▼─────────────────────────┐
   │            GENESIS-CORE  (Rust)               │
   │                                               │
   │  ┌─────────────┐  ┌──────────────┐           │
   │  │   Sim Job   │  │  Genome DB   │           │
   │  │  (parallel) │  │  (serde)     │           │
   │  └─────────────┘  └──────────────┘           │
   │                                               │
   │  ┌─────────────┐  ┌──────────────┐           │
   │  │ Spatial Hash│  │ NN Inference │           │
   │  │ (rayon)     │  │ (SIMD nalg)  │           │
   │  └─────────────┘  └──────────────┘           │
   └───────────────────┬───────────────────────────┘
                       │
              ┌────────┴────────┐
              │                 │
        ┌─────▼─────┐    ┌─────▼─────┐
        │   wasm-   │    │ Native    │
        │  bindgen  │    │ static    │
        │ (Web)     │    │ (iOS/AND) │
        └───────────┘    └───────────┘

Couches transverses :
  • Persistence : Realm (mobile) ou SQLite + serde JSON
  • Backend     : Supabase (Postgres) — déjà disponible dans l'env
                 - Auth (email + Apple/Google)
                 - Cloud Save
                 - Leaderboards (Arène)
                 - Genome sharing par lien
  • Analytics   : PostHog ou Mixpanel (RGPD-friendly)
  • Crash       : Sentry
  • Audio       : moteur Godot (AudioStream + buses) — OK natif iOS/Android
```

### Découpe modulaire (mono-repo)

```
genesis/
├── core/                  ← crate Rust (le moteur)
│   ├── src/
│   │   ├── engine.rs      ← port de engine.ts
│   │   ├── genome.rs
│   │   ├── nn.rs
│   │   ├── spatial.rs
│   │   └── lib.rs
│   ├── tests/             ← snapshot tests vs CLI ref
│   └── Cargo.toml
├── godot/                 ← projet Godot
│   ├── scenes/
│   ├── scripts/
│   ├── assets/
│   └── gdextension/       ← binding Rust→GDScript
├── web/                   ← prototype actuel, gardé pour preview marketing
└── docs/
    ├── GDD.md
    ├── ROADMAP.md
    └── …
```

---

## 4. Plan en 5 phases

### **Phase 0 — Pré-prod (4 semaines)**
**Objectif :** valider la stack et l'esthétique avant tout investissement lourd.

- [ ] Prototype Godot : faire bouger 10 000 quads à 60fps sur iPhone SE2 (smoke test perf)
- [ ] Port minimal du moteur Rust (juste particules + chimie, pas le NN) avec test snapshot vs `engine.ts`
- [ ] Moodboard art + 3 concepts de cellules animées
- [ ] Concept audio : 1 thème Era 0 démo + sons procéduraux PoC
- [ ] **GO/NO-GO** : la stack tient les KPIs perf ? L'art est lisible sur 5" ?

### **Phase 1 — Vertical Slice (10 semaines)**
**Objectif :** une boucle de gameplay complète et fun en Era 0 + Era 1.

- [ ] Port complet du moteur Rust (engine.ts + assembly/index.ts → Rust unique)
- [ ] GDExtension bindings + rendu MultiMesh des particules
- [ ] UI mobile : Header, Bottom dock, Inspector overlay
- [ ] 1 boucle d'objectif court ("amener 50 cellules viables")
- [ ] Sauvegarde locale + reprise hors ligne
- [ ] Audio : 1 thème + 10 SFX + haptique iOS
- [ ] Tutorial de 5 mini-tâches
- [ ] **Build TestFlight + Internal Testing Android**

### **Phase 2 — Contenu & Méta (12 semaines)**
**Objectif :** les 7 Eras jouables + méta-progression.

- [ ] Les 7 Eras avec leurs conditions de passage + biomes + thèmes audio
- [ ] Trait Tree (60 perks) + balance pass
- [ ] Atlas (collection) + screenshots dynamiques
- [ ] Scenarios quotidiens (10 scenarios initiaux)
- [ ] Système de Sparks/Crystals/DNA + équilibrage
- [ ] Persistance cloud (Supabase Auth + cloud save)
- [ ] Localisation : EN, FR, ES, PT-BR, DE (l'audience science est globale)

### **Phase 3 — Multijoueur & Live ops (10 semaines)**
**Objectif :** dimension sociale.

- [ ] Arène asynchrone (combat de génomes serveur-déterministe)
- [ ] Leaderboards globaux + ligues mensuelles
- [ ] Partage de génomes par deeplink + previews dynamiques (OG image générée)
- [ ] Battle Pass v1 (UI cosmétique, biomes spéciaux)
- [ ] IAP intégrés (App Store + Play Store)
- [ ] Analytics + AB testing scaffold

### **Phase 4 — Soft launch (6 semaines)**
**Objectif :** mesurer & ajuster avant le world launch.

- [ ] Soft launch dans 3 pays (CA, NZ, PH — pratique standard)
- [ ] Itération sur retention D1/D7 jusqu'à atteindre les KPIs
- [ ] Live ops events test
- [ ] Bug bash, optimisation batterie, certif accessibilité
- [ ] Marketing assets (trailers, screenshots, ASO)

### **Phase 5 — Launch global + Live ops (continu)**
**Objectif :** durabilité.

- [ ] Saisons mensuelles (1 nouveau biome + cosmétiques)
- [ ] Concours communautaires
- [ ] Roadmap publique
- [ ] Préparation Genesis: Cosmos (extension Phase 6)

---

## 5. Équipe minimale recommandée

| Rôle | FTE | Phases |
|---|---|---|
| **Lead engineer** (Rust + Godot) | 1.0 | Toutes |
| **Gameplay engineer** (Godot/GDScript) | 1.0 | 1–5 |
| **Game designer** | 0.5 | Toutes (full Phases 2–4) |
| **Tech artist** (shaders 2D, anim procédurale) | 0.5 | 1–4 |
| **2D Artist** | 0.5 | 0–3 (puis ponctuel) |
| **Sound designer + Compositeur** | freelance | 1, 3, 5 |
| **Produit/QA** | 0.5 | 3–5 |

**Total ≈ 4 FTE pendant ~12 mois.** Budget réaliste : **350–500k€** tout compris (salaires + freelances + outils + stores fees + soft launch UA).

Une version "solo dev ambitieux" est envisageable mais étire le timeline à 18–24 mois.

---

## 6. Risques techniques majeurs

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **Perf mobile insuffisante** (NN × 10K agents) | Moyenne | Critique | Phase 0 smoke test obligatoire ; cap dynamique de population |
| **Déterminisme du moteur** (Arène serveur) | Haute | Critique | Rust avec ordering strict + tests snapshot dès Phase 1 |
| **GDExtension complexity** | Moyenne | Modéré | Fallback : tout en GDScript pour le MVP, Rust seulement pour hot-path |
| **Stores rejection** (sim complexe, perf) | Faible | Bloquant | Soft launch + early TestFlight |
| **Burnout équipe (12 mois)** | Moyenne | Élevé | Sprints courts (2 sem), no crunch policy, vertical slice tôt pour motivation |
| **Localisation des termes scientifiques** | Faible | Faible | Glossaire bilingue dès Phase 2 |

---

## 7. Décisions à prendre maintenant

Avant tout sprint code, on doit trancher :

1. **Stack** : Godot+Rust (reco) vs Unity vs Flutter+Flame vs Capacitor ?
2. **Échelle équipe** : solo dev (18–24 mois) vs équipe (12 mois) ?
3. **Budget audio** : compositeur original (15–30k€) ou licences (3–5k€) ?
4. **Modèle économique exact** : FtP éthique (reco) vs Premium one-shot (5–10€) vs Hybride ?
5. **Web preview** : on garde l'actuel ou on le tue après le port ?
6. **Backend** : Supabase (déjà dispo) vs Firebase vs custom (Postgres+REST) ?

Une fois ces 6 décisions prises, **Phase 0 peut démarrer en moins d'une semaine**.

---

## 8. Métriques de succès du repo (post-port)

| Métrique | Cible |
|---|---|
| Build iOS | < 60 MB |
| Build Android | < 80 MB |
| Cold start | < 2 s sur iPhone SE2 |
| FPS soutenu @ 5K pop | 60 |
| FPS soutenu @ 20K pop | 30 |
| Battery drain | < 8 %/heure |
| Crash-free sessions | > 99.5 % |
| Couverture tests core | > 70 % |

---

*Roadmap v0.1 — vivante, à raffiner après go/no-go Phase 0.*
