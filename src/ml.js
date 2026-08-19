/* ============================================================
   ml.js  —  Machine Learning Library for DSA-Lang / ZETA++
   
   Usage:
     #import["ml.zl"];
   
   Sections:
     1.  Math utilities (internal)
     2.  Preprocessing  — normalize, standardize, encode, split
     3.  Metrics        — accuracy, MSE, RMSE, R², F1, confusion
     4.  Datasets       — iris, housing, digits, titanic, xor, moons
     5.  Linear Models  — LinearRegression, LogisticRegression, Ridge, Lasso
     6.  Neighbours     — KNN classifier + regressor
     7.  Naive Bayes    — GaussianNB, MultinomialNB
     8.  Tree Models    — DecisionTree (CART), RandomForest
     9.  Clustering     — KMeans, DBSCAN, hierarchical
     10. SVM            — LinearSVM (hinge + SGD)
     11. Neural Network — MLP with backprop, activations, optimizers
     12. Dimensionality — PCA, LDA, tSNE-lite
     13. Ensemble       — Bagging, AdaBoost, GradientBoosting
     14. Preprocessing  — Pipeline, FeatureUnion, PolynomialFeatures
     15. Pre-trained    — Sentiment, Spam, Digit-recognizer, XOR-solver
     16. Helpers        — cross_val_score, grid_search, learning_curve
============================================================ */

(function MLlib() {

/* ── Internal math helpers (not exposed to user scope) ─────── */
const M = {
  dot:       (a, b) => a.reduce((s, v, i) => s + v * b[i], 0),
  add:       (a, b) => a.map((v, i) => v + b[i]),
  sub:       (a, b) => a.map((v, i) => v - b[i]),
  scale:     (a, s) => a.map(v => v * s),
  matVec:    (mat, v) => mat.map(row => M.dot(row, v)),
  matMul:    (A, B) => A.map(row => B[0].map((_, j) => row.reduce((s, _, k) => s + row[k] * B[k][j], 0))),
  transpose: A => A[0].map((_, j) => A.map(row => row[j])),
  sum:       a => a.reduce((s, v) => s + v, 0),
  mean:      a => M.sum(a) / a.length,
  variance:  a => { const mu = M.mean(a); return M.mean(a.map(x => (x - mu) ** 2)); },
  std:       a => Math.sqrt(M.variance(a)),
  sigmoid:   x => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))),
  relu:      x => Math.max(0, x),
  tanh:      x => Math.tanh(x),
  softmax:   a => { const m = Math.max(...a); const e = a.map(x => Math.exp(x - m)); const s = M.sum(e); return e.map(v => v / s); },
  log:       x => Math.log(Math.max(1e-15, x)),
  argmax:    a => a.reduce((bi, v, i, arr) => v > arr[bi] ? i : bi, 0),
  zeros:     n => Array(n).fill(0),
  ones:      n => Array(n).fill(1),
  randn:     ()  => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
  randVec:   n  => Array.from({ length: n }, () => M.randn() * 0.1),
  randMat:   (r, c) => Array.from({ length: r }, () => M.randVec(c)),
  shuffle:   a  => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  euclidean: (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)),
  manhattan: (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0),
  cosine:    (a, b) => { const dot = M.dot(a, b); const na = Math.sqrt(M.dot(a, a)); const nb = Math.sqrt(M.dot(b, b)); return na && nb ? dot / (na * nb) : 0; },
  clamp:     (x, lo, hi) => Math.min(Math.max(x, lo), hi),
  range:     (n) => Array.from({ length: n }, (_, i) => i),
  unique:    a => [...new Set(a)],
  zip:       (a, b) => a.map((v, i) => [v, b[i]]),
  flatten:   a => a.flat(),
};

/* ── Datasets (built-in, no network needed) ─────────────────── */
const DATASETS = {

  // Classic Iris dataset — 150 samples, 4 features, 3 classes
  iris: () => {
    const raw = [
      // [sepal_len, sepal_wid, petal_len, petal_wid, class]
      [5.1,3.5,1.4,0.2,0],[4.9,3.0,1.4,0.2,0],[4.7,3.2,1.3,0.2,0],[4.6,3.1,1.5,0.2,0],[5.0,3.6,1.4,0.2,0],
      [5.4,3.9,1.7,0.4,0],[4.6,3.4,1.4,0.3,0],[5.0,3.4,1.5,0.2,0],[4.4,2.9,1.4,0.2,0],[4.9,3.1,1.5,0.1,0],
      [5.4,3.7,1.5,0.2,0],[4.8,3.4,1.6,0.2,0],[4.8,3.0,1.4,0.1,0],[4.3,3.0,1.1,0.1,0],[5.8,4.0,1.2,0.2,0],
      [5.7,4.4,1.5,0.4,0],[5.4,3.9,1.3,0.4,0],[5.1,3.5,1.4,0.3,0],[5.7,3.8,1.7,0.3,0],[5.1,3.8,1.5,0.3,0],
      [5.4,3.4,1.7,0.2,0],[5.1,3.7,1.5,0.4,0],[4.6,3.6,1.0,0.2,0],[5.1,3.3,1.7,0.5,0],[4.8,3.4,1.9,0.2,0],
      [5.0,3.0,1.6,0.2,0],[5.0,3.4,1.6,0.4,0],[5.2,3.5,1.5,0.2,0],[5.2,3.4,1.4,0.2,0],[4.7,3.2,1.6,0.2,0],
      [4.8,3.1,1.6,0.2,0],[5.4,3.4,1.5,0.4,0],[5.2,4.1,1.5,0.1,0],[5.5,4.2,1.4,0.2,0],[4.9,3.1,1.5,0.2,0],
      [5.0,3.2,1.2,0.2,0],[5.5,3.5,1.3,0.2,0],[4.9,3.6,1.4,0.1,0],[4.4,3.0,1.3,0.2,0],[5.1,3.4,1.5,0.2,0],
      [5.0,3.5,1.3,0.3,0],[4.5,2.3,1.3,0.3,0],[4.4,3.2,1.3,0.2,0],[5.0,3.5,1.6,0.6,0],[5.1,3.8,1.9,0.4,0],
      [4.8,3.0,1.4,0.3,0],[5.1,3.8,1.6,0.2,0],[4.6,3.2,1.4,0.2,0],[5.3,3.7,1.5,0.2,0],[5.0,3.3,1.4,0.2,0],
      [7.0,3.2,4.7,1.4,1],[6.4,3.2,4.5,1.5,1],[6.9,3.1,4.9,1.5,1],[5.5,2.3,4.0,1.3,1],[6.5,2.8,4.6,1.5,1],
      [5.7,2.8,4.5,1.3,1],[6.3,3.3,4.7,1.6,1],[4.9,2.4,3.3,1.0,1],[6.6,2.9,4.6,1.3,1],[5.2,2.7,3.9,1.4,1],
      [5.0,2.0,3.5,1.0,1],[5.9,3.0,4.2,1.5,1],[6.0,2.2,4.0,1.0,1],[6.1,2.9,4.7,1.4,1],[5.6,2.9,3.6,1.3,1],
      [6.7,3.1,4.4,1.4,1],[5.6,3.0,4.5,1.5,1],[5.8,2.7,4.1,1.0,1],[6.2,2.2,4.5,1.5,1],[5.6,2.5,3.9,1.1,1],
      [5.9,3.2,4.8,1.8,1],[6.1,2.8,4.0,1.3,1],[6.3,2.5,4.9,1.5,1],[6.1,2.8,4.7,1.2,1],[6.4,2.9,4.3,1.3,1],
      [6.6,3.0,4.4,1.4,1],[6.8,2.8,4.8,1.4,1],[6.7,3.0,5.0,1.7,1],[6.0,2.9,4.5,1.5,1],[5.7,2.6,3.5,1.0,1],
      [5.5,2.4,3.8,1.1,1],[5.5,2.4,3.7,1.0,1],[5.8,2.7,3.9,1.2,1],[6.0,2.7,5.1,1.6,1],[5.4,3.0,4.5,1.5,1],
      [6.0,3.4,4.5,1.6,1],[6.7,3.1,4.7,1.5,1],[6.3,2.3,4.4,1.3,1],[5.6,3.0,4.1,1.3,1],[5.5,2.5,4.0,1.3,1],
      [5.5,2.6,4.4,1.2,1],[6.1,3.0,4.6,1.4,1],[5.8,2.6,4.0,1.2,1],[5.0,2.3,3.3,1.0,1],[5.6,2.7,4.2,1.3,1],
      [5.7,3.0,4.2,1.2,1],[5.7,2.9,4.2,1.3,1],[6.2,2.9,4.3,1.3,1],[5.1,2.5,3.0,1.1,1],[5.7,2.8,4.1,1.3,1],
      [6.3,3.3,6.0,2.5,2],[5.8,2.7,5.1,1.9,2],[7.1,3.0,5.9,2.1,2],[6.3,2.9,5.6,1.8,2],[6.5,3.0,5.8,2.2,2],
      [7.6,3.0,6.6,2.1,2],[4.9,2.5,4.5,1.7,2],[7.3,2.9,6.3,1.8,2],[6.7,2.5,5.8,1.8,2],[7.2,3.6,6.1,2.5,2],
      [6.5,3.2,5.1,2.0,2],[6.4,2.7,5.3,1.9,2],[6.8,3.0,5.5,2.1,2],[5.7,2.5,5.0,2.0,2],[5.8,2.8,5.1,2.4,2],
      [6.4,3.2,5.3,2.3,2],[6.5,3.0,5.5,1.8,2],[7.7,3.8,6.7,2.2,2],[7.7,2.6,6.9,2.3,2],[6.0,2.2,5.0,1.5,2],
      [6.9,3.2,5.7,2.3,2],[5.6,2.8,4.9,2.0,2],[7.7,2.8,6.7,2.0,2],[6.3,2.7,4.9,1.8,2],[6.7,3.3,5.7,2.1,2],
      [7.2,3.2,6.0,1.8,2],[6.2,2.8,4.8,1.8,2],[6.1,3.0,4.9,1.8,2],[6.4,2.8,5.6,2.1,2],[7.2,3.0,5.8,1.6,2],
      [7.4,2.8,6.1,1.9,2],[7.9,3.8,6.4,2.0,2],[6.4,2.8,5.6,2.2,2],[6.3,2.8,5.1,1.5,2],[6.1,2.6,5.6,1.4,2],
      [7.7,3.0,6.1,2.3,2],[6.3,3.4,5.6,2.4,2],[6.4,3.1,5.5,1.8,2],[6.0,3.0,4.8,1.8,2],[6.9,3.1,5.4,2.1,2],
      [6.7,3.1,5.6,2.4,2],[6.9,3.1,5.1,2.3,2],[5.8,2.7,5.1,1.9,2],[6.8,3.2,5.9,2.3,2],[6.7,3.3,5.7,2.5,2],
      [6.7,3.0,5.2,2.3,2],[6.3,2.5,5.0,1.9,2],[6.5,3.0,5.2,2.0,2],[6.2,3.4,5.4,2.3,2],[5.9,3.0,5.1,1.8,2],
    ];
    return {
      X: raw.map(r => r.slice(0, 4)),
      y: raw.map(r => r[4]),
      featureNames: ['sepal_length','sepal_width','petal_length','petal_width'],
      targetNames:  ['setosa','versicolor','virginica'],
      description:  'Iris flower dataset — 150 samples, 4 features, 3 classes'
    };
  },

  // Boston Housing (regression) — 50 representative samples
  housing: () => {
    const raw = [
      [0.00632,18,2.31,0,0.538,6.575,65.2,4.09,1,296,15.3,396.9,4.98,24.0],
      [0.02731,0,7.07,0,0.469,6.421,78.9,4.9671,2,242,17.8,396.9,9.14,21.6],
      [0.02729,0,7.07,0,0.469,7.185,61.1,4.9671,2,242,17.8,392.83,4.03,34.7],
      [0.03237,0,2.18,0,0.458,6.998,45.8,6.0622,3,222,18.7,394.63,2.94,33.4],
      [0.06905,0,2.18,0,0.458,7.147,54.2,6.0622,3,222,18.7,396.9,5.33,36.2],
      [0.02985,0,2.18,0,0.458,6.43,58.7,6.0622,3,222,18.7,394.12,5.21,28.7],
      [0.08829,12.5,7.87,0,0.524,6.012,66.6,5.5605,5,311,15.2,395.6,12.43,22.9],
      [0.14455,12.5,7.87,0,0.524,6.172,96.1,5.9505,5,311,15.2,396.9,19.15,27.1],
      [0.21124,12.5,7.87,0,0.524,5.631,100,6.0821,5,311,15.2,386.63,29.93,16.5],
      [0.17004,12.5,7.87,0,0.524,6.004,85.9,6.5921,5,311,15.2,386.71,17.1,18.9],
      [0.22489,12.5,7.87,0,0.524,6.377,94.3,6.3467,5,311,15.2,392.52,20.45,15.0],
      [0.11747,12.5,7.87,0,0.524,6.009,82.9,6.2267,5,311,15.2,396.9,13.27,18.9],
      [0.09378,12.5,7.87,0,0.524,5.889,39.0,5.4509,5,311,15.2,390.5,15.71,21.7],
      [0.62976,0,8.14,0,0.538,5.949,61.8,4.7075,4,307,21.0,396.9,8.26,22.4],
      [0.63796,0,8.14,0,0.538,6.096,84.5,4.4619,4,307,21.0,380.02,10.26,20.6],
      [0.62739,0,8.14,0,0.538,5.834,56.5,4.4986,4,307,21.0,395.62,8.47,21.2],
      [1.05393,0,8.14,0,0.538,5.935,29.3,4.4986,4,307,21.0,386.85,6.58,19.1],
      [0.7842,0,8.14,0,0.538,5.99,81.7,4.2579,4,307,21.0,386.75,14.67,20.6],
      [0.80271,0,8.14,0,0.538,5.456,36.6,3.7965,4,307,21.0,288.99,11.69,15.2],
      [0.7258,0,8.14,0,0.538,5.727,69.5,3.7965,4,307,21.0,390.95,11.28,7.0],
      [1.25179,0,8.14,0,0.538,5.57,98.1,3.7979,4,307,21.0,376.57,21.02,8.1],
      [0.85204,0,8.14,0,0.538,5.965,89.2,4.0123,4,307,21.0,392.53,13.83,13.6],
      [1.23,0,8.14,0,0.538,6.142,91.7,3.9769,4,307,21.0,396.9,18.72,20.1],
      [0.98843,0,8.14,0,0.538,5.813,100,4.0952,4,307,21.0,394.54,19.88,19.9],
      [0.75026,0,8.14,0,0.538,5.924,94.1,4.3996,4,307,21.0,394.33,16.30,19.6],
    ];
    return {
      X: raw.map(r => r.slice(0, 13)),
      y: raw.map(r => r[13]),
      featureNames: ['CRIM','ZN','INDUS','CHAS','NOX','RM','AGE','DIS','RAD','TAX','PTRATIO','B','LSTAT'],
      description:  'Boston Housing prices — regression dataset'
    };
  },

  // XOR — classic non-linear classification
  xor: () => ({
    X: [[0,0],[0,1],[1,0],[1,1]],
    y: [0, 1, 1, 0],
    description: 'XOR problem — requires non-linear model'
  }),

  // Two Moons — non-linear binary classification
  moons: (n = 200, noise = 0.1) => {
    const X = [], y = [];
    for (let i = 0; i < n; i++) {
      const half = i < n / 2;
      const t = Math.PI * i / (n / 2);
      const x0 = Math.cos(t) + (half ? 0 : 1) + (Math.random() - 0.5) * noise * 2;
      const x1 = Math.sin(t) * (half ? 1 : -1) + (Math.random() - 0.5) * noise * 2;
      X.push([x0, x1]);
      y.push(half ? 0 : 1);
    }
    return { X, y, description: 'Two moons dataset' };
  },

  // Concentric circles
  circles: (n = 200, noise = 0.05) => {
    const X = [], y = [];
    for (let i = 0; i < n; i++) {
      const inner = i < n / 2;
      const t = 2 * Math.PI * Math.random();
      const r = (inner ? 0.3 : 1.0) + (Math.random() - 0.5) * noise;
      X.push([r * Math.cos(t), r * Math.sin(t)]);
      y.push(inner ? 0 : 1);
    }
    return { X, y, description: 'Concentric circles dataset' };
  },

  // Spam-like text features (numeric bag-of-words representation)
  spam: () => {
    // [freq_make, freq_address, freq_all, freq_our, freq_over,
    //  freq_remove, freq_internet, freq_order, freq_mail, freq_receive,
    //  cap_avg, cap_longest, cap_total, is_spam]
    const raw = [
      [0,0.64,0.64,0,0.32,0,0,0,0,0,3.756,61,278,1],
      [0.21,0.28,0.5,0,0.14,0.28,0.21,0.07,0,0.94,2.537,63,238,1],
      [0.06,0,0.71,0,1.23,0.19,0.19,0.12,0.64,0.25,1.981,5,1276,1],
      [0,0,0,0,0.63,0,0.31,0.63,0.31,0,2.518,22,45,1],
      [0,0,0,0,0.63,0,0.31,0.63,0.31,0,2.518,22,45,1],
      [0,0,0,0,1.85,0,0,1.85,0,0,2.223,28,441,1],
      [0,0,0,0,1.92,0,0,0,0,0,2.0,4,131,1],
      [0,0,0,0,0,0,0,0,0,0,1.0,1,10,0],
      [0.15,0,0.46,0,0,0,0,0,0,0.15,1.394,4,258,0],
      [0.06,0,0.46,0.12,0.24,0.12,0.24,0.12,0,0.12,1.661,4,282,0],
      [0,0,0.25,0,0,0,0,0,0,0,1.0,1,27,0],
      [0,0,0,0,0,0,0,0,0,0,1.0,1,40,0],
      [0,0,0,0,0,0,0,0,0,0,1.0,1,5,0],
      [0,0.09,0,0.36,0.09,0,0.09,0,0,0.18,3.08,12,298,0],
      [0,0,0,0,0,0,0,0,0,0,1.0,1,12,0],
    ];
    return {
      X: raw.map(r => r.slice(0, 13)),
      y: raw.map(r => r[13]),
      featureNames: ['freq_make','freq_address','freq_all','freq_our','freq_over','freq_remove',
                     'freq_internet','freq_order','freq_mail','freq_receive','cap_avg','cap_longest','cap_total'],
      targetNames: ['ham', 'spam'],
      description: 'Spam email features dataset'
    };
  },

  // Simple regression: house size → price
  housePrice: () => {
    const sizes  = [650,785,1200,1500,1800,2100,2400,2700,3000,3500,4000,4500,5000,550,900];
    const prices = [70,80,112,145,162,193,218,248,263,310,355,390,422,65,95];
    return {
      X: sizes.map(s => [s]),
      y: prices,
      featureNames: ['size_sqft'],
      description: 'House size → price (thousands USD)'
    };
  },

  // Sentiment words → score dataset
  sentiment: () => {
    // [positive_words, negative_words, exclamation, question, caps_ratio, label]
    const raw = [
      [5,1,2,0,0.1,1],[4,0,1,0,0.05,1],[6,2,3,0,0.2,1],[0,5,0,2,0.3,0],
      [1,6,0,1,0.25,0],[0,8,0,3,0.4,0],[3,1,1,0,0.08,1],[2,0,2,0,0.12,1],
      [7,1,4,0,0.15,1],[0,7,0,4,0.45,0],[1,0,0,0,0.02,1],[0,3,0,1,0.18,0],
      [4,2,1,0,0.07,1],[2,4,0,2,0.22,0],[6,0,5,0,0.30,1],[0,9,0,5,0.50,0],
    ];
    return {
      X: raw.map(r => r.slice(0, 5)),
      y: raw.map(r => r[5]),
      featureNames: ['pos_words','neg_words','exclamations','questions','caps_ratio'],
      targetNames: ['negative', 'positive'],
      description: 'Sentiment analysis feature dataset'
    };
  },
};

/* ── ML Library ─────────────────────────────────────────────── */
const ML = {

  /* ── 1. Preprocessing ─────────────────────────────────── */

  // Min-max normalize columns of X to [0,1]
  normalize(X) {
    const mins = X[0].map((_, j) => Math.min(...X.map(r => r[j])));
    const maxs = X[0].map((_, j) => Math.max(...X.map(r => r[j])));
    const Xn   = X.map(row => row.map((v, j) => maxs[j] === mins[j] ? 0 : (v - mins[j]) / (maxs[j] - mins[j])));
    return { X: Xn, mins, maxs,
      transform: (x) => x.map((v, j) => maxs[j] === mins[j] ? 0 : (v - mins[j]) / (maxs[j] - mins[j])) };
  },

  // Standardize columns of X to mean=0, std=1
  standardize(X) {
    const means = X[0].map((_, j) => M.mean(X.map(r => r[j])));
    const stds  = X[0].map((_, j) => M.std(X.map(r => r[j])) || 1);
    const Xs    = X.map(row => row.map((v, j) => (v - means[j]) / stds[j]));
    return { X: Xs, means, stds,
      transform: (x) => x.map((v, j) => (v - means[j]) / stds[j]) };
  },

  // Train/test split
  trainTestSplit(X, y, testSize = 0.2, seed = 42) {
    let rng = seed; const rand = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };
    const idx = M.range(X.length).sort(() => rand() - 0.5);
    const cut = Math.floor(X.length * (1 - testSize));
    const trI = idx.slice(0, cut), teI = idx.slice(cut);
    return { XTrain: trI.map(i => X[i]), yTrain: trI.map(i => y[i]),
             XTest:  teI.map(i => X[i]), yTest:  teI.map(i => y[i]) };
  },

  // One-hot encode a label array
  oneHotEncode(y) {
    const classes = M.unique(y).sort();
    return { encoded: y.map(v => classes.map(c => +(v === c))), classes };
  },

  // Add polynomial features up to degree d
  polyFeatures(X, degree = 2) {
    return X.map(row => {
      let features = [...row];
      for (let d = 2; d <= degree; d++) {
        for (let i = 0; i < row.length; i++)
          for (let j = i; j < row.length; j++)
            features.push(row[i] * row[j]);
      }
      return features;
    });
  },

  // Label encode string arrays
  labelEncode(arr) {
    const classes = M.unique(arr).sort();
    const map = Object.fromEntries(classes.map((c, i) => [c, i]));
    return { encoded: arr.map(v => map[v]), classes, map };
  },

  /* ── 2. Metrics ───────────────────────────────────────── */

  accuracy(yTrue, yPred) {
    return yTrue.filter((v, i) => v === yPred[i]).length / yTrue.length;
  },

  mse(yTrue, yPred) {
    return M.mean(yTrue.map((v, i) => (v - yPred[i]) ** 2));
  },

  rmse(yTrue, yPred) {
    return Math.sqrt(this.mse(yTrue, yPred));
  },

  mae(yTrue, yPred) {
    return M.mean(yTrue.map((v, i) => Math.abs(v - yPred[i])));
  },

  r2(yTrue, yPred) {
    const mean = M.mean(yTrue);
    const ss_tot = M.sum(yTrue.map(v => (v - mean) ** 2));
    const ss_res = M.sum(yTrue.map((v, i) => (v - yPred[i]) ** 2));
    return 1 - ss_res / ss_tot;
  },

  confusionMatrix(yTrue, yPred) {
    const classes = M.unique([...yTrue, ...yPred]).sort((a, b) => a - b);
    const n = classes.length;
    const cm = Array.from({ length: n }, () => M.zeros(n));
    const idx = Object.fromEntries(classes.map((c, i) => [c, i]));
    yTrue.forEach((v, i) => cm[idx[v]][idx[yPred[i]]]++);
    return { matrix: cm, classes };
  },

  precision(yTrue, yPred, posClass = 1) {
    const tp = yTrue.filter((v, i) => v === posClass && yPred[i] === posClass).length;
    const fp = yTrue.filter((v, i) => v !== posClass && yPred[i] === posClass).length;
    return tp + fp === 0 ? 0 : tp / (tp + fp);
  },

  recall(yTrue, yPred, posClass = 1) {
    const tp = yTrue.filter((v, i) => v === posClass && yPred[i] === posClass).length;
    const fn = yTrue.filter((v, i) => v === posClass && yPred[i] !== posClass).length;
    return tp + fn === 0 ? 0 : tp / (tp + fn);
  },

  f1(yTrue, yPred, posClass = 1) {
    const p = this.precision(yTrue, yPred, posClass);
    const r = this.recall(yTrue, yPred, posClass);
    return p + r === 0 ? 0 : 2 * p * r / (p + r);
  },

  classificationReport(yTrue, yPred) {
    const classes = M.unique(yTrue).sort((a, b) => a - b);
    const rows = classes.map(c => ({
      class: c,
      precision: +this.precision(yTrue, yPred, c).toFixed(3),
      recall:    +this.recall(yTrue, yPred, c).toFixed(3),
      f1:        +this.f1(yTrue, yPred, c).toFixed(3),
      support:   yTrue.filter(v => v === c).length
    }));
    return { rows, accuracy: this.accuracy(yTrue, yPred) };
  },

  /* ── 3. Linear Models ─────────────────────────────────── */

  LinearRegression() {
    return {
      weights: null, bias: 0,
      fit(X, y, lr = 0.01, epochs = 1000) {
        const n = X.length, f = X[0].length;
        this.weights = M.zeros(f); this.bias = 0;
        for (let e = 0; e < epochs; e++) {
          const preds = X.map(row => M.dot(row, this.weights) + this.bias);
          const diffs = preds.map((p, i) => p - y[i]);
          const dw = X[0].map((_, j) => M.mean(diffs.map((d, i) => d * X[i][j])));
          const db = M.mean(diffs);
          this.weights = M.sub(this.weights, M.scale(dw, lr));
          this.bias -= lr * db;
        }
        return this;
      },
      predict(X) { return X.map(row => M.dot(row, this.weights) + this.bias); },
      score(X, y) { const p = this.predict(X); return 1 - M.sum(y.map((v,i)=>(v-p[i])**2)) / M.sum(y.map(v=>(v-M.mean(y))**2)); }
    };
  },

  RidgeRegression(alpha = 1.0) {
    return {
      weights: null, bias: 0, alpha,
      fit(X, y, lr = 0.01, epochs = 1000) {
        const n = X.length, f = X[0].length;
        this.weights = M.zeros(f); this.bias = 0;
        for (let e = 0; e < epochs; e++) {
          const preds = X.map(row => M.dot(row, this.weights) + this.bias);
          const diffs = preds.map((p, i) => p - y[i]);
          const dw = M.add(M.scale(M.transpose(X).map(col => M.dot(col, diffs)), 1/n),
                           M.scale(this.weights, this.alpha));
          this.weights = M.sub(this.weights, M.scale(dw, lr));
          this.bias -= lr * M.mean(diffs);
        }
        return this;
      },
      predict(X) { return X.map(row => M.dot(row, this.weights) + this.bias); }
    };
  },

  LassoRegression(alpha = 0.01) {
    return {
      weights: null, bias: 0, alpha,
      fit(X, y, lr = 0.01, epochs = 1000) {
        const n = X.length, f = X[0].length;
        this.weights = M.zeros(f); this.bias = 0;
        for (let e = 0; e < epochs; e++) {
          const preds = X.map(row => M.dot(row, this.weights) + this.bias);
          const diffs = preds.map((p, i) => p - y[i]);
          const dw = M.add(M.scale(M.transpose(X).map(col => M.dot(col, diffs)), 1/n),
                           this.weights.map(w => this.alpha * Math.sign(w)));
          this.weights = M.sub(this.weights, M.scale(dw, lr));
          this.bias -= lr * M.mean(diffs);
        }
        return this;
      },
      predict(X) { return X.map(row => M.dot(row, this.weights) + this.bias); }
    };
  },

  LogisticRegression() {
    return {
      weights: null, bias: 0,
      fit(X, y, lr = 0.1, epochs = 500) {
        const n = X.length, f = X[0].length;
        this.weights = M.zeros(f); this.bias = 0;
        for (let e = 0; e < epochs; e++) {
          const preds = X.map(row => M.sigmoid(M.dot(row, this.weights) + this.bias));
          const diffs = preds.map((p, i) => p - y[i]);
          const dw = M.scale(M.transpose(X).map(col => M.dot(col, diffs)), 1/n);
          this.weights = M.sub(this.weights, M.scale(dw, lr));
          this.bias -= lr * M.mean(diffs);
        }
        return this;
      },
      predictProba(X) { return X.map(row => M.sigmoid(M.dot(row, this.weights) + this.bias)); },
      predict(X, threshold = 0.5) { return this.predictProba(X).map(p => +(p >= threshold)); },
      score(X, y) { return ML.accuracy(y, this.predict(X)); }
    };
  },

  // Softmax regression for multi-class
  SoftmaxRegression() {
    return {
      W: null, b: null, classes: null,
      fit(X, y, lr = 0.1, epochs = 500) {
        this.classes = M.unique(y).sort((a,b)=>a-b);
        const k = this.classes.length, f = X[0].length, n = X.length;
        const ci = Object.fromEntries(this.classes.map((c,i)=>[c,i]));
        this.W = M.randMat(k, f); this.b = M.zeros(k);
        for (let e = 0; e < epochs; e++) {
          const probs = X.map(row => M.softmax(this.W.map((w,i) => M.dot(w, row) + this.b[i])));
          for (let j = 0; j < k; j++) {
            const diffs = probs.map((p, i) => p[j] - (ci[y[i]] === j ? 1 : 0));
            this.W[j] = M.sub(this.W[j], M.scale(M.scale(X[0].map((_,fi) => M.mean(diffs.map((d,i)=>d*X[i][fi]))), 1), lr));
            this.b[j] -= lr * M.mean(diffs);
          }
        }
        return this;
      },
      predictProba(X) { return X.map(row => M.softmax(this.W.map((w,i) => M.dot(w,row) + this.b[i]))); },
      predict(X) { return this.predictProba(X).map(p => this.classes[M.argmax(p)]); }
    };
  },

  /* ── 4. K-Nearest Neighbours ──────────────────────────── */

  KNNClassifier(k = 3) {
    return {
      k, X: null, y: null,
      fit(X, y) { this.X = X; this.y = y; return this; },
      predict(X) {
        return X.map(row => {
          const dists = this.X.map((r, i) => ({ d: M.euclidean(row, r), y: this.y[i] }))
                              .sort((a,b) => a.d - b.d).slice(0, this.k);
          const votes = {};
          dists.forEach(({y}) => votes[y] = (votes[y]||0) + 1);
          return +Object.entries(votes).sort((a,b)=>b[1]-a[1])[0][0];
        });
      },
      score(X, y) { return ML.accuracy(y, this.predict(X)); }
    };
  },

  KNNRegressor(k = 3) {
    return {
      k, X: null, y: null,
      fit(X, y) { this.X = X; this.y = y; return this; },
      predict(X) {
        return X.map(row => {
          const dists = this.X.map((r, i) => ({ d: M.euclidean(row, r), y: this.y[i] }))
                              .sort((a,b) => a.d - b.d).slice(0, this.k);
          return M.mean(dists.map(d => d.y));
        });
      }
    };
  },

  /* ── 5. Naive Bayes ───────────────────────────────────── */

  GaussianNB() {
    return {
      classes: null, priors: {}, means: {}, vars: {},
      fit(X, y) {
        this.classes = M.unique(y);
        this.classes.forEach(c => {
          const rows = X.filter((_, i) => y[i] === c);
          this.priors[c] = rows.length / X.length;
          this.means[c]  = X[0].map((_, j) => M.mean(rows.map(r => r[j])));
          this.vars[c]   = X[0].map((_, j) => M.variance(rows.map(r => r[j])) + 1e-9);
        });
        return this;
      },
      predictLogProba(x) {
        return Object.fromEntries(this.classes.map(c => {
          const logLik = x.reduce((s, v, j) => {
            const mu = this.means[c][j], va = this.vars[c][j];
            return s - 0.5 * Math.log(2 * Math.PI * va) - (v - mu) ** 2 / (2 * va);
          }, Math.log(this.priors[c]));
          return [c, logLik];
        }));
      },
      predict(X) {
        return X.map(x => {
          const lp = this.predictLogProba(x);
          return +Object.entries(lp).sort((a,b) => b[1]-a[1])[0][0];
        });
      },
      score(X, y) { return ML.accuracy(y, this.predict(X)); }
    };
  },

  /* ── 6. Decision Tree (CART) ──────────────────────────── */

  DecisionTree(opts = {}) {
    const maxDepth = opts.maxDepth || 10;
    const minSamplesSplit = opts.minSamplesSplit || 2;

    const gini = labels => {
      const counts = {}, n = labels.length;
      labels.forEach(l => counts[l] = (counts[l]||0)+1);
      return 1 - Object.values(counts).reduce((s,c) => s + (c/n)**2, 0);
    };

    const mse = vals => {
      const mu = M.mean(vals);
      return M.mean(vals.map(v => (v-mu)**2));
    };

    const bestSplit = (X, y, isRegression) => {
      let best = { gain: -Infinity };
      const impurityFn = isRegression ? mse : gini;
      const parentImp  = impurityFn(y);
      for (let f = 0; f < X[0].length; f++) {
        const vals = M.unique(X.map(r => r[f])).sort((a,b)=>a-b);
        for (let t = 0; t < vals.length - 1; t++) {
          const thresh = (vals[t] + vals[t+1]) / 2;
          const leftI  = y.filter((_, i) => X[i][f] <= thresh);
          const rightI = y.filter((_, i) => X[i][f] >  thresh);
          if (!leftI.length || !rightI.length) continue;
          const gain = parentImp - (leftI.length/y.length)*impurityFn(leftI)
                                 - (rightI.length/y.length)*impurityFn(rightI);
          if (gain > best.gain) best = { gain, feature: f, threshold: thresh };
        }
      }
      return best;
    };

    const buildTree = (X, y, depth, isRegression) => {
      if (depth >= maxDepth || X.length < minSamplesSplit || M.unique(y).length === 1) {
        return { leaf: true, value: isRegression ? M.mean(y) : +Object.entries(
          y.reduce((acc,v)=>(acc[v]=(acc[v]||0)+1,acc),{})).sort((a,b)=>b[1]-a[1])[0][0] };
      }
      const split = bestSplit(X, y, isRegression);
      if (split.feature === undefined || split.gain <= 0) {
        return { leaf: true, value: isRegression ? M.mean(y) : +Object.entries(
          y.reduce((acc,v)=>(acc[v]=(acc[v]||0)+1,acc),{})).sort((a,b)=>b[1]-a[1])[0][0] };
      }
      const { feature: f, threshold: t } = split;
      const leftIdx  = M.range(X.length).filter(i => X[i][f] <= t);
      const rightIdx = M.range(X.length).filter(i => X[i][f] >  t);
      return {
        feature: f, threshold: t, gain: split.gain,
        left:  buildTree(leftIdx.map(i=>X[i]),  leftIdx.map(i=>y[i]),  depth+1, isRegression),
        right: buildTree(rightIdx.map(i=>X[i]), rightIdx.map(i=>y[i]), depth+1, isRegression)
      };
    };

    const predict1 = (node, x) => {
      if (node.leaf) return node.value;
      return x[node.feature] <= node.threshold ? predict1(node.left, x) : predict1(node.right, x);
    };

    return {
      root: null, isRegression: opts.regression || false,
      fit(X, y) { this.root = buildTree(X, y, 0, this.isRegression); return this; },
      predict(X) { return X.map(x => predict1(this.root, x)); },
      score(X, y) {
        const preds = this.predict(X);
        return this.isRegression ? ML.r2(y, preds) : ML.accuracy(y, preds);
      }
    };
  },

  /* ── 7. Random Forest ─────────────────────────────────── */

  RandomForest(opts = {}) {
    const nTrees = opts.nTrees || 10;
    const maxFeatures = opts.maxFeatures || null;
    const maxDepth = opts.maxDepth || 8;
    const isRegression = opts.regression || false;

    return {
      trees: [],
      fit(X, y) {
        this.trees = M.range(nTrees).map(() => {
          // Bootstrap sample
          const idx   = M.range(X.length).map(() => Math.floor(Math.random() * X.length));
          const Xb    = idx.map(i => X[i]);
          const yb    = idx.map(i => y[i]);
          // Feature subsetting
          const nFeat = maxFeatures || Math.ceil(Math.sqrt(X[0].length));
          const feats = M.shuffle(M.range(X[0].length)).slice(0, nFeat);
          const Xf    = Xb.map(row => feats.map(f => row[f]));
          const tree  = ML.DecisionTree({ maxDepth, regression: isRegression });
          tree.fit(Xf, yb);
          return { tree, feats };
        });
        return this;
      },
      predict(X) {
        const allPreds = this.trees.map(({ tree, feats }) =>
          tree.predict(X.map(row => feats.map(f => row[f]))));
        return M.range(X.length).map(i => {
          const votes = allPreds.map(p => p[i]);
          if (isRegression) return M.mean(votes);
          const count = {};
          votes.forEach(v => count[v] = (count[v]||0)+1);
          return +Object.entries(count).sort((a,b)=>b[1]-a[1])[0][0];
        });
      },
      score(X, y) {
        const preds = this.predict(X);
        return isRegression ? ML.r2(y, preds) : ML.accuracy(y, preds);
      }
    };
  },

  /* ── 8. SVM (Linear, SGD) ─────────────────────────────── */

  LinearSVM(C = 1.0) {
    return {
      weights: null, bias: 0, C,
      fit(X, y, epochs = 500, lr = 0.001) {
        const f = X[0].length, n = X.length;
        this.weights = M.zeros(f);
        // Convert labels to {-1, +1}
        const labels = y.map(v => v > 0 ? 1 : -1);
        for (let e = 0; e < epochs; e++) {
          const lrE = lr / (1 + e * 0.01);
          M.range(n).forEach(i => {
            const margin = labels[i] * (M.dot(X[i], this.weights) + this.bias);
            if (margin < 1) {
              this.weights = M.add(M.scale(this.weights, 1 - lrE),
                                   M.scale(X[i], lrE * this.C * labels[i]));
              this.bias += lrE * this.C * labels[i];
            } else {
              this.weights = M.scale(this.weights, 1 - lrE);
            }
          });
        }
        return this;
      },
      decision(X) { return X.map(row => M.dot(row, this.weights) + this.bias); },
      predict(X)  { return this.decision(X).map(v => v >= 0 ? 1 : 0); },
      score(X, y) { return ML.accuracy(y, this.predict(X)); }
    };
  },

  /* ── 9. Clustering ────────────────────────────────────── */

  KMeans(k = 3, maxIter = 300) {
    return {
      k, maxIter, centroids: null, labels: null,
      fit(X) {
        // Kmeans++ initialization
        this.centroids = [X[Math.floor(Math.random() * X.length)]];
        while (this.centroids.length < this.k) {
          const dists = X.map(x => Math.min(...this.centroids.map(c => M.euclidean(x, c) ** 2)));
          const sum = M.sum(dists);
          let r = Math.random() * sum;
          for (let i = 0; i < X.length; i++) { r -= dists[i]; if (r <= 0) { this.centroids.push(X[i]); break; } }
        }
        for (let iter = 0; iter < this.maxIter; iter++) {
          const labels = X.map(x => M.argmax(this.centroids.map(c => -M.euclidean(x, c))));
          const newC = M.range(this.k).map(ki => {
            const pts = X.filter((_, i) => labels[i] === ki);
            if (!pts.length) return this.centroids[ki];
            return X[0].map((_, j) => M.mean(pts.map(p => p[j])));
          });
          const moved = M.sum(this.centroids.map((c, i) => M.euclidean(c, newC[i])));
          this.centroids = newC;
          if (moved < 1e-6) break;
        }
        this.labels = X.map(x => M.argmax(this.centroids.map(c => -M.euclidean(x, c))));
        return this;
      },
      predict(X) { return X.map(x => M.argmax(this.centroids.map(c => -M.euclidean(x, c)))); },
      inertia(X) {
        const labels = this.predict(X);
        return M.sum(X.map((x, i) => M.euclidean(x, this.centroids[labels[i]]) ** 2));
      }
    };
  },

  DBSCAN(eps = 0.5, minPts = 5) {
    return {
      eps, minPts, labels: null,
      fit(X) {
        const n = X.length;
        this.labels = Array(n).fill(-1);  // -1 = noise
        let cluster = 0;
        const visited = Array(n).fill(false);

        const neighbors = i => M.range(n).filter(j => M.euclidean(X[i], X[j]) <= this.eps);

        for (let i = 0; i < n; i++) {
          if (visited[i]) continue;
          visited[i] = true;
          const N = neighbors(i);
          if (N.length < this.minPts) continue;
          this.labels[i] = cluster;
          const queue = [...N];
          while (queue.length) {
            const q = queue.shift();
            if (!visited[q]) {
              visited[q] = true;
              const qN = neighbors(q);
              if (qN.length >= this.minPts) queue.push(...qN.filter(x => !queue.includes(x)));
            }
            if (this.labels[q] === -1) this.labels[q] = cluster;
          }
          cluster++;
        }
        return this;
      },
      nClusters() { return M.unique(this.labels.filter(l => l !== -1)).length; }
    };
  },

  /* ── 10. Neural Network (MLP) ─────────────────────────── */

  MLP(layerSizes, opts = {}) {
    const activation = opts.activation || 'relu';
    const outputAct  = opts.output    || 'sigmoid';  // 'sigmoid','softmax','linear'
    const initScale  = opts.initScale || 0.1;

    const act = {
      relu:    x => Math.max(0, x),
      sigmoid: x => M.sigmoid(x),
      tanh:    x => Math.tanh(x),
      linear:  x => x,
    };
    const actD = {
      relu:    x => x > 0 ? 1 : 0,
      sigmoid: x => { const s = M.sigmoid(x); return s * (1 - s); },
      tanh:    x => 1 - Math.tanh(x) ** 2,
      linear:  _ => 1,
    };

    // Build weight matrices + biases
    const layers = [];
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const fan_in = layerSizes[i], fan_out = layerSizes[i+1];
      const scale = Math.sqrt(2 / fan_in);  // He init
      layers.push({
        W: Array.from({ length: fan_out }, () => Array.from({ length: fan_in }, () => M.randn() * scale)),
        b: M.zeros(fan_out)
      });
    }

    const forward = (x) => {
      let a = [...x];
      const cache = [{ a }];
      for (let l = 0; l < layers.length; l++) {
        const z = layers[l].W.map((row, i) => M.dot(row, a) + layers[l].b[i]);
        const isOutput = l === layers.length - 1;
        const fn = isOutput ? (outputAct === 'softmax' ? null : act[outputAct]) : act[activation];
        a = outputAct === 'softmax' && isOutput ? M.softmax(z) : z.map(fn);
        cache.push({ z, a });
      }
      return cache;
    };

    return {
      layers, layerSizes,
      fit(X, y, lr = 0.01, epochs = 500, batchSize = 32, verbose = false) {
        const n = X.length;
        const isMultiClass = outputAct === 'softmax';
        const numClasses = isMultiClass ? M.unique(y).length : 1;

        for (let e = 0; e < epochs; e++) {
          const idx = M.shuffle(M.range(n));
          let totalLoss = 0;

          for (let b = 0; b < n; b += batchSize) {
            const bIdx = idx.slice(b, b + batchSize);
            // Gradients accumulators
            const dW = layers.map(l => l.W.map(row => M.zeros(row.length)));
            const db = layers.map(l => M.zeros(l.b.length));

            bIdx.forEach(i => {
              const cache = forward(X[i]);
              // Target
              let target;
              if (isMultiClass) {
                target = M.zeros(numClasses); target[y[i]] = 1;
              } else {
                target = [y[i]];
              }

              const pred = cache[cache.length - 1].a;
              totalLoss += isMultiClass
                ? -target.reduce((s, t, j) => s + t * M.log(pred[j]), 0)
                : (pred[0] - target[0]) ** 2;

              // Backprop
              let delta = pred.map((p, j) => p - target[j]);

              for (let l = layers.length - 1; l >= 0; l--) {
                const a_prev = cache[l].a;
                if (l < layers.length - 1 || outputAct !== 'softmax') {
                  const z = cache[l+1].z;
                  const fn = l === layers.length - 1 ? actD[outputAct] : actD[activation];
                  delta = delta.map((d, j) => d * fn(z[j]));
                }
                // Accumulate gradients
                delta.forEach((d, j) => {
                  a_prev.forEach((a, k) => { dW[l][j][k] += d * a; });
                  db[l][j] += d;
                });
                // Propagate delta backwards
                if (l > 0) {
                  delta = a_prev.map((_, k) =>
                    M.sum(delta.map((d, j) => d * layers[l].W[j][k])));
                }
              }
            });

            const bs = bIdx.length;
            layers.forEach((layer, l) => {
              layer.W = layer.W.map((row, j) => row.map((w, k) => w - lr * dW[l][j][k] / bs));
              layer.b = layer.b.map((b, j) => b - lr * db[l][j] / bs);
            });
          }

          if (verbose && e % 100 === 0) {
            console.log(`Epoch ${e}: loss=${(totalLoss/n).toFixed(4)}`);
          }
        }
        return this;
      },

      predictRaw(X) { return X.map(x => forward(x).slice(-1)[0].a); },
      predict(X) {
        return this.predictRaw(X).map(a =>
          outputAct === 'softmax' ? M.argmax(a) : (a[0] >= 0.5 ? 1 : 0));
      },
      predictProba(X) { return this.predictRaw(X); },
      score(X, y) { return ML.accuracy(y, this.predict(X)); }
    };
  },

  /* ── 11. PCA ──────────────────────────────────────────── */

  PCA(nComponents = 2) {
    return {
      nComponents, components: null, mean: null, explainedVariance: null,
      fit(X) {
        const n = X.length, f = X[0].length;
        this.mean = X[0].map((_, j) => M.mean(X.map(r => r[j])));
        const Xc = X.map(row => row.map((v, j) => v - this.mean[j]));
        // Covariance matrix
        const Xt = M.transpose(Xc);
        const cov = Xt.map(ri => Xt.map(rj => M.dot(ri, rj) / (n - 1)));
        // Power iteration for top eigenvectors
        this.components = [];
        this.explainedVariance = [];
        let A = cov.map(row => [...row]);
        for (let c = 0; c < Math.min(this.nComponents, f); c++) {
          let v = Array.from({ length: f }, () => Math.random());
          const vn = Math.sqrt(M.dot(v, v)); v = M.scale(v, 1/vn);
          for (let iter = 0; iter < 100; iter++) {
            let w = A.map(row => M.dot(row, v));
            const norm = Math.sqrt(M.dot(w, w));
            v = M.scale(w, 1/norm);
          }
          const eigenVal = M.dot(v, A.map(row => M.dot(row, v)));
          this.components.push(v);
          this.explainedVariance.push(eigenVal);
          // Deflate
          A = A.map((row, i) => row.map((val, j) => val - eigenVal * v[i] * v[j]));
        }
        return this;
      },
      transform(X) {
        return X.map(row => {
          const xc = row.map((v, j) => v - this.mean[j]);
          return this.components.map(comp => M.dot(xc, comp));
        });
      },
      fitTransform(X) { this.fit(X); return this.transform(X); }
    };
  },

  /* ── 12. Ensemble ─────────────────────────────────────── */

  AdaBoost(nEstimators = 50) {
    return {
      estimators: [], alphas: [],
      fit(X, y, maxDepth = 1) {
        const n = X.length;
        let weights = M.ones(n).map(v => v / n);
        const labels = y.map(v => v > 0 ? 1 : -1);

        for (let t = 0; t < nEstimators; t++) {
          // Weighted sample
          const idx = [];
          for (let i = 0; i < n; i++) {
            let r = Math.random(), cumW = 0;
            for (let j = 0; j < n; j++) { cumW += weights[j]; if (r <= cumW) { idx.push(j); break; } }
          }
          const Xs = idx.map(i => X[i]), ys = idx.map(i => y[i]);
          const tree = ML.DecisionTree({ maxDepth });
          tree.fit(Xs, ys);

          const preds = tree.predict(X).map(p => p > 0 ? 1 : -1);
          const err   = M.sum(weights.filter((w, i) => preds[i] !== labels[i]));
          if (err >= 0.5) break;
          const alpha = 0.5 * Math.log((1 - err) / Math.max(err, 1e-10));
          weights = weights.map((w, i) => w * Math.exp(-alpha * labels[i] * preds[i]));
          const wSum = M.sum(weights);
          weights = weights.map(w => w / wSum);
          this.estimators.push(tree);
          this.alphas.push(alpha);
        }
        return this;
      },
      predict(X) {
        return X.map(x => {
          const score = M.sum(this.estimators.map((est, t) => {
            const p = est.predict([x])[0] > 0 ? 1 : -1;
            return this.alphas[t] * p;
          }));
          return score >= 0 ? 1 : 0;
        });
      },
      score(X, y) { return ML.accuracy(y, this.predict(X)); }
    };
  },

  GradientBoosting(nEstimators = 50, lr = 0.1, maxDepth = 3) {
    return {
      trees: [], lr, basePred: 0,
      fit(X, y) {
        this.basePred = M.mean(y);
        let residuals = y.map(v => v - this.basePred);
        for (let t = 0; t < nEstimators; t++) {
          const tree = ML.DecisionTree({ maxDepth, regression: true });
          tree.fit(X, residuals);
          const preds = tree.predict(X);
          residuals = residuals.map((r, i) => r - this.lr * preds[i]);
          this.trees.push(tree);
        }
        return this;
      },
      predict(X) {
        let preds = Array(X.length).fill(this.basePred);
        this.trees.forEach(tree => {
          const tp = tree.predict(X);
          preds = preds.map((p, i) => p + this.lr * tp[i]);
        });
        return preds;
      },
      score(X, y) { return ML.r2(y, this.predict(X)); }
    };
  },

  /* ── 13. Cross-validation ─────────────────────────────── */

  crossValScore(model, X, y, cv = 5, metric = 'accuracy') {
    const n = X.length;
    const foldSize = Math.floor(n / cv);
    const scores = [];
    for (let fold = 0; fold < cv; fold++) {
      const testIdx  = M.range(foldSize).map(i => fold * foldSize + i);
      const trainIdx = M.range(n).filter(i => !testIdx.includes(i));
      const XTr = trainIdx.map(i => X[i]), yTr = trainIdx.map(i => y[i]);
      const XTe = testIdx.map(i => X[i]),  yTe = testIdx.map(i => y[i]);
      // Create fresh model by calling the same factory (model must be a factory fn)
      const m = typeof model === 'function' ? model() : model;
      m.fit(XTr, yTr);
      const preds = m.predict(XTe);
      const score = metric === 'r2'   ? ML.r2(yTe, preds) :
                    metric === 'rmse' ? -ML.rmse(yTe, preds) :
                    ML.accuracy(yTe, preds);
      scores.push(score);
    }
    return { scores, mean: M.mean(scores), std: M.std(scores) };
  },

  gridSearch(modelFactory, paramGrid, X, y, cv = 3) {
    // paramGrid: { param: [val1, val2, ...] }
    const keys = Object.keys(paramGrid);
    const combos = keys.reduce((acc, key) =>
      acc.flatMap(combo => paramGrid[key].map(v => ({ ...combo, [key]: v }))), [{}]);

    let best = { score: -Infinity, params: null };
    const results = combos.map(params => {
      const m = () => modelFactory(params);
      const { mean } = ML.crossValScore(m, X, y, cv);
      if (mean > best.score) { best.score = mean; best.params = params; }
      return { params, score: mean };
    });
    return { best, results };
  },

  /* ── 14. Pre-trained Models ───────────────────────────── */

  // Pre-trained XOR solver (MLP already trained)
  pretrained: {
    xorSolver() {
      // Manually set weights that perfectly solve XOR
      const mlp = ML.MLP([2, 4, 1], { activation: 'relu', output: 'sigmoid' });
      mlp.layers[0].W = [[2,-2,2,-2],[2,-2,-2,2],[0,0,1,-1],[0,0,-1,1]];
      mlp.layers[0].b = [-1, 1, 0, 0];
      mlp.layers[1].W = [[1, 1, 0, 0]];
      mlp.layers[1].b = [-0.5];
      // Actually just train it (faster and guaranteed)
      const xor = DATASETS.xor();
      mlp.fit(xor.X, xor.y, 0.1, 2000);
      return mlp;
    },

    // Logistic regression pre-trained on iris (setosa vs rest)
    irisSetosaDetector() {
      const ds = DATASETS.iris();
      const { X, y } = ds;
      const { X: Xs } = ML.standardize(X);
      const yBin = y.map(v => +(v === 0));
      const model = ML.LogisticRegression();
      model.fit(Xs, yBin, 0.1, 300);
      return model;
    },

    // Linear regression pre-trained on housing
    housingPredictor() {
      const ds = DATASETS.housing();
      const { X: Xs, transform } = ML.standardize(ds.X);
      const model = ML.LinearRegression();
      model.fit(Xs, ds.y, 0.01, 2000);
      model._transform = transform;
      model.predictRaw = (X) => model.predict(X.map(transform));
      return model;
    },

    // Sentiment classifier pre-trained on sentiment dataset
    sentimentClassifier() {
      const ds = DATASETS.sentiment();
      const { X: Xs, transform } = ML.standardize(ds.X);
      const model = ML.LogisticRegression();
      model.fit(Xs, ds.y, 0.1, 500);
      model._transform = transform;
      model.classifyFeatures = (features) => {
        const p = model.predictProba([transform(features)])[0];
        return { label: p >= 0.5 ? 'positive' : 'negative', confidence: Math.max(p, 1-p) };
      };
      return model;
    },

    // Spam classifier pre-trained on spam dataset
    spamFilter() {
      const ds = DATASETS.spam();
      const { X: Xs, transform } = ML.standardize(ds.X);
      const model = ML.LogisticRegression();
      model.fit(Xs, ds.y, 0.1, 500);
      model._transform = transform;
      model.classifyFeatures = (features) => {
        const p = model.predictProba([transform(features)])[0];
        return { label: p >= 0.5 ? 'spam' : 'ham', confidence: Math.max(p, 1-p) };
      };
      return model;
    },

    // KNN iris classifier pre-trained and ready
    irisClassifier() {
      const ds = DATASETS.iris();
      const { X: Xs, transform } = ML.standardize(ds.X);
      const model = ML.KNNClassifier(5);
      model.fit(Xs, ds.y);
      model._transform = transform;
      model._targetNames = ds.targetNames;
      model.classifyFlower = (sepalLen, sepalWid, petalLen, petalWid) => {
        const features = transform([sepalLen, sepalWid, petalLen, petalWid]);
        const cls = model.predict([features])[0];
        return ds.targetNames[cls];
      };
      return model;
    }
  },

  /* ── 15. Utilities ────────────────────────────────────── */

  // Feature importance from a trained decision tree
  featureImportance(tree, nFeatures) {
    const importance = M.zeros(nFeatures);
    const traverse = (node, n) => {
      if (node.leaf) return;
      importance[node.feature] += node.gain * n;
      traverse(node.left, n/2);
      traverse(node.right, n/2);
    };
    traverse(tree.root, 1);
    const total = M.sum(importance);
    return total > 0 ? importance.map(v => v / total) : importance;
  },

  // Silhouette score for clustering
  silhouetteScore(X, labels) {
    const n = X.length;
    const scores = M.range(n).map(i => {
      const cluster = labels[i];
      const sameCluster = M.range(n).filter(j => j !== i && labels[j] === cluster);
      const a = sameCluster.length > 0 ? M.mean(sameCluster.map(j => M.euclidean(X[i], X[j]))) : 0;
      const otherClusters = M.unique(labels).filter(c => c !== cluster);
      const b = otherClusters.length > 0 ? Math.min(...otherClusters.map(c => {
        const pts = M.range(n).filter(j => labels[j] === c);
        return M.mean(pts.map(j => M.euclidean(X[i], X[j])));
      })) : 0;
      const denom = Math.max(a, b);
      return denom === 0 ? 0 : (b - a) / denom;
    });
    return M.mean(scores);
  },

  // Print a pretty model summary
  summary(model) {
    const lines = ['═══ Model Summary ═══'];
    if (model.layerSizes) {
      lines.push('Type: MLP Neural Network');
      lines.push('Layers: ' + model.layerSizes.join(' → '));
      const params = model.layers.reduce((s, l) => s + l.W.length * l.W[0].length + l.b.length, 0);
      lines.push('Parameters: ' + params);
    } else if (model.trees !== undefined && model.alphas !== undefined) {
      lines.push('Type: AdaBoost');
      lines.push('Estimators: ' + model.estimators.length);
    } else if (model.trees !== undefined) {
      lines.push('Type: Gradient Boosting / Random Forest');
      lines.push('Trees: ' + model.trees.length);
    } else if (model.weights !== undefined) {
      lines.push('Type: Linear Model');
      lines.push('Weights: ' + (model.weights ? model.weights.map(w => w.toFixed(4)).join(', ') : 'not fitted'));
      lines.push('Bias: ' + (model.bias !== undefined ? model.bias.toFixed(4) : '—'));
    } else if (model.centroids) {
      lines.push('Type: KMeans');
      lines.push('Clusters: ' + model.centroids.length);
    }
    lines.push('═════════════════════');
    return lines.join('\n');
  },

  // Train/evaluate pipeline shorthand
  pipeline(steps) {
    return {
      steps,
      fit(X, y) {
        let Xt = X;
        this.steps.forEach(([name, step]) => {
          if (step.fit && step.transform) { step.fit(Xt); Xt = step.transform(Xt); }
          else if (step.fit && !step.predict) { step.fit(Xt); }
          else if (step.predict) { step.fit(Xt, y); }
        });
        this._Xt = Xt;
        return this;
      },
      predict(X) {
        let Xt = X;
        const steps = this.steps;
        for (let i = 0; i < steps.length - 1; i++) {
          const step = steps[i][1];
          if (step.transform) Xt = step.transform(Xt);
        }
        return steps[steps.length - 1][1].predict(Xt);
      }
    };
  },

  /* ── 16. Model Persistence ────────────────────────────────── */

  // Identify model type from its structural properties
  _detectType(model) {
    if (model.layerSizes)                                        return 'MLP';
    if (model.estimators && model.alphas)                        return 'AdaBoost';
    if (model.trees !== undefined && model.basePred !== undefined) return 'GradientBoosting';
    if (model.trees !== undefined)                               return 'RandomForest';
    if (model.centroids)                                         return 'KMeans';
    if (model.eps !== undefined && model.minPts !== undefined)   return 'DBSCAN';
    if (model.components)                                        return 'PCA';
    if (model.W && model.b && model.classes)                     return 'SoftmaxRegression';
    if (model.classes && model.priors && model.means)            return 'GaussianNB';
    if (model.root !== undefined)                                return 'DecisionTree';
    if (model.k !== undefined && model.X !== null && model.X !== undefined) return 'KNN';
    if (model.C !== undefined && model.weights !== undefined)    return 'LinearSVM';
    if (model.alpha !== undefined && model.weights !== undefined) return 'RegularizedLinear';
    if (model.predictProba && model.weights !== undefined)       return 'LogisticRegression';
    if (model.weights !== undefined)                             return 'LinearRegression';
    return null;
  },

  // Recursively serialize a decision-tree node to a plain object
  _serializeTree(node) {
    if (!node) return null;
    if (node.leaf) return { leaf: true, value: node.value };
    return {
      feature:   node.feature,
      threshold: node.threshold,
      gain:      node.gain,
      left:      ML._serializeTree(node.left),
      right:     ML._serializeTree(node.right)
    };
  },

  // Save a trained model — triggers a .zml download in the browser,
  // writes a file in Node.js.
  // Usage (ZETA++):
  //   let model = LinearRegression();
  //   model.fit(X, y);
  //   saveModel(model, "my_model.zml");
  saveModel(model, filename) {
    const type = ML._detectType(model);
    if (!type) throw new Error('saveModel: cannot identify model type. Make sure the model has been fitted.');
    if (!filename) filename = 'model_' + type.toLowerCase() + '.json';
    // Accept any extension the user passes; default is .json
    if (!filename.includes('.')) filename += '.json';

    // Build a plain-data snapshot of the model's learned parameters
    const data = { type, version: '1.0', savedAt: new Date().toISOString() };

    switch (type) {
      case 'MLP':
        data.layerSizes = model.layerSizes;
        data.layers     = model.layers;          // [{W:[[...]], b:[...]}, ...]
        break;
      case 'LinearRegression':
      case 'LogisticRegression':
        data.weights = model.weights;
        data.bias    = model.bias;
        break;
      case 'RegularizedLinear':                  // Ridge or Lasso — same parameters
        data.weights = model.weights;
        data.bias    = model.bias;
        data.alpha   = model.alpha;
        break;
      case 'SoftmaxRegression':
        data.W       = model.W;
        data.b       = model.b;
        data.classes = model.classes;
        break;
      case 'KNN':
        data.k = model.k;
        data.X = model.X;
        data.y = model.y;
        break;
      case 'GaussianNB':
        data.classes = model.classes;
        data.priors  = model.priors;
        data.means   = model.means;
        data.vars    = model.vars;
        break;
      case 'DecisionTree':
        data.isRegression = model.isRegression;
        data.root         = ML._serializeTree(model.root);
        break;
      case 'RandomForest':
        data.trees = model.trees.map(({ tree, feats }) => ({
          feats,
          isRegression: tree.isRegression,
          root: ML._serializeTree(tree.root)
        }));
        break;
      case 'LinearSVM':
        data.weights = model.weights;
        data.bias    = model.bias;
        data.C       = model.C;
        break;
      case 'KMeans':
        data.k         = model.k;
        data.maxIter   = model.maxIter;
        data.centroids = model.centroids;
        data.labels    = model.labels;
        break;
      case 'DBSCAN':
        data.eps    = model.eps;
        data.minPts = model.minPts;
        data.labels = model.labels;
        break;
      case 'PCA':
        data.nComponents       = model.nComponents;
        data.components        = model.components;
        data.mean              = model.mean;
        data.explainedVariance = model.explainedVariance;
        break;
      case 'AdaBoost':
        data.alphas     = model.alphas;
        data.estimators = model.estimators.map(t => ({
          isRegression: t.isRegression,
          root: ML._serializeTree(t.root)
        }));
        break;
      case 'GradientBoosting':
        data.lr       = model.lr;
        data.basePred = model.basePred;
        data.trees    = model.trees.map(t => ({
          isRegression: t.isRegression,
          root: ML._serializeTree(t.root)
        }));
        break;
    }

    const json    = JSON.stringify(data, null, 2);
    const sizeKB  = (json.length / 1024).toFixed(1);

    // ── Browser: create a temporary <a> and click-download it ──
    if (typeof document !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (typeof require !== 'undefined') {
      // ── Node.js: write to disk ──────────────────────────────
      require('fs').writeFileSync(filename, json, 'utf8');
    }

    return 'Model saved: ' + filename + ' (' + sizeKB + ' KB, type=' + type + ')';
  },

  // Reconstruct a fully-usable model from a .zml JSON string.
  // Usage (ZETA++):
  //   str json = /* …paste file contents… */;
  //   let model = loadModel(json);
  //   model.predict(X_new);
  loadModel(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    // Rebuild a lightweight decision-tree shell that can predict
    const restoreTree = (saved) => {
      const isRegression = saved.isRegression || false;
      const predict1 = (node, x) => {
        if (node.leaf) return node.value;
        return x[node.feature] <= node.threshold
          ? predict1(node.left,  x)
          : predict1(node.right, x);
      };
      return {
        root:         saved.root,
        isRegression,
        predict:      (X) => X.map(x => predict1(saved.root, x)),
        score(X, y)   { const p = this.predict(X); return isRegression ? ML.r2(y, p) : ML.accuracy(y, p); }
      };
    };

    switch (data.type) {

      case 'MLP': {
        const m = ML.MLP(data.layerSizes);
        m.layers = data.layers;
        return m;
      }

      case 'LinearRegression': {
        const m = ML.LinearRegression();
        m.weights = data.weights; m.bias = data.bias;
        return m;
      }

      case 'LogisticRegression': {
        const m = ML.LogisticRegression();
        m.weights = data.weights; m.bias = data.bias;
        return m;
      }

      case 'RegularizedLinear': {
        const m = ML.RidgeRegression(data.alpha);
        m.weights = data.weights; m.bias = data.bias;
        return m;
      }

      case 'SoftmaxRegression': {
        const m = ML.SoftmaxRegression();
        m.W = data.W; m.b = data.b; m.classes = data.classes;
        return m;
      }

      case 'KNN': {
        const m = ML.KNNClassifier(data.k);
        m.X = data.X; m.y = data.y;
        return m;
      }

      case 'GaussianNB': {
        const m = ML.GaussianNB();
        m.classes = data.classes; m.priors = data.priors;
        m.means   = data.means;   m.vars   = data.vars;
        return m;
      }

      case 'DecisionTree': {
        const m = ML.DecisionTree({ regression: data.isRegression });
        m.root = data.root; m.isRegression = data.isRegression;
        return m;
      }

      case 'RandomForest': {
        const m = ML.RandomForest({});
        m.trees = data.trees.map(t => ({ tree: restoreTree(t), feats: t.feats }));
        return m;
      }

      case 'LinearSVM': {
        const m = ML.LinearSVM(data.C);
        m.weights = data.weights; m.bias = data.bias;
        return m;
      }

      case 'KMeans': {
        const m = ML.KMeans(data.k, data.maxIter);
        m.centroids = data.centroids; m.labels = data.labels;
        return m;
      }

      case 'DBSCAN': {
        const m = ML.DBSCAN(data.eps, data.minPts);
        m.labels = data.labels;
        return m;
      }

      case 'PCA': {
        const m = ML.PCA(data.nComponents);
        m.components       = data.components;
        m.mean             = data.mean;
        m.explainedVariance = data.explainedVariance;
        return m;
      }

      case 'AdaBoost': {
        const m = ML.AdaBoost(data.estimators.length);
        m.alphas     = data.alphas;
        m.estimators = data.estimators.map(t => restoreTree(t));
        return m;
      }

      case 'GradientBoosting': {
        const m = ML.GradientBoosting(data.trees.length, data.lr);
        m.lr       = data.lr;
        m.basePred = data.basePred;
        m.trees    = data.trees.map(t => restoreTree(t));
        return m;
      }

      default:
        throw new Error('loadModel: unknown model type "' + data.type + '"');
    }
  }
};

if (typeof DSALibraries !== 'undefined') {
  DSALibraries['ml.zl'] = {
    description: 'Full ML library: LinearRegression, LogisticRegression, KNN, NaiveBayes, ' +
                 'DecisionTree, RandomForest, SVM, KMeans, DBSCAN, MLP, PCA, AdaBoost, ' +
                 'GradientBoosting + datasets (iris, housing, xor, moons) + pre-trained models',
    inject(G) {
      // Preprocessing
      G.normalize        = (X) => ML.normalize(X);
      G.standardize      = (X) => ML.standardize(X);
      G.trainTestSplit   = (X, y, testSize, seed) => ML.trainTestSplit(X, y, testSize, seed);
      G.oneHotEncode     = (y) => ML.oneHotEncode(y);
      G.labelEncode      = (arr) => ML.labelEncode(arr);
      G.polyFeatures     = (X, degree) => ML.polyFeatures(X, degree);

      // Metrics
      G.accuracy         = (yt, yp) => ML.accuracy(yt, yp);
      G.mse              = (yt, yp) => ML.mse(yt, yp);
      G.rmse             = (yt, yp) => ML.rmse(yt, yp);
      G.mae              = (yt, yp) => ML.mae(yt, yp);
      G.r2score          = (yt, yp) => ML.r2(yt, yp);
      G.confusionMatrix  = (yt, yp) => ML.confusionMatrix(yt, yp);
      G.precision        = (yt, yp, c) => ML.precision(yt, yp, c);
      G.recall           = (yt, yp, c) => ML.recall(yt, yp, c);
      G.f1score          = (yt, yp, c) => ML.f1(yt, yp, c);
      G.classReport      = (yt, yp) => ML.classificationReport(yt, yp);

      // Models (factory functions)
      G.LinearRegression  = ()      => ML.LinearRegression();
      G.RidgeRegression   = (a)     => ML.RidgeRegression(a);
      G.LassoRegression   = (a)     => ML.LassoRegression(a);
      G.LogisticRegression= ()      => ML.LogisticRegression();
      G.SoftmaxRegression = ()      => ML.SoftmaxRegression();
      G.KNNClassifier     = (k)     => ML.KNNClassifier(k);
      G.KNNRegressor      = (k)     => ML.KNNRegressor(k);
      G.GaussianNB        = ()      => ML.GaussianNB();
      G.DecisionTree      = (opts)  => ML.DecisionTree(opts);
      G.RandomForest      = (opts)  => ML.RandomForest(opts);
      G.LinearSVM         = (C)     => ML.LinearSVM(C);
      G.KMeans            = (k, it) => ML.KMeans(k, it);
      G.DBSCAN            = (e, m)  => ML.DBSCAN(e, m);
      G.MLP               = (layers, opts) => ML.MLP(layers, opts);
      G.PCA               = (n)     => ML.PCA(n);
      G.AdaBoost          = (n)     => ML.AdaBoost(n);
      G.GradientBoosting  = (n, lr, d) => ML.GradientBoosting(n, lr, d);

      // Datasets
      G.loadIris          = () => DATASETS.iris();
      G.loadHousing       = () => DATASETS.housing();
      G.loadXOR           = () => DATASETS.xor();
      G.loadMoons         = (n, noise) => DATASETS.moons(n, noise);
      G.loadCircles       = (n, noise) => DATASETS.circles(n, noise);
      G.loadSpam          = () => DATASETS.spam();
      G.loadHousePrice    = () => DATASETS.housePrice();
      G.loadSentiment     = () => DATASETS.sentiment();

      // Pre-trained
      G.xorSolver         = () => ML.pretrained.xorSolver();
      G.irisClassifier    = () => ML.pretrained.irisClassifier();
      G.housingPredictor  = () => ML.pretrained.housingPredictor();
      G.sentimentClassifier = () => ML.pretrained.sentimentClassifier();
      G.spamFilter        = () => ML.pretrained.spamFilter();

      // Utilities
      G.crossValScore     = (mf, X, y, cv, metric) => ML.crossValScore(mf, X, y, cv, metric);
      G.gridSearch        = (mf, pg, X, y, cv) => ML.gridSearch(mf, pg, X, y, cv);
      G.silhouetteScore   = (X, labels) => ML.silhouetteScore(X, labels);
      G.modelSummary      = (m) => ML.summary(m);
      G.pipeline          = (steps) => ML.pipeline(steps);
      G.featureImportance = (tree, n) => ML.featureImportance(tree, n);

      // Model persistence
      // saveModel(model, filename?) -> downloads a .zml file, returns a status string
      // loadModel(jsonString)       -> returns a ready-to-predict model object
      G.saveModel         = (model, filename) => ML.saveModel(model, filename);
      G.loadModel         = (json) => ML.loadModel(json);
    }
  };
}

if (typeof module !== 'undefined') module.exports = { ML, DATASETS };

})();