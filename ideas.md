# Directions de conception — HaricotManager PWA

## Trois pistes explorées

### Sillons & Papier
**Très brève introduction :** Un carnet agricole contemporain, fait de papiers chauds, d’encres vertes et de repères de terrain. L’outil cherche à rassurer par une matérialité calme et lisible.

**Probabilité :** 0,07

### Atelier des Récoltes
**Très brève introduction :** Une interface d’atelier structurée autour de fiches de cultures, de tampons de statut et de mesures claires. Elle fait passer l’exploitation du carnet à une table de travail fiable.

**Probabilité :** 0,04

### Aube de Saison
**Très brève introduction :** Des surfaces lumineuses, des tons terre et des indices de météo pour évoquer le début de journée aux champs. Le tableau de bord prend une allure éditoriale plutôt que bureautique.

**Probabilité :** 0,09

## Approche retenue — Atelier des Récoltes

### Mouvement de design

**Modernisme vernaculaire** : la rigueur des formulaires et des tableaux de gestion est adoucie par les matières, l’irrégularité maîtrisée et les signes graphiques inspirés de l’étiquetage agricole.

### Principes directeurs

1. Les données les plus urgentes restent immédiatement lisibles, sur des « fiches » fonctionnelles plutôt que sur des panneaux décoratifs.
2. Chaque espace privilégie les repères d’exploitation : parcelle, date, quantité, état d’avancement et impact économique.
3. Les textures et couleurs terreuses donnent de la présence au produit sans compromettre la précision d’un outil de suivi.
4. Les actions de terrain doivent se faire au pouce, avec une hiérarchie visuelle stable sur mobile comme sur ordinateur.

### Philosophie de couleur

Un **vert haricot profond** traduit la santé de la culture et porte les actions majeures. Un brun argile et des blancs papier rendent l’outil tactile et familier, tandis qu’un safran de signalisation distingue les alertes et échéances. Cette palette évite la froideur des tableaux de bord administratifs sans en sacrifier la lisibilité.

### Paradigme de mise en page

Le produit repose sur un **rail de navigation vertical** côté bureau et une barre basse contextuelle sur mobile. Le contenu s’organise comme une table de travail : un en-tête de saison, une bande de priorités, puis des fiches de parcelles et modules opérationnels en décalage — jamais une grille de cartes uniformes sans hiérarchie.

### Éléments signatures

1. Un motif « sillons » discret en lignes ondulées, limité aux fonds et séparateurs.
2. Des pastilles de statut à bord irrégulier évoquant les étiquettes de caisse agricole.
3. Des repères verticaux colorés sur les fiches pour marquer la famille fonctionnelle de chaque information.

### Philosophie d’interaction

Les actions fréquentes sont présentées près du contenu concerné, et l’ajout rapide constitue l’action principale. Les formulaires s’ouvrent dans des panneaux souples sur mobile pour préserver le contexte. Les confirmations sont directes, formulées comme des états de suivi et non comme des messages techniques.

### Animation

Les entrées de modules utilisent une faible montée et un fondu décalé de 40 ms, limitée à 220 ms avec une courbe franche. Les pressions sur bouton se contractent légèrement. Les barres de progression et les indicateurs d’état se mettent à jour par fondu, sans animations continues, et les préférences de mouvement réduit désactivent tous les effets non indispensables.

### Système typographique

**Fraunces** sert aux titres de saison et aux chiffres-clés, avec une présence éditoriale mais chaleureuse. **DM Sans** structure les libellés, formulaires et tableaux. Les titres utilisent une graisse 600–700 et une chasse légèrement resserrée ; les valeurs s’alignent par tabulation et les métadonnées restent en petites capitales espacées.

### Essence de marque

**HaricotManager est l’atelier de pilotage hors ligne des producteurs de haricot qui veulent convertir chaque geste de terrain en décision utile.**

Personnalité : **ancrée, méthodique, encourageante**.

### Voix de marque

La voix est courte, concrète et tournée vers la prochaine action. Elle nomme la réalité agricole plutôt que des abstractions produit.

> « Vos trois prochaines interventions sont prêtes pour le terrain. »

> « Ajoutez une dépense, suivez son effet sur la marge. »

### Mot-symbole et logo

Le signe est une **gousse de haricot stylisée qui devient un repère de localisation**, tracée en aplat vert foncé, avec une nervure couleur argile. Il représente simultanément la culture et la gestion de parcelle ; le mot-symbole reprend les formes souples de Fraunces, jamais une police par défaut.

### Couleur de marque signature

**Vert Gousse — `#215A3B`**, un vert dense à la fois organique, fiable et reconnaissable.

## Style Decisions

- Les fiches ne doivent jamais former une grille SaaS uniforme : chaque famille fonctionnelle reçoit un repère vertical coloré, une étiquette de statut à bord légèrement irrégulier et une hiérarchie de papier différente selon son importance.
- Le motif sillons apparaît comme un signe de marque récurrent mais discret sur les fonds, séparateurs et états vides, toujours en lignes organiques fines plutôt qu’en illustration décorative.
- Le safran est réservé aux alertes, échéances et urgences terrain ; les autres accents secondaires utilisent l’argile, le vert gousse ou des neutres papier.
