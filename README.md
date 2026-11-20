# 🧠 Culture Box

Mon site perso pour bosser ma culture générale : des quiz de 20 questions par thème, une explication sourcée après chaque réponse, et une progression sauvegardée.

## Fonctionnalités

- **15 thèmes, 821 questions** : Histoire, Cinéma, Musique, Nature, Art, Géographie, Sciences, Littérature, Sport, Mythes & religions, Gastronomie, Langue française, BD/séries/jeux vidéo, Inventions & tech, Monde & société.
- **Une explication détaillée** (le contexte, le « pourquoi ») après chaque réponse, et un bouton « Voir la source » qui lance une recherche Wikipédia à la demande.
- **Cash d'abord** : tu tapes directement ta réponse (XP x3, tolérance aux fautes de frappe). Si tu sèches, Entrée à vide affiche 4 choix (x1), ou un bouton en affiche 2 (x0,5). Réglage « Carré direct » si tu préfères les propositions tout de suite.
- **Répétition espacée** : chaque question revient après 1, 3, 7, 14, 30, 60 puis 120 jours si tu la sais. Une erreur la remet tout de suite dans tes révisions. Une bonne réponse en Cash fait avancer de deux crans.
- **Modes** : Révisions dues, Défi du jour, Grand mélange, Éclair (60 s), Survie (mort subite), et quiz par thème.
- **Mode chrono** : 25 s par question, bonus d'XP si tu réponds en moins de 8 s.
- **XP, niveaux, combos, records, série de jours et 19 badges**, plus une prévision des révisions sur 7 jours.
- **Page Progression** : réussite par thème, questions découvertes et maîtrisées, tes « bêtes noires », historique.
- **Export/Import** de ta progression (fichier JSON) pour la sauvegarder ou passer d'un appareil à l'autre.
- Raccourcis clavier : `1` à `4` pour répondre, `Entrée` pour passer à la suite.

## Mettre le site en ligne sur GitHub Pages

1. Crée un dépôt sur GitHub (par exemple `culture-box`).
2. Envoie-y le contenu de ce dossier :
   ```bash
   git init
   git add .
   git commit -m "Culture Box"
   git branch -M main
   git remote add origin https://github.com/<ton-pseudo>/culture-box.git
   git push -u origin main
   ```
3. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, puis choisis `main` et `/ (root)`.
4. Au bout d'une minute environ, le site est en ligne sur `https://<ton-pseudo>.github.io/culture-box/`.

> Avec un compte GitHub gratuit, Pages exige un dépôt **public** : les questions seront visibles, mais **tes scores restent privés**, car ils sont stockés uniquement dans ton navigateur (localStorage). Pense à exporter ta progression de temps en temps.

## Ajouter des questions

Chaque thème est un fichier dans `data/`. Ajoute une entrée **à la fin** de la liste `questions` :

```js
{ q: "La question ?", a: "Bonne réponse", w: ["Faux 1", "Faux 2", "Faux 3"],
  e: "L'explication, avec le petit détail qui fait retenir.", s: "Titre de l'article Wikipédia" },
```

`s` peut aussi être une URL complète (`https://...`) vers une autre source.

Pour créer un **nouveau thème** : copie un fichier de `data/`, change `id`, `name`, `emoji` et `color`, puis ajoute une ligne `<script src="data/mon-theme.js"></script>` dans `index.html`.

Ta progression est liée au **texte** de chaque question : si tu corriges le texte d'une question, elle repartira de zéro dans tes stats.
