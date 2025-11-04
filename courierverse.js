const TERRAIN_CONFIG = [
  { id: "city", name: "City", baseTarget: 100 },
  { id: "town", name: "Town", baseTarget: 70 },
  { id: "village", name: "Village", baseTarget: 50 },
];

const RARITY_RULES = {
  common: {
    label: "Common",
    baseMin: [6, 10],
    spread: [3, 6],
    preferenceBonus: 0,
    weight: 0.45,
  },
  rare: {
    label: "Rare",
    baseMin: [9, 12],
    spread: [4, 7],
    preferenceBonus: 0,
    weight: 0.35,
  },
  legendary: {
    label: "Legendary",
    baseMin: [11, 14],
    spread: [5, 8],
    preferenceBonus: 6,
    weight: 0.2,
  },
};

const PLAYER_IDS = ["A", "B"];
const DEAL_ROUNDS = [3, 3, 4];
const COURIERS_PER_PLAYER = 10;

const state = {
  terrains: new Map(),
  couriers: new Map(),
  decks: { A: [], B: [] },
  dealPointer: { A: 0, B: 0 },
  roundIndex: 0,
};

const terrainTemplate = document.getElementById("terrain-template");
const courierTemplate = document.getElementById("courier-template");
const terrainGrid = document.getElementById("terrain-grid");
const benchA = document.getElementById("player-a-bench");
const benchB = document.getElementById("player-b-bench");
const resultButton = document.getElementById("result-button");
const resetButton = document.getElementById("reset-button");
const dealButton = document.getElementById("deal-button");
const resultsPanel = document.getElementById("results");

document.addEventListener("DOMContentLoaded", () => {
  setupControls();
  initGame();
});

function setupControls() {
  resultButton.addEventListener("click", calculateResults);
  resetButton.addEventListener("click", () => initGame(true));
  if (dealButton) {
    dealButton.addEventListener("click", dealNextRound);
  }
  setupBenchDropzone(benchA);
  setupBenchDropzone(benchB);
}

function initGame(isReset = false) {
  // Clear UI and state before rebuilding.
  terrainGrid.innerHTML = "";
  benchA.innerHTML = "";
  benchB.innerHTML = "";
  resultsPanel.innerHTML =
    '<div class="deal-log">Click "Deal Round" to reveal couriers for both players.</div>';

  state.terrains.clear();
  state.couriers.clear();
  state.decks = { A: [], B: [] };
  state.dealPointer = { A: 0, B: 0 };
  state.roundIndex = 0;

  buildTerrains();
  buildDeckForPlayer("A");
  buildDeckForPlayer("B");
  updateDealButton();
}

function buildTerrains() {
  TERRAIN_CONFIG.forEach((config) => {
    const fragment = terrainTemplate.content.cloneNode(true);
    const cardEl = fragment.querySelector(".terrain-card");
    const targetValue = generateTerrainTarget(config.baseTarget);

    cardEl.dataset.terrainId = config.id;
    cardEl.querySelector(".terrain-card__name").textContent = config.name;
    cardEl.querySelector(".terrain-card__target").textContent = `Target: ${targetValue}`;

    const laneATotalEl = cardEl.querySelector(".terrain-lane--A .terrain-lane__total");
    const laneBTotalEl = cardEl.querySelector(".terrain-lane--B .terrain-lane__total");
    const dropzoneA = cardEl.querySelector('.terrain-dropzone[data-player="A"]');
    const dropzoneB = cardEl.querySelector('.terrain-dropzone[data-player="B"]');

    setupDropzone(dropzoneA, config.id, "A");
    setupDropzone(dropzoneB, config.id, "B");

    state.terrains.set(config.id, {
      id: config.id,
      name: config.name,
      target: targetValue,
      cardEl,
      totals: { A: 0, B: 0 },
      totalEls: { A: laneATotalEl, B: laneBTotalEl },
    });

    terrainGrid.appendChild(fragment);
  });

}

function buildDeckForPlayer(playerId) {
  const deck = [];
  for (let i = 0; i < COURIERS_PER_PLAYER; i += 1) {
    const courier = createCourier(playerId);
    const cardEl = renderCourierCard(courier);
    state.couriers.set(courier.id, { ...courier, element: cardEl, assignment: null });
    deck.push(courier.id);
  }
  state.decks[playerId] = deck;
}

function createCourier(playerId) {
  const rarityKey = rollRarity();
  const rarity = RARITY_RULES[rarityKey];
  const min = randomInt(rarity.baseMin[0], rarity.baseMin[1]);
  const max = min + randomInt(rarity.spread[0], rarity.spread[1]);
  const preference = rarityKey === "legendary" ? pickRandomTerrain() : null;
  const preferenceBonus = rarityKey === "legendary" ? rarity.preferenceBonus : 0;

  return {
    id: `${playerId}-${Math.random().toString(36).slice(2, 8)}`,
    player: playerId,
    rarityKey,
    rarityLabel: rarity.label,
    minRange: min,
    maxRange: max,
    preference,
    preferenceBonus,
  };
}

function renderCourierCard(courier) {
  const fragment = courierTemplate.content.cloneNode(true);
  const cardEl = fragment.querySelector(".courier-card");
  const badgeEl = fragment.querySelector(".courier-card__badge");
  const rarityEl = fragment.querySelector(".courier-card__rarity");
  const valueEl = fragment.querySelector(".courier-card__value");
  const rangeEl = fragment.querySelector(".courier-card__range");
  const prefEl = fragment.querySelector(".courier-card__preference");
  const deliveryEl = fragment.querySelector(".courier-card__delivery");

  cardEl.dataset.id = courier.id;
  cardEl.dataset.player = courier.player;
  cardEl.dataset.rarity = courier.rarityKey;

  badgeEl.textContent = courier.rarityLabel;
  rarityEl.textContent = `Rarity: ${courier.rarityLabel}`;
  valueEl.textContent = "--";
  rangeEl.textContent = `Delivery Range: ${courier.minRange} – ${courier.maxRange}`;
  if (courier.preference) {
    prefEl.textContent = `Prefers ${courier.preference} (+${courier.preferenceBonus})`;
    prefEl.style.display = "block";
  } else {
    prefEl.textContent = "";
    prefEl.style.display = "none";
  }
  deliveryEl.textContent = "Awaiting assignment";

  cardEl.draggable = true;
  cardEl.addEventListener("dragstart", onCourierDragStart);
  cardEl.addEventListener("dragend", onCourierDragEnd);

  return cardEl;
}

function dealNextRound() {
  if (state.roundIndex >= DEAL_ROUNDS.length) {
    resultsPanel.innerHTML =
      '<span class="winner-flag">All couriers already deployed.</span>';
    return;
  }

  const roundNumber = state.roundIndex + 1;
  const cardsThisRound = DEAL_ROUNDS[state.roundIndex];

  PLAYER_IDS.forEach((playerId) => {
    const benchEl = playerId === "A" ? benchA : benchB;
    const deck = state.decks[playerId];
    const start = state.dealPointer[playerId];
    const end = Math.min(start + cardsThisRound, deck.length);
    const cardIds = deck.slice(start, end);

    cardIds.forEach((cardId) => {
      const courier = state.couriers.get(cardId);
      if (!courier) return;
      benchEl.appendChild(courier.element);
    });

    state.dealPointer[playerId] = end;
  });

  state.roundIndex += 1;
  updateDealButton();
  resultsPanel.innerHTML = `<div class="deal-log">Round ${roundNumber}: ${cardsThisRound} couriers deployed for each player.</div>`;
}

function updateDealButton() {
  if (!dealButton) return;

  if (state.roundIndex >= DEAL_ROUNDS.length) {
    dealButton.textContent = "All rounds dealt";
    dealButton.disabled = true;
    return;
  }

  const nextRound = state.roundIndex + 1;
  const cards = DEAL_ROUNDS[state.roundIndex];
  dealButton.textContent = `Deal Round ${nextRound} (${cards} cards)`;
  dealButton.disabled = false;
}

function setupDropzone(dropzone, terrainId, playerId) {
  dropzone.dataset.terrainId = terrainId;
  dropzone.dataset.player = playerId;
  dropzone.addEventListener("dragover", onDropzoneDragOver);
  dropzone.addEventListener("dragenter", onDropzoneDragEnter);
  dropzone.addEventListener("dragleave", onDropzoneDragLeave);
  dropzone.addEventListener("drop", onDropzoneDrop);
}

function setupBenchDropzone(benchEl) {
  benchEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  benchEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const cardId = event.dataTransfer.getData("courier-id");
    if (!cardId) return;

    const courier = state.couriers.get(cardId);
    if (!courier || courier.player !== benchEl.dataset.player) return;

    benchEl.appendChild(courier.element);
    courier.assignment = null;
    updateCourierDisplay(courier, { value: null, baseRoll: null, bonus: null });
    updateTotals();
  });
}

function onCourierDragStart(event) {
  const cardEl = event.currentTarget;
  const cardId = cardEl.dataset.id;
  const courier = state.couriers.get(cardId);
  if (!courier) return;

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("courier-id", cardId);
  cardEl.classList.add("is-dragging");
}

function onCourierDragEnd(event) {
  event.currentTarget.classList.remove("is-dragging");
}

function onDropzoneDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function onDropzoneDragEnter(event) {
  event.currentTarget.classList.add("is-hovered");
}

function onDropzoneDragLeave(event) {
  event.currentTarget.classList.remove("is-hovered");
}

function onDropzoneDrop(event) {
  event.preventDefault();
  const dropzone = event.currentTarget;
  dropzone.classList.remove("is-hovered");

  const cardId = event.dataTransfer.getData("courier-id");
  if (!cardId) return;

  const courier = state.couriers.get(cardId);
  if (!courier || courier.player !== dropzone.dataset.player) return;

  assignCourierToTerrain(courier, dropzone);
}

function assignCourierToTerrain(courier, dropzone) {
  const terrainId = dropzone.dataset.terrainId;
  const terrain = state.terrains.get(terrainId);
  if (!terrain) return;

  dropzone.appendChild(courier.element);

  const baseRoll = randomInt(courier.minRange, courier.maxRange);
  const bonus = courier.preference === terrain.name ? courier.preferenceBonus : 0;
  const totalValue = baseRoll + bonus;

  courier.assignment = {
    terrainId,
    player: dropzone.dataset.player,
    value: totalValue,
    baseRoll,
    bonus,
  };

  updateCourierDisplay(courier, { value: totalValue, baseRoll, bonus });
  updateTotals();
}

function updateCourierDisplay(courier, { value, baseRoll, bonus }) {
  const cardEl = courier.element;
  if (!cardEl) return;

  const valueEl = cardEl.querySelector(".courier-card__value");
  const deliveryEl = cardEl.querySelector(".courier-card__delivery");

  if (value === null) {
    valueEl.textContent = "--";
    deliveryEl.textContent = "Awaiting assignment";
    return;
  }

  valueEl.textContent = `${value}`;
  if (bonus) {
    deliveryEl.textContent = `Delivered ${value} (roll ${baseRoll} + bonus ${bonus})`;
  } else {
    deliveryEl.textContent = `Delivered ${value} (roll ${baseRoll})`;
  }
}

function updateTotals() {
  // Reset totals before recomputing.
  state.terrains.forEach((terrain) => {
    terrain.totals.A = 0;
    terrain.totals.B = 0;
    terrain.cardEl.dataset.winner = "";
  });

  state.couriers.forEach((courier) => {
    if (!courier.assignment) return;
    const terrain = state.terrains.get(courier.assignment.terrainId);
    if (!terrain) return;
    terrain.totals[courier.assignment.player] += courier.assignment.value;
  });

  state.terrains.forEach((terrain) => {
    terrain.totalEls.A.textContent = terrain.totals.A.toString();
    terrain.totalEls.B.textContent = terrain.totals.B.toString();
  });
}

function calculateResults() {
  let winsA = 0;
  let winsB = 0;
  let output = "";

  state.terrains.forEach((terrain) => {
    const totalA = terrain.totals.A;
    const totalB = terrain.totals.B;
    const diffA = Math.abs(totalA - terrain.target);
    const diffB = Math.abs(totalB - terrain.target);

    let winner = "Tie";
    if (diffA < diffB) {
      winner = "Player A";
      winsA += 1;
      terrain.cardEl.dataset.winner = "A";
    } else if (diffB < diffA) {
      winner = "Player B";
      winsB += 1;
      terrain.cardEl.dataset.winner = "B";
    } else {
      terrain.cardEl.dataset.winner = "Tie";
    }

    output += `<div>${terrain.name}: A ${totalA} vs B ${totalB} → <strong>${winner}</strong></div>`;
  });

  let finalMessage = "Draw!";
  if (winsA >= 2) {
    finalMessage = "🏆 Player A conquers CourierVerse!";
  } else if (winsB >= 2) {
    finalMessage = "🏆 Player B conquers CourierVerse!";
  }

  resultsPanel.innerHTML = `${output}<br><span class="winner-flag">${finalMessage}</span>`;
}

function generateTerrainTarget(base) {
  return base + randomInt(-10, 10);
}

function rollRarity() {
  const roll = Math.random();
  let cumulative = 0;
  for (const [key, rule] of Object.entries(RARITY_RULES)) {
    cumulative += rule.weight;
    if (roll <= cumulative) return key;
  }
  return "common";
}

function pickRandomTerrain() {
  return TERRAIN_CONFIG[randomInt(0, TERRAIN_CONFIG.length - 1)].name;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
