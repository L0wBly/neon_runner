# Neon Night Runner — README

Un **runner 2D** (canvas) où vous incarnez un astronaute. Sautez par-dessus les blocs, **accroupissez-vous** pour passer sous les **soucoupes volantes** et ramassez des pièces (et parfois une gemme) dans un décor néon animé (étoiles, vaisseaux en arrière-plan, faune aquatique sous la ligne d’horizon).

Ce README décrit l’installation, l’exécution, les contrôles, les mécaniques et les principaux réglages du jeu tels qu’implémentés dans le fichier `main.js` que vous utilisez.

---

## 1) Prérequis

Le projet est **100 % statique** (HTML/CSS/JS). Aucune compilation n’est nécessaire.  
Il vous faut simplement un **serveur HTTP local** pour servir les fichiers (le jeu charge les assets via `fetch` en mode dev et certains navigateurs bloquent `file://`).

- Option A (recommandé) : l’extension **Live Server** de VS Code  
- Option B : **http-server** (Node.js) : `npx http-server . -p 5500`  
- Option C : **Python** : `python -m http.server 5500`  
- Option D : n’importe quel serveur statique (Apache, Nginx, etc.)

> Le jeu gère aussi un chargement **optionnel** de définitions via API (voir § 7).

---

## 2) Lancer le jeu

1. Placez `index.html`, `styles.css` et `main.js` dans le même dossier (ou votre structure habituelle).
2. Lancez un serveur local à la racine du projet.
3. Ouvrez **http://127.0.0.1:5500** (ou le port que vous avez choisi).
4. Cliquez sur **Jouer** ou appuyez sur **Espace** pour commencer.

---

## 3) Contrôles

- **Sauter** : `Espace` (ou `Flèche ↑`)  
- **S’accroupir** : `Ctrl gauche` (obligatoire pour éviter le rayon des soucoupes)  
- **Pause/Reprendre** : `P`  
- **Mobile** : un **tap** déclenche un **saut**. (Le s’accroupir n’est pas encore mappé tactile.)

---

## 4) Mécaniques de jeu (logique telle qu’implémentée)

### Obstacles
- **Blocs** : apparitions dynamiques avec largeur/hauteur **ré‑ajustées à la vitesse** du joueur pour rester franchissables.  
- **Soucoupes volantes** : obstacles aériens avec **rayon de tractage**.  
  - Le **rayon ne touche pas le sol** visuellement (halo), mais dispose d’une **zone létale** si vous ne vous accroupissez pas.  
  - Le jeu **empêche deux soucoupes consécutives** et respecte un **pré‑gap minimal** avant soucoupe pour garantir la lisibilité.

### Pièces & gemme
- Les **pièces** apparaissent aux paliers de score (300, 500, 1000… selon progression).  
- Les pièces **ne sont jamais placées** :  
  - trop proches du bord droit d’un bloc au **moment probable du ramassage** ;  
  - dans la zone létale d’un rayon (si c’est le cas, elles sont **reposées au sol**).  
- Après une pièce, le jeu **gèle** brièvement la génération d’obstacles afin de laisser le temps de la récupérer **sans situation injuste**.  
- Une **gemme** peut apparaître **une seule fois par run** dans une plage de score (sécurisée comme les pièces).

### Difficulté & gaps
- La vitesse augmente progressivement : `speed = 220 + 14 * t`.  
- Les distances **minimales** et **maximales** entre obstacles s’adaptent **à la vitesse et à la taille d’écran** :  
  - `minGapPxForSpeed(v)` ~ *200 + 0.70 × v*  
  - `maxGapPxForViewSpeed(viewW, v)` ~ *≈ 50 % de la largeur de l’écran*  
- Un **anti‑trou** empêche les périodes trop longues sans obstacle (capées par un temps d’attente max dépendant de la vitesse).

### Décors animés
- Parallax d’étoiles (proches/lointaines), vaisseaux variés en arrière‑plan, surface de l’eau avec **faune** (poissons, sous‑marins) et bulles.  
- Tous ces éléments sont **cosmétiques** : ils ne provoquent pas de collisions.

---

## 5) Arborescence type

```
/
├─ index.html        # Canvas + HUD + overlays (Jouer, Pause, Game Over)
├─ styles.css        # Thème néon/futuriste du HUD et de l’overlay
└─ main.js           # Toute la logique (rendu, gameplay, génération, entrées)
```

> Si vous avez un autre agencement, mettez simplement à jour les chemins dans `index.html`.

---

## 6) Personnalisation & réglages importants

Les constantes ci‑dessous se trouvent en tête de `main.js`. Elles permettent d’affiner le gameplay **sans casser la sécurité** :

| Catégorie | Constante | Rôle | Valeur par défaut |
|---|---|---|---|
| Physique | `GRAVITY` | gravité (px/s²) | `2200` |
|  | `JUMP_VY` | vitesse initiale du saut (px/s) | `-950` |
| Joueur | `PLAYER_R` | rayon de collision debout | `22` |
|  | `CROUCH_SCALE` | facteur de taille accroupi | `0.6` |
| Rayon | `BEAM_CLEAR_MARGIN` | marge de sécurité rayon | `6` |
|  | `BEAM_GROUND_GAP` | espace visuel sous le halo | `28` |
| Gaps | `minGapPxForSpeed(v)` | gap mini en px (fonction) | `200 + 0.70*v` |
|  | `maxGapPxForViewSpeed(w,v)` | gap maxi ~ demi‑écran | `≈ w*0.5` |
| Pièces | `BONUS_LEAD_TIME` | avance d’apparition | `0.65 s` |
|  | `bonusStepFor(s)` | cadence des paliers | `<1000:300, <2000:500, sinon:1000` |

> Les fonctions **`spawnBonusAtThreshold`** et **`spawnPattern`** intègrent toutes les **garanties de sécurité** (clearances, gel temporaire du spawn, anti « double soucoupe », etc.). Si vous touchez ces fonctions, testez bien les cas limites.

---

## 7) (Optionnel) Intégration API

Le jeu tente de charger des catalogues de définitions depuis `API_BASE` :

- `GET ${API_BASE}/obstacles` → `{ items: [{type,wMin,wMax,hMin,hMax,weight}, ...] }`  
- `GET ${API_BASE}/bonuses`   → `{ items: [{type,points,weight}, ...] }`

En cas d’échec réseau, il retombe sur :
- `FALLBACK_OBSTACLES` (blocs simples)  
- `FALLBACK_BONUSES` (coin/gem)

`API_BASE` vaut par défaut `http://localhost:3001`.  
Vous pouvez **désactiver** l’API en laissant ce service éteint : le jeu fonctionne en **mode fallback**.

---

## 8) Performances & compatibilité

- **Canvas** avec mise à l’échelle par `devicePixelRatio` → rendu net en HiDPI.  
  Si vous constatez un ralentissement sur très petits GPU, vous pouvez réduire la quantité de décor (poissons, bulles, vaisseaux) en baissant les compteurs dans `spawn…()` correspondants.  
- Testé récents Chrome/Edge/Firefox. Safari récent OK.  
- Mobile : jouable mais **l’accroupissement n’est pas encore mappé** (FUTUR : geste « swipe bas »).

---

## 9) Dépannage (FAQ rapide)

**Q. Je peux tomber sur une pièce « impossible ».**  
R. Le placement empêche déjà les cas injustes (clearance post‑bloc, anti‑rayon, gel de spawn). Si vous modifiez les constantes ou la physique, adaptez aussi `CLEAR_POST_OBS`, `runAfterCrouchPx` et les `minPostPx*` dans `spawnBonusAtThreshold()`.

**Q. Des trous (sans obstacle) trop longs.**  
R. Le système **clamp** déjà les gaps via `minGapPxForSpeed` et `maxGapPxForViewSpeed` + un plafond en **secondes** (fonction `maxIdleSeconds`). Diminuez ce plafond si nécessaire.

**Q. Deux soucoupes d’affilée.**  
R. Bloqué par `lastObstacleWasSaucer` et un **pré‑gap** minimum. Sauf si vous réécrivez `spawnPattern()`.

---

## 10) Tests de non‑régression (checklist)

- [ ] On peut **toujours** passer **sous** une soucoupe en s’accroupissant ; le **rayon tue** si on reste debout.  
- [ ] Les **pièces** ne sont jamais dans un rayon (ou **re‑collées** au sol) et restent **récupérables**.  
- [ ] Après une pièce sous rayon, **prochain obstacle** suffisamment **après** (clearance dynamique).  
- [ ] **Jamais** deux soucoupes **consécutives**.  
- [ ] **Gaps** toujours compris entre min/max et **dépendants** de la vitesse/écran.  
- [ ] **Pause** et **Game Over** fonctionnent (overlay affiché, reprise OK).  
- [ ] Sur redimensionnement, le sol et le joueur se **recalent** correctement.

---

## 11) Déploiement

Le jeu est **statique** : vous pouvez le publier tel quel sur Netlify, GitHub Pages, Vercel, S3, etc.  
Aucune étape de build n’est requise.

---

## 12) Licence & crédits

- **Licence** : au choix (MIT recommandé si vous souhaitez le partager).  
- **Crédits** :  
  - Conception & code gameplay/graphismes canvas : *vous + votre équipe*.  
  - Aucune ressource externe obligatoire (tout est dessiné en Canvas).

---

### Notes finales

Le fichier `main.js` que vous utilisez **contient toutes les garanties** demandées durant votre itération (soucoupes « justes », pièces toujours récupérables, distances dynamiques, anti‑trou, etc.).  
Si vous souhaitez des paramètres « exposés » (UI debug), on peut ajouter un petit panneau pour modifier `minGap`, `maxGap`, `BONUS_LEAD_TIME`, etc. en temps réel.
