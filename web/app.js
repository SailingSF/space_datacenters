import {
  computeScenario,
  formatCurrency,
  validateInputs
} from "./model.js";

const state = {
  defaults: null,
  reference: null,
  controls: null,
  renderTimer: null,
  betaAngles: [],
  betaCustomShares: {},
  constellationPhase: 0,
  constellationSpeedRps: 0.35,
  constellationAnimating: false,
  constellationFrameHandle: null,
  constellationLastTickMs: null,
  constellationStarfield: null,
  constellationAnimationModel: null,
  constellationCanvas: null
};

const EARTH_RADIUS_KM = 6371;

const els = {
  form: document.getElementById("controls-form"),
  betaPreset: document.getElementById("beta-preset"),
  betaPresetButtons: document.getElementById("beta-preset-buttons"),
  betaPresetDescription: document.getElementById("beta-preset-description"),
  betaMixVisual: document.getElementById("beta-mix-visual"),
  betaMixSummary: document.getElementById("beta-mix-summary"),
  betaWeightedSunlight: document.getElementById("beta-weighted-sunlight"),
  betaCustomSliders: document.getElementById("beta-custom-sliders"),
  betaResetButton: document.getElementById("beta-reset-button"),
  datacenterMw: document.getElementById("datacenter-mw"),
  datacenterMwValue: document.getElementById("datacenter-mw-value"),
  altitudeKm: document.getElementById("altitude-km"),
  altitudeKmValue: document.getElementById("altitude-km-value"),
  gpuTemp: document.getElementById("gpu-temp-c"),
  gpuTempValue: document.getElementById("gpu-temp-c-value"),
  transportDeltaT: document.getElementById("transport-delta-t-c"),
  transportDeltaTValue: document.getElementById("transport-delta-t-c-value"),
  overheadFrac: document.getElementById("overhead-frac"),
  overheadFracValue: document.getElementById("overhead-frac-value"),
  launchPreset: document.getElementById("launch-preset"),
  launchBaseCost: document.getElementById("launch-base-cost-per-kg"),
  launchBaseCostValue: document.getElementById("launch-base-cost-per-kg-value"),
  ispTransfer: document.getElementById("isp-transfer-s"),
  ispTransferValue: document.getElementById("isp-transfer-s-value"),
  propulsionStructFrac: document.getElementById("propulsion-struct-frac"),
  propulsionStructFracValue: document.getElementById("propulsion-struct-frac-value"),
  launchBaselineAltValue: document.getElementById("launch-baseline-altitude-value"),
  launchPresetSource: document.getElementById("launch-preset-source"),
  arraySpecificPower: document.getElementById("array-specific-power-w-per-kg"),
  arraySpecificPowerValue: document.getElementById("array-specific-power-w-per-kg-value"),
  epsilon: document.getElementById("epsilon"),
  epsilonValue: document.getElementById("epsilon-value"),
  radiatorArealDensity: document.getElementById("radiator-areal-density"),
  radiatorArealDensityValue: document.getElementById("radiator-areal-density-value"),
  parameterAnchorCards: document.getElementById("parameter-anchor-cards"),
  kpiSpacePremium: document.getElementById("kpi-space-premium"),
  kpiFleetCapex: document.getElementById("kpi-fleet-capex"),
  kpiGpuCost: document.getElementById("kpi-gpu-cost"),
  kpiLaunchCost: document.getElementById("kpi-launch-cost"),
  kpiSatMass: document.getElementById("kpi-sat-mass"),
  kpiSatellites: document.getElementById("kpi-satellites"),
  chartCostSplit: document.getElementById("chart-cost-split"),
  chartPremiumVsMw: document.getElementById("chart-premium-vs-mw"),
  chartSpaceComponents: document.getElementById("chart-space-components"),
  chartSpaceComponentsNote: document.getElementById("chart-space-components-note"),
  chartLaunchBreakdown: document.getElementById("chart-launch-breakdown"),
  chartLaunchBreakdownNote: document.getElementById("chart-launch-breakdown-note"),
  chartConstellation: document.getElementById("chart-constellation"),
  chartConstellationNote: document.getElementById("chart-constellation-note"),
  constellationPlayToggle: document.getElementById("constellation-play-toggle"),
  constellationSpeed: document.getElementById("constellation-speed"),
  constellationSpeedValue: document.getElementById("constellation-speed-value"),
  constellationFamilyCards: document.getElementById("constellation-family-cards"),
  referenceMeta: document.getElementById("reference-meta"),
  referenceInputs: document.getElementById("reference-inputs"),
  referenceOutputs: document.getElementById("reference-outputs"),
  referenceDiff: document.getElementById("reference-diff")
};

const BETA_COLOR_SCALE = {
  0: "#ec4f95",
  30: "#c85bf0",
  60: "#8d6be8",
  90: "#5f65d9"
};

const THEME_COLORS = {
  fallback: "#7f74a3",
  chartText: "#2d1f47",
  chartGrid: "#e8dcf3",
  chartZero: "#ccb7e1",
  gpu: "#6e57d8",
  premium: "#ea4d9b",
  line: "#b054e0",
  waterfallIncrease: "#c75df1",
  waterfallTotal: "#6e57d8",
  connector: "rgba(93, 76, 128, 0.35)",
  launchSegments: {
    compute: "#6e57d8",
    arrays: "#d057cb",
    radiators: "#f28cb9",
    bus: "#8f72dd"
  },
  legendBg: "rgba(255, 250, 255, 0.72)",
  annotation: "#6a5e83",
  starfield: "#f4e9ff",
  earthScale: [
    [0, "#2d2b69"],
    [0.52, "#5a4da4"],
    [1, "#7f69d6"]
  ],
  atmosphere: "#a99cf8",
  sunlight: "#ffc77a",
  sunlightText: "#925100"
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed loading ${path}: ${response.status}`);
  }
  return response.json();
}

function compactMoney(value, decimals = 2) {
  return formatCurrency(value, { compact: true, decimals });
}

function niceStep(rawStep) {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return 1 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildDollarAxis(maxValue) {
  const ceiling = Math.max(1, maxValue);
  const step = niceStep(ceiling / 5);
  const top = Math.ceil(ceiling / step) * step;
  const tickvals = [];
  const ticktext = [];

  for (let v = 0; v <= top + step * 0.001; v += step) {
    tickvals.push(v);
    ticktext.push(v === 0 ? "$0" : compactMoney(v, v >= 1e10 ? 1 : 2));
  }

  return { tickvals, ticktext, top };
}

function applyRangeConfig(inputEl, valueEl, config, formatter) {
  inputEl.min = config.min;
  inputEl.max = config.max;
  inputEl.step = config.step;
  inputEl.value = config.default;
  valueEl.textContent = formatter(config.default);
}

function applyParameterTooltips(defaults) {
  const ranges = defaults.ranges;
  const betaDefaultKey = ranges.beta_preset.default;
  const betaDefaultLabel = defaults.beta_mix_presets[betaDefaultKey]?.label || betaDefaultKey;
  const activeLaunchPreset = defaults.launch_cost_presets[els.launchPreset.value];
  const launchDefaultKey = ranges.launch_preset.default;
  const launchDefaultLabel = defaults.launch_cost_presets[launchDefaultKey]?.label || launchDefaultKey;

  const tooltips = {
    datacenter_mw:
      `How much terrestrial datacenter power you want space infrastructure to replace. ` +
      `Larger values scale satellites and total cost. Good default: ${ranges.datacenter_mw.default} MW.`,
    altitude_km:
      `Target orbital altitude for the constellation. Higher altitude can shift launch cost and fleet sizing. ` +
      `Good default: ${ranges.altitude_km.default} km.`,
    gpu_temp_c:
      `Estimated operating temperature of the GPU heat source. This affects radiator performance and mass. ` +
      `Good default: ${ranges.gpu_temp_c.default} °C.`,
    transport_delta_t_c:
      `Temperature drop budget between the GPU source and the radiator surface. ` +
      `Higher values make radiator rejection easier in this simplified model. ` +
      `Good default: ${ranges.transport_delta_t_c.default} °C.`,
    overhead_frac:
      `Extra non-compute electrical load fraction (power conversion, pumping, controls, and support systems). ` +
      `Good default: ${(ranges.overhead_frac.default * 100).toFixed(0)}%.`,
    launch_preset:
      `Select a notebook-anchored launch package. It sets the baseline $/kg to 550 km plus the transfer Isp and propulsion dry-mass assumptions used to compute altitude penalties. ` +
      `Good default: ${launchDefaultLabel}.`,
    launch_base_cost_per_kg:
      `Launch price per kg to the preset baseline altitude before the notebook's Hohmann-transfer mass multiplier is applied. ` +
      `Good default: use the active preset value (${formatCurrency(activeLaunchPreset.base_cost_per_kg, { compact: false })} / kg).`,
    isp_transfer_s:
      `Specific impulse for the altitude-raising kick stage or tug equivalent. Higher Isp lowers the mass multiplier for higher orbits. ` +
      `Good default: ${activeLaunchPreset.isp_s.toFixed(0)} s.`,
    propulsion_struct_frac:
      `Kick-stage dry mass as a fraction of propellant mass. Higher values make altitude changes more expensive because more dry hardware must also be launched. ` +
      `Good default: ${(activeLaunchPreset.propulsion_struct_frac * 100).toFixed(0)}%.`,
    array_specific_power_w_per_kg:
      `Solar array watts delivered per kg of array mass. Higher values reduce array mass and therefore reduce launch cost too. ` +
      `Good default: ${ranges.array_specific_power_w_per_kg.default} W/kg.`,
    epsilon:
      `Radiator emissivity. Higher emissivity improves heat rejection per square meter, which reduces radiator area and mass. ` +
      `Good default: ${ranges.epsilon.default.toFixed(2)}.`,
    radiator_areal_density_kg_per_m2:
      `Radiator mass per square meter. Higher values make the same radiator area heavier and increase both satellite mass and launch spend. ` +
      `Good default: ${ranges.radiator_areal_density_kg_per_m2.default.toFixed(1)} kg/m².`,
    beta_preset:
      `Distribution of orbital beta angles used to estimate sunlight availability across the constellation. ` +
      `Lower beta angles generally include more eclipse time, while higher beta angles tend to have longer sunlit windows. ` +
      `Good default: ${betaDefaultLabel}.`
  };

  document.querySelectorAll(".tooltip-trigger").forEach((trigger) => {
    const message = tooltips[trigger.dataset.tooltipKey];
    if (message) {
      trigger.dataset.tooltip = message;
      trigger.setAttribute("title", message);
    }
  });
}

function renderParameterAnchorCards(defaults) {
  els.parameterAnchorCards.innerHTML = (defaults.parameter_reference_cards || [])
    .map((card) => `
      <article class="parameter-anchor-card">
        <p class="parameter-anchor-title">${card.title}</p>
        <strong>${card.value}</strong>
        <p>${card.detail}</p>
      </article>
    `)
    .join("");
}

function collectBetaAngles(defaults) {
  const angleSet = new Set();
  Object.values(defaults.beta_mix_presets).forEach((preset) => {
    preset.mix.forEach(([betaDeg]) => {
      angleSet.add(Number(betaDeg));
    });
  });
  return Array.from(angleSet).sort((a, b) => a - b);
}

function normalizeShares(shares) {
  const total = state.betaAngles.reduce((sum, angle) => sum + Math.max(0, Number(shares[angle] || 0)), 0);
  const safeTotal = total > 0 ? total : 1;
  return state.betaAngles.map((angle) => [angle, Math.max(0, Number(shares[angle] || 0)) / safeTotal]);
}

function setCustomSharesFromMix(mix) {
  const next = {};
  mix.forEach(([angle, weight]) => {
    next[Number(angle)] = Number(weight) * 100;
  });

  state.betaAngles.forEach((angle) => {
    if (typeof next[angle] !== "number") {
      next[angle] = 0;
    }
  });

  state.betaCustomShares = next;
}

function getPresetOrDefaultMix(presetKey) {
  const preset = state.defaults.beta_mix_presets[presetKey];
  if (preset) {
    return preset.mix;
  }
  return state.defaults.beta_mix_presets[state.defaults.ranges.beta_preset.default].mix;
}

function rebalanceCustomShares(changedAngle, nextValuePercent) {
  const roundedValue = Math.min(100, Math.max(0, Number(nextValuePercent)));
  const otherAngles = state.betaAngles.filter((angle) => angle !== changedAngle);
  const current = { ...state.betaCustomShares, [changedAngle]: roundedValue };
  const otherTotal = otherAngles.reduce((sum, angle) => sum + Math.max(0, current[angle]), 0);
  const remaining = Math.max(0, 100 - roundedValue);

  if (otherAngles.length === 0) {
    state.betaCustomShares = { [changedAngle]: 100 };
    return;
  }

  if (otherTotal <= 0) {
    const evenShare = remaining / otherAngles.length;
    otherAngles.forEach((angle) => {
      current[angle] = evenShare;
    });
  } else {
    otherAngles.forEach((angle) => {
      current[angle] = (Math.max(0, current[angle]) / otherTotal) * remaining;
    });
  }

  state.betaCustomShares = current;
}

function updateBetaSliderUi() {
  state.betaAngles.forEach((angle) => {
    const row = els.betaCustomSliders.querySelector(`[data-beta-row="${angle}"]`);
    if (!row) return;
    const input = row.querySelector("input");
    const output = row.querySelector("output");
    const value = state.betaCustomShares[angle] ?? 0;
    input.value = value.toFixed(1);
    output.textContent = `${value.toFixed(1)}%`;
  });
}

function getActiveBetaMix() {
  const preset = state.defaults.beta_mix_presets[els.betaPreset.value];
  if (preset) {
    return preset.mix;
  }
  return normalizeShares(state.betaCustomShares);
}

function renderBetaMixEditor(result = null) {
  const isCustom = els.betaPreset.value === "__custom__";
  const activeMix = getActiveBetaMix();
  const customMix = normalizeShares(state.betaCustomShares);
  const preset = state.defaults.beta_mix_presets[els.betaPreset.value];

  els.betaPresetDescription.textContent = preset
    ? `${preset.description || "Preset beta-angle distribution for constellation sunlight modeling."}`
    : "Custom mix mode: adjust shares below; sliders always sum to 100%.";

  els.betaPresetButtons.querySelectorAll("button").forEach((button) => {
    const isActive = !isCustom && button.dataset.presetKey === els.betaPreset.value;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  const mixForUi = isCustom ? customMix : activeMix;
  const segmentsHtml = mixForUi
    .map(([angle, weight]) => {
      const color = BETA_COLOR_SCALE[angle] || THEME_COLORS.fallback;
      return `<span class="beta-mix-segment" style="width:${(weight * 100).toFixed(2)}%;background:${color}" title="${angle}° beta: ${(weight * 100).toFixed(1)}%"></span>`;
    })
    .join("");
  els.betaMixVisual.innerHTML = segmentsHtml;

  els.betaMixSummary.textContent =
    mixForUi.map(([angle, weight]) => `${angle}°: ${(weight * 100).toFixed(1)}%`).join(" | ");

  if (result) {
    els.betaWeightedSunlight.textContent = `Current weighted sunlight fraction from this mix: ${result.sunlight_fraction_weighted.toFixed(4)}.`;
  }

  updateBetaSliderUi();
}

function configureBetaEditor(defaults) {
  state.betaAngles = collectBetaAngles(defaults);
  setCustomSharesFromMix(getPresetOrDefaultMix(defaults.ranges.beta_preset.default));

  els.betaPresetButtons.innerHTML = "";
  Object.entries(defaults.beta_mix_presets).forEach(([key, preset]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "beta-preset-chip";
    button.dataset.presetKey = key;
    button.textContent = preset.label;
    button.addEventListener("click", () => {
      els.betaPreset.value = key;
      setCustomSharesFromMix(preset.mix);
      renderBetaMixEditor();
      scheduleRender();
    });
    els.betaPresetButtons.appendChild(button);
  });

  els.betaCustomSliders.innerHTML = "";
  state.betaAngles.forEach((angle) => {
    const row = document.createElement("div");
    row.className = "beta-slider-row";
    row.dataset.betaRow = String(angle);
    row.innerHTML = `
      <label>
        <span class="beta-slider-label"><span class="beta-dot" style="background:${BETA_COLOR_SCALE[angle] || THEME_COLORS.fallback}"></span>${angle}° beta share</span>
        <output>0.0%</output>
      </label>
      <input type="range" min="0" max="100" step="0.1" data-beta-angle="${angle}" />
    `;
    els.betaCustomSliders.appendChild(row);
  });

  renderBetaMixEditor();
}

function updateValueLabels() {
  els.datacenterMwValue.textContent = `${Number(els.datacenterMw.value).toFixed(0)} MW`;
  els.altitudeKmValue.textContent = `${Number(els.altitudeKm.value).toFixed(0)} km`;
  els.gpuTempValue.textContent = `${Number(els.gpuTemp.value).toFixed(0)} °C`;
  els.transportDeltaTValue.textContent = `${Number(els.transportDeltaT.value).toFixed(0)} °C`;
  els.overheadFracValue.textContent = `${(Number(els.overheadFrac.value) * 100).toFixed(1)}%`;
  els.launchBaseCostValue.textContent = `${formatCurrency(Number(els.launchBaseCost.value), { compact: false })} / kg`;
  els.ispTransferValue.textContent = `${Number(els.ispTransfer.value).toFixed(0)} s`;
  els.propulsionStructFracValue.textContent = `${(Number(els.propulsionStructFrac.value) * 100).toFixed(1)}%`;
  els.arraySpecificPowerValue.textContent = `${Number(els.arraySpecificPower.value).toFixed(0)} W/kg`;
  els.epsilonValue.textContent = Number(els.epsilon.value).toFixed(2);
  els.radiatorArealDensityValue.textContent = `${Number(els.radiatorArealDensity.value).toFixed(1)} kg/m²`;
  const selectedLaunchPreset = state.defaults.launch_cost_presets[els.launchPreset.value];
  els.launchBaselineAltValue.textContent = `${selectedLaunchPreset.base_alt_km.toFixed(0)} km`;
}

function getCurrentInputPayload() {
  const defaults = state.defaults;
  const selectedPreset = els.betaPreset.value;
  const activeBetaMix = getActiveBetaMix();
  const launchPreset = defaults.launch_cost_presets[els.launchPreset.value];

  return {
    datacenter_mw: Number(els.datacenterMw.value),
    altitude_km: Number(els.altitudeKm.value),
    gpu_temp_c: Number(els.gpuTemp.value),
    transport_delta_t_c: Number(els.transportDeltaT.value),
    overhead_frac: Number(els.overheadFrac.value),
    launch_base_cost_per_kg: Number(els.launchBaseCost.value),
    isp_transfer_s: Number(els.ispTransfer.value),
    propulsion_struct_frac: Number(els.propulsionStructFrac.value),
    array_specific_power_w_per_kg: Number(els.arraySpecificPower.value),
    epsilon: Number(els.epsilon.value),
    radiator_areal_density_kg_per_m2: Number(els.radiatorArealDensity.value),
    beta_preset: selectedPreset,
    beta_mix: activeBetaMix,
    launch_preset: els.launchPreset.value,
    launch_model: {
      base_alt_km: Number(launchPreset.base_alt_km),
      base_cost_per_kg: Number(els.launchBaseCost.value),
      isp_s: Number(els.ispTransfer.value),
      propulsion_struct_frac: Number(els.propulsionStructFrac.value)
    }
  };
}

function makeConstantsFromDefaults(inputs) {
  const base = state.defaults.constants;
  return {
    ...base
  };
}

function renderKpis(result) {
  els.kpiSpacePremium.textContent = compactMoney(result.space_premium_usd);
  els.kpiFleetCapex.textContent = compactMoney(result.fleet_capex_usd);
  els.kpiGpuCost.textContent = compactMoney(result.fleet_gpu_cost_usd);
  els.kpiLaunchCost.textContent = `${formatCurrency(result.launch_cost_per_kg_at_altitude)} / kg`;
  els.kpiSatMass.textContent = `${(result.sat_mass_weighted_kg / 1000).toFixed(2)} t / sat`;
  els.kpiSatellites.textContent = new Intl.NumberFormat("en-US").format(result.satellites_needed);
}

function renderCostSplitChart(result) {
  const yMax = result.fleet_capex_usd * 1.05;
  const yAxis = buildDollarAxis(yMax);

  const data = [
    {
      x: ["Fleet CAPEX"],
      y: [result.fleet_gpu_cost_usd],
      type: "bar",
      name: "GPU Hardware Cost",
      marker: { color: THEME_COLORS.gpu },
      customdata: [compactMoney(result.fleet_gpu_cost_usd)],
      hovertemplate: "GPU Hardware: %{customdata}<extra></extra>"
    },
    {
      x: ["Fleet CAPEX"],
      y: [result.space_premium_usd],
      type: "bar",
      name: "Space Premium",
      marker: { color: THEME_COLORS.premium },
      customdata: [compactMoney(result.space_premium_usd)],
      hovertemplate: "Space Premium: %{customdata}<extra></extra>"
    }
  ];

  const layout = {
    barmode: "stack",
    margin: { t: 72, r: 20, b: 68, l: 92 },
    font: { family: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif", color: THEME_COLORS.chartText },
    yaxis: {
      title: { text: "USD", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
      gridcolor: THEME_COLORS.chartGrid,
      zerolinecolor: THEME_COLORS.chartZero,
      automargin: true
    },
    xaxis: {
      gridcolor: THEME_COLORS.chartGrid,
      automargin: true
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.22,
      xanchor: "left",
      yanchor: "bottom",
      bgcolor: THEME_COLORS.legendBg
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)"
  };

  Plotly.react(els.chartCostSplit, data, layout, { responsive: true, displayModeBar: false });
}

function renderPremiumVsMwChart(currentInputs) {
  const ranges = state.defaults.ranges;
  const constants = makeConstantsFromDefaults(currentInputs);
  const x = [];
  const y = [];

  for (let mw = ranges.datacenter_mw.min; mw <= ranges.datacenter_mw.max; mw += 50) {
    const sweepInputs = {
      ...currentInputs,
      datacenter_mw: mw
    };
    const validated = validateInputs(sweepInputs, ranges);
    const result = computeScenario(validated, constants);
    x.push(mw);
    y.push(result.space_premium_usd);
  }

  const currentResult = computeScenario(validateInputs(currentInputs, ranges), constants);
  const yAxis = buildDollarAxis(Math.max(...y) * 1.05);

  const data = [
    {
      x,
      y,
      type: "scatter",
      mode: "lines",
      name: "Space Premium",
      line: { color: THEME_COLORS.line, width: 3 },
      customdata: y.map((value) => compactMoney(value)),
      hovertemplate: "MW: %{x}<br>Space Premium: %{customdata}<extra></extra>"
    },
    {
      x: [currentInputs.datacenter_mw],
      y: [currentResult.space_premium_usd],
      type: "scatter",
      mode: "markers",
      name: "Current Selection",
      marker: { color: THEME_COLORS.premium, size: 11 },
      customdata: [compactMoney(currentResult.space_premium_usd)],
      hovertemplate: "MW: %{x}<br>Current: %{customdata}<extra></extra>"
    }
  ];

  const layout = {
    margin: { t: 56, r: 20, b: 96, l: 92 },
    font: { family: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif", color: THEME_COLORS.chartText },
    xaxis: {
      title: { text: "Datacenter Size Replaced (MW)", standoff: 18 },
      gridcolor: THEME_COLORS.chartGrid,
      automargin: true
    },
    yaxis: {
      title: { text: "Space Premium (USD)", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
      gridcolor: THEME_COLORS.chartGrid,
      zerolinecolor: THEME_COLORS.chartZero,
      automargin: true
    },
    legend: {
      orientation: "h",
      x: 0,
      y: -0.28,
      xanchor: "left",
      yanchor: "top",
      bgcolor: THEME_COLORS.legendBg
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)"
  };

  Plotly.react(els.chartPremiumVsMw, data, layout, { responsive: true, displayModeBar: false });
}

function renderSpaceComponentsChart(result) {
  const c = result.fleet_component_costs_usd;
  const components = [
    { label: "Solar Arrays", value: c.array_usd },
    { label: "Radiators", value: c.radiator_usd },
    { label: "Bus/Structure", value: c.bus_usd },
    { label: "Launch", value: c.launch_usd }
  ];
  const total = components.reduce((sum, item) => sum + item.value, 0);
  const yAxis = buildDollarAxis(total * 1.08);

  const data = [
    {
      type: "waterfall",
      orientation: "v",
      x: [...components.map((item) => item.label), "Total Space Premium"],
      measure: [
        ...components.map(() => "relative"),
        "total"
      ],
      y: [...components.map((item) => item.value), total],
      connector: {
        line: {
          color: THEME_COLORS.connector,
          width: 1
        }
      },
      increasing: {
        marker: { color: THEME_COLORS.waterfallIncrease }
      },
      totals: {
        marker: { color: THEME_COLORS.waterfallTotal }
      },
      customdata: [...components.map((item) => compactMoney(item.value)), compactMoney(total)],
      hovertemplate: "%{x}: %{customdata}<extra></extra>"
    }
  ];

  const layout = {
    margin: { t: 38, r: 20, b: 82, l: 92 },
    font: { family: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif", color: THEME_COLORS.chartText },
    xaxis: {
      gridcolor: THEME_COLORS.chartGrid,
      automargin: true
    },
    yaxis: {
      title: { text: "USD", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
      gridcolor: THEME_COLORS.chartGrid,
      zerolinecolor: THEME_COLORS.chartZero,
      automargin: true
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)"
  };

  Plotly.react(els.chartSpaceComponents, data, layout, { responsive: true, displayModeBar: false });

  const launchShare = total > 0 ? (100 * c.launch_usd) / total : 0;
  els.chartSpaceComponentsNote.textContent =
    `Launch is a separate line item and already reflects lifting full satellite mass. ` +
    `Hardware bars are manufacturing costs. Launch contributes ${launchShare.toFixed(1)}% of space premium.`;
}

function renderLaunchBreakdownChart(result) {
  const launchByMass = result.fleet_launch_cost_breakdown_usd;
  const segments = [
    { name: "GPUs / Compute Module", value: launchByMass.compute_usd, color: THEME_COLORS.launchSegments.compute },
    { name: "Solar Arrays", value: launchByMass.array_usd, color: THEME_COLORS.launchSegments.arrays },
    { name: "Radiators", value: launchByMass.radiator_usd, color: THEME_COLORS.launchSegments.radiators },
    { name: "Bus/Structure", value: launchByMass.bus_usd, color: THEME_COLORS.launchSegments.bus }
  ];
  const totalLaunch = segments.reduce((sum, s) => sum + s.value, 0);
  const yAxis = buildDollarAxis(totalLaunch * 1.08);

  const data = segments.map((segment) => ({
    x: ["Launch Cost"],
    y: [segment.value],
    type: "bar",
    name: segment.name,
    marker: { color: segment.color },
    customdata: [compactMoney(segment.value)],
    hovertemplate: `${segment.name}: %{customdata}<extra></extra>`
  }));

  const layout = {
    barmode: "stack",
    margin: { t: 36, r: 20, b: 64, l: 92 },
    font: { family: "\"Plus Jakarta Sans\", \"Segoe UI\", sans-serif", color: THEME_COLORS.chartText },
    xaxis: {
      gridcolor: THEME_COLORS.chartGrid,
      automargin: true
    },
    yaxis: {
      title: { text: "USD", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
      gridcolor: THEME_COLORS.chartGrid,
      zerolinecolor: THEME_COLORS.chartZero,
      automargin: true
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.18,
      xanchor: "left",
      yanchor: "bottom",
      bgcolor: THEME_COLORS.legendBg
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)"
  };

  Plotly.react(els.chartLaunchBreakdown, data, layout, { responsive: true, displayModeBar: false });

  const launchMass = result.fleet_launch_mass_breakdown_kg;
  const totalMass = launchMass.compute_kg + launchMass.array_kg + launchMass.radiator_kg + launchMass.bus_kg + launchMass.battery_kg;
  const arraysMassShare = totalMass > 0 ? (100 * launchMass.array_kg) / totalMass : 0;
  const radiatorMassShare = totalMass > 0 ? (100 * launchMass.radiator_kg) / totalMass : 0;
  els.chartLaunchBreakdownNote.textContent =
    `Stacked launch bar allocates launch spend by mass contribution at ${formatCurrency(result.launch_cost_per_kg_at_altitude)} / kg ` +
    `(mass multiplier ${result.launch_mass_multiplier_at_altitude.toFixed(2)}x). ` +
    `Arrays contribute ${arraysMassShare.toFixed(1)}% of launched mass and radiators contribute ${radiatorMassShare.toFixed(1)}%.`;
}

function allocateSatellitesByMix(totalSatellites, mix) {
  const desired = mix.map(([betaDeg, weight]) => ({
    betaDeg,
    desired: totalSatellites * weight
  }));
  const base = desired.map((row) => ({
    betaDeg: row.betaDeg,
    count: Math.floor(row.desired),
    frac: row.desired - Math.floor(row.desired)
  }));
  let remaining = totalSatellites - base.reduce((sum, row) => sum + row.count, 0);
  base
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .forEach((row) => {
      if (remaining <= 0) return;
      const target = base.find((entry) => entry.betaDeg === row.betaDeg);
      target.count += 1;
      remaining -= 1;
    });
  return base.map(({ betaDeg, count }) => ({ betaDeg, count }));
}

function sampleSatelliteCount(totalSatellites) {
  if (totalSatellites <= 180) return totalSatellites;
  return Math.min(180, Math.max(96, Math.round(Math.sqrt(totalSatellites) * 5.2)));
}

function allocateDisplaySamplesByFamily(allocations, displayTotal) {
  const totalSatellites = allocations.reduce((sum, row) => sum + row.count, 0);
  if (totalSatellites <= 0 || displayTotal <= 0) {
    return allocations.map((row) => ({ betaDeg: row.betaDeg, displayCount: 0 }));
  }

  const weighted = allocations.map((row) => ({
    betaDeg: row.betaDeg,
    desired: (row.count / totalSatellites) * displayTotal
  }));
  const base = weighted.map((row) => ({
    betaDeg: row.betaDeg,
    displayCount: Math.floor(row.desired),
    frac: row.desired - Math.floor(row.desired)
  }));
  let remaining = displayTotal - base.reduce((sum, row) => sum + row.displayCount, 0);
  base
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .forEach((row) => {
      if (remaining <= 0) return;
      const target = base.find((entry) => entry.betaDeg === row.betaDeg);
      target.displayCount += 1;
      remaining -= 1;
    });

  return base.map(({ betaDeg, displayCount }) => ({ betaDeg, displayCount }));
}

function getStarfieldPoints() {
  if (state.constellationStarfield) {
    return state.constellationStarfield;
  }

  const count = 140;
  const stars = [];

  for (let i = 0; i < count; i += 1) {
    const x = ((i * 73) % count) / count;
    const y = ((i * 29 + 17) % count) / count;
    stars.push({
      x,
      y,
      size: 0.7 + (i % 3) * 0.55,
      alpha: 0.24 + (i % 5) * 0.11
    });
  }

  state.constellationStarfield = stars;

  return state.constellationStarfield;
}

function ensureConstellationCanvas() {
  if (state.constellationCanvas && els.chartConstellation.contains(state.constellationCanvas)) {
    return state.constellationCanvas;
  }

  els.chartConstellation.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.className = "constellation-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Perspective constellation diagram");
  els.chartConstellation.appendChild(canvas);
  state.constellationCanvas = canvas;
  return canvas;
}

function resizeConstellationCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(340, Math.round(rect.height));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function projectOrbitPoint(theta, orbitRadiusPx, betaDeg, orbitYawRad = -0.68, orbitPitchRad = 0.88) {
  const beta = (betaDeg * Math.PI) / 180;
  const x3 = orbitRadiusPx * Math.cos(theta);
  const y3 = orbitRadiusPx * Math.sin(theta) * Math.cos(beta);
  const z3 = orbitRadiusPx * Math.sin(theta) * Math.sin(beta);

  const xYaw = x3 * Math.cos(orbitYawRad) - y3 * Math.sin(orbitYawRad);
  const yYaw = x3 * Math.sin(orbitYawRad) + y3 * Math.cos(orbitYawRad);
  const yPitch = yYaw * Math.cos(orbitPitchRad) - z3 * Math.sin(orbitPitchRad);
  const zPitch = yYaw * Math.sin(orbitPitchRad) + z3 * Math.cos(orbitPitchRad);

  return {
    x: xYaw,
    y: yPitch,
    depth: zPitch
  };
}

function buildProjectedOrbit(orbitRadiusPx, betaDeg, steps = 200) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i * 2 * Math.PI) / steps;
    points.push(projectOrbitPoint(theta, orbitRadiusPx, betaDeg));
  }
  return points;
}

function buildProjectedSatellitePoints(orbitRadiusPx, betaDeg, pointCount, phaseOffset = 0) {
  const points = [];
  for (let i = 0; i < pointCount; i += 1) {
    const theta = (i * 2 * Math.PI) / Math.max(pointCount, 1) + phaseOffset;
    points.push(projectOrbitPoint(theta, orbitRadiusPx, betaDeg));
  }
  return points;
}

function drawOrbitSegments(ctx, centerX, centerY, points, isFront, color) {
  ctx.save();
  ctx.lineWidth = isFront ? 2.3 : 1.2;
  ctx.strokeStyle = isFront ? color : "rgba(255,255,255,0.16)";
  ctx.setLineDash(isFront ? [] : [5, 7]);

  let active = false;
  ctx.beginPath();
  points.forEach((point, index) => {
    const visibleSide = isFront ? point.depth >= 0 : point.depth < 0;
    const px = centerX + point.x;
    const py = centerY + point.y;
    if (visibleSide) {
      if (!active) {
        ctx.moveTo(px, py);
        active = true;
      } else {
        ctx.lineTo(px, py);
      }
    } else if (active && index !== points.length - 1) {
      ctx.stroke();
      ctx.beginPath();
      active = false;
    }
  });
  if (active) {
    ctx.stroke();
  }
  ctx.restore();
}

function drawSatelliteLayer(ctx, centerX, centerY, points, color, isFront, baseSize) {
  ctx.save();
  points.forEach((point) => {
    const visibleSide = isFront ? point.depth >= 0 : point.depth < 0;
    if (!visibleSide) return;
    const sizeBoost = 0.55 * clampValue(point.depth / Math.max(baseSize * 6, 1), -1, 1);
    const radius = Math.max(1.1, baseSize + (isFront ? sizeBoost : 0));
    ctx.fillStyle = isFront ? color : "rgba(255,255,255,0.22)";
    ctx.globalAlpha = isFront ? 0.8 : 0.35;
    ctx.beginPath();
    ctx.arc(centerX + point.x, centerY + point.y, radius, 0, 2 * Math.PI);
    ctx.fill();
  });
  ctx.restore();
}

function drawMotionPacket(ctx, centerX, centerY, scene) {
  scene.allocations.forEach((allocation, idx) => {
    const packetPoints = buildProjectedSatellitePoints(
      allocation.orbitRadiusPx,
      allocation.betaDeg,
      6,
      state.constellationPhase * allocation.angularRateScale + idx * 0.72
    );
    packetPoints.forEach((point, pointIdx) => {
      if (point.depth < 0) return;
      const alpha = 0.95 - pointIdx * 0.13;
      const radius = 5.8 - pointIdx * 0.7;
      ctx.save();
      ctx.fillStyle = allocation.color;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 14;
      ctx.shadowColor = allocation.color;
      ctx.beginPath();
      ctx.arc(centerX + point.x, centerY + point.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    });
  });
}

function drawConstellationScene(scene) {
  const canvas = ensureConstellationCanvas();
  const { ctx, width, height } = resizeConstellationCanvas(canvas);
  const centerX = width * 0.39;
  const centerY = height * 0.57;

  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#1d1733");
  bg.addColorStop(0.58, "#2c1e47");
  bg.addColorStop(1, "#24183c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const stars = getStarfieldPoints();
  stars.forEach((star) => {
    ctx.fillStyle = `rgba(244, 233, 255, ${star.alpha})`;
    ctx.beginPath();
    ctx.arc(star.x * width, star.y * height, star.size, 0, 2 * Math.PI);
    ctx.fill();
  });

  const sunGlow = ctx.createRadialGradient(width * 0.84, height * 0.18, 8, width * 0.84, height * 0.18, width * 0.18);
  sunGlow.addColorStop(0, "rgba(255, 214, 137, 0.35)");
  sunGlow.addColorStop(1, "rgba(255, 214, 137, 0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(width * 0.66, 0, width * 0.34, height * 0.36);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 199, 122, 0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.76, height * 0.16);
  ctx.lineTo(width * 0.6, height * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width * 0.6, height * 0.16);
  ctx.lineTo(width * 0.625, height * 0.145);
  ctx.lineTo(width * 0.625, height * 0.175);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 199, 122, 0.92)";
  ctx.fill();
  ctx.restore();

  scene.allocations.forEach((allocation) => {
    drawOrbitSegments(ctx, centerX, centerY, allocation.orbitPoints, false, allocation.color);
    drawSatelliteLayer(ctx, centerX, centerY, allocation.samplePoints, allocation.color, false, allocation.pointSize);
  });

  const halo = ctx.createRadialGradient(centerX, centerY, scene.earthRadiusPx * 0.7, centerX, centerY, scene.earthRadiusPx * 1.28);
  halo.addColorStop(0, "rgba(145, 123, 255, 0.08)");
  halo.addColorStop(1, "rgba(145, 123, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(centerX, centerY, scene.earthRadiusPx * 1.28, 0, 2 * Math.PI);
  ctx.fill();

  const planet = ctx.createRadialGradient(
    centerX - scene.earthRadiusPx * 0.38,
    centerY - scene.earthRadiusPx * 0.42,
    scene.earthRadiusPx * 0.14,
    centerX,
    centerY,
    scene.earthRadiusPx
  );
  planet.addColorStop(0, "#8d7ff0");
  planet.addColorStop(0.5, "#5b4ba8");
  planet.addColorStop(1, "#281f64");
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(centerX, centerY, scene.earthRadiusPx, 0, 2 * Math.PI);
  ctx.fill();

  const atmosphere = ctx.createRadialGradient(centerX, centerY, scene.earthRadiusPx, centerX, centerY, scene.earthRadiusPx * 1.08);
  atmosphere.addColorStop(0, "rgba(169, 156, 248, 0)");
  atmosphere.addColorStop(1, "rgba(169, 156, 248, 0.36)");
  ctx.strokeStyle = atmosphere;
  ctx.lineWidth = scene.earthRadiusPx * 0.16;
  ctx.beginPath();
  ctx.arc(centerX, centerY, scene.earthRadiusPx * 1.02, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.ellipse(centerX - scene.earthRadiusPx * 0.22, centerY - scene.earthRadiusPx * 0.15, scene.earthRadiusPx * 0.28, scene.earthRadiusPx * 0.18, -0.45, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  scene.allocations.forEach((allocation) => {
    drawOrbitSegments(ctx, centerX, centerY, allocation.orbitPoints, true, allocation.color);
    drawSatelliteLayer(ctx, centerX, centerY, allocation.samplePoints, allocation.color, true, allocation.pointSize);
  });

  drawMotionPacket(ctx, centerX, centerY, scene);

  ctx.fillStyle = "rgba(255, 250, 255, 0.78)";
  ctx.font = "600 12px \"Plus Jakarta Sans\", sans-serif";
  ctx.fillText("2D perspective constellation sketch", 18, 28);
  ctx.fillStyle = "rgba(255, 250, 255, 0.52)";
  ctx.font = "500 11px \"Plus Jakarta Sans\", sans-serif";
  ctx.fillText("Earth-centered, illustrative rather than orbital-propagated", 18, 46);
  ctx.fillStyle = "rgba(255, 199, 122, 0.92)";
  ctx.fillText("Sunlight", width * 0.77, height * 0.125);
}

function sunlightTendencyLabel(betaDeg) {
  if (betaDeg <= 15) return "Lower beta: more eclipse exposure in this simplified framing.";
  if (betaDeg <= 45) return "Mid beta: mixed sun/eclipse behavior.";
  if (betaDeg <= 75) return "High beta: longer sunlit windows are more common.";
  return "Near-polar beta: often most sunlight-favorable in this model.";
}

function renderConstellationFamilyCards(allocations, totalSatellites) {
  els.constellationFamilyCards.innerHTML = allocations
    .map((allocation) => {
      const pct = totalSatellites > 0 ? (100 * allocation.count) / totalSatellites : 0;
      const color = BETA_COLOR_SCALE[allocation.betaDeg] || THEME_COLORS.fallback;
      return `
        <article class="constellation-family-card" style="border-left-color:${color}">
          <h4>${allocation.betaDeg}° Beta Family</h4>
          <p><strong>${new Intl.NumberFormat("en-US").format(allocation.count)}</strong> satellites (${pct.toFixed(1)}% of fleet).</p>
          <p>${sunlightTendencyLabel(allocation.betaDeg)}</p>
        </article>
      `;
    })
    .join("");
}

function renderConstellationChart(result, inputs) {
  const allocations = allocateSatellitesByMix(result.satellites_needed, result.beta_mix_used);
  const displayTotal = sampleSatelliteCount(result.satellites_needed);
  const displayAllocations = allocateDisplaySamplesByFamily(allocations, displayTotal);
  const canvas = ensureConstellationCanvas();
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width || els.chartConstellation.clientWidth || 320, 320);
  const height = Math.max(rect.height || els.chartConstellation.clientHeight || 340, 340);
  const orbitRadiusNormalized = 1 + (inputs.altitude_km / EARTH_RADIUS_KM);
  const orbitRadiusPxMax = Math.min(width * 0.46, height * 0.41);
  const earthRadiusPx = orbitRadiusPxMax / orbitRadiusNormalized;
  const scene = {
    earthRadiusPx,
    allocations: allocations.map((allocation, idx) => {
      const displayCount = displayAllocations.find((row) => row.betaDeg === allocation.betaDeg)?.displayCount || 0;
      const orbitRadiusPx = earthRadiusPx * orbitRadiusNormalized;
      const pointSize = allocation.count > 300 ? 2.1 : 2.6;
      return {
        betaDeg: allocation.betaDeg,
        count: allocation.count,
        color: BETA_COLOR_SCALE[allocation.betaDeg] || THEME_COLORS.fallback,
        angularRateScale: 0.75 + idx * 0.14,
        orbitRadiusPx,
        pointSize,
        orbitPoints: buildProjectedOrbit(orbitRadiusPx, allocation.betaDeg, 220),
        samplePoints: buildProjectedSatellitePoints(orbitRadiusPx, allocation.betaDeg, displayCount, idx * 0.58)
      };
    })
  };
  state.constellationAnimationModel = scene;
  drawConstellationScene(scene);
  if (state.constellationAnimating) {
    startConstellationAnimation();
  } else {
    stopConstellationAnimation();
  }

  const mixSummary = allocations
    .map((row) => `${row.betaDeg}°: ${new Intl.NumberFormat("en-US").format(row.count)}`)
    .join(" | ");
  els.chartConstellationNote.textContent =
    `Showing full constellation: ${new Intl.NumberFormat("en-US").format(result.satellites_needed)} satellites at ${inputs.altitude_km.toFixed(0)} km. ` +
    `Orbit-family allocation by beta mix: ${mixSummary}. Displaying ${new Intl.NumberFormat("en-US").format(displayTotal)} sampled satellites in a lightweight 2D perspective sketch. ` +
    `This is a beta-bin representation for visual intuition, not a full orbital mechanics propagation.`;

  renderConstellationFamilyCards(allocations, result.satellites_needed);
}

function renderReferencePanel(currentResult, inputs) {
  const ref = state.reference;
  els.referenceMeta.textContent = `${ref.source_notebook.path} | snapshot: ${ref.source_notebook.snapshot_utc}`;

  const refInputs = ref.reference_inputs;
  els.referenceInputs.innerHTML = [
    `Target datacenter: ${refInputs.datacenter_mw} MW`,
    `Altitude: ${refInputs.altitude_km} km`,
    `GPU temperature: ${refInputs.gpu_temp_c} °C`,
    `Transport ΔT: ${refInputs.transport_delta_t_c} °C`,
    `Launch baseline cost: ${compactMoney(refInputs.launch_base_cost_per_kg, 0)} / kg`,
    `Transfer Isp: ${refInputs.isp_transfer_s.toFixed(0)} s`,
    `Propulsion dry-mass fraction: ${(refInputs.propulsion_struct_frac * 100).toFixed(1)}%`,
    `Solar array specific power: ${refInputs.array_specific_power_w_per_kg.toFixed(0)} W/kg`,
    `Radiator emissivity: ${refInputs.epsilon.toFixed(2)}`,
    `Radiator areal density: ${refInputs.radiator_areal_density_kg_per_m2.toFixed(1)} kg/m²`,
    `Mode: ${refInputs.mode}`,
    `Beta preset: ${refInputs.beta_preset}`
  ]
    .map((line) => `<li>${line}</li>`)
    .join("");

  const refOutputs = ref.reference_outputs;
  els.referenceOutputs.innerHTML = [
    `Fleet CAPEX: ${compactMoney(refOutputs.fleet_capex_usd)}`,
    `Fleet GPU cost: ${compactMoney(refOutputs.fleet_gpu_cost_usd)}`,
    `Space premium: ${compactMoney(refOutputs.fleet_space_premium_usd)}`,
    `Launch cost at altitude: ${formatCurrency(refOutputs.launch_cost_per_kg_at_altitude)} / kg`,
    `Launch mass multiplier: ${refOutputs.launch_mass_multiplier_at_altitude.toFixed(2)}x`,
    `Weighted sat mass: ${(refOutputs.sat_mass_weighted_kg / 1000).toFixed(2)} t`,
    `Satellites needed: ${new Intl.NumberFormat("en-US").format(refOutputs.satellites_needed)}`,
    `Weighted sunlight fraction: ${refOutputs.sunlight_fraction_weighted.toFixed(4)}`
  ]
    .map((line) => `<li>${line}</li>`)
    .join("");

  const premiumDelta = currentResult.space_premium_usd - refOutputs.fleet_space_premium_usd;
  const capexDelta = currentResult.fleet_capex_usd - refOutputs.fleet_capex_usd;
  const satDelta = currentResult.satellites_needed - refOutputs.satellites_needed;
  const premiumSign = premiumDelta >= 0 ? "+" : "-";
  const capexSign = capexDelta >= 0 ? "+" : "-";

  els.referenceDiff.innerHTML = [
    `Current vs reference space premium: ${premiumSign}${compactMoney(Math.abs(premiumDelta))}`,
    `Current vs reference fleet CAPEX: ${capexSign}${compactMoney(Math.abs(capexDelta))}`,
    `Current vs reference satellites: ${satDelta >= 0 ? "+" : ""}${satDelta}`,
    `Current beta preset: ${inputs.beta_preset}`
  ]
    .map((line) => `<li>${line}</li>`)
    .join("");
}

function renderAll() {
  updateValueLabels();
  const ranges = state.defaults.ranges;
  const rawInputs = getCurrentInputPayload();
  const inputs = validateInputs(rawInputs, ranges);
  const constants = makeConstantsFromDefaults(inputs);

  constants.OVERHEAD_FRAC = inputs.overhead_frac;
  constants.T_GPU_C = inputs.gpu_temp_c;
  constants.DELTA_T_TO_RADIATOR_C = inputs.transport_delta_t_c;
  constants.ARRAY_SPECIFIC_POWER_W_PER_KG = inputs.array_specific_power_w_per_kg;
  constants.EPSILON = inputs.epsilon;
  constants.RADIATOR_AREAL_DENSITY = inputs.radiator_areal_density_kg_per_m2;

  const result = computeScenario(inputs, constants);
  renderBetaMixEditor(result);
  renderKpis(result);
  renderCostSplitChart(result);
  renderPremiumVsMwChart(inputs);
  renderSpaceComponentsChart(result);
  renderLaunchBreakdownChart(result);
  renderConstellationChart(result, inputs);
  renderReferencePanel(result, inputs);

  window.spaceDatacenterDebug = {
    inputs,
    constants,
    result,
    checkIdentity: Math.abs(result.space_premium_usd - (result.fleet_capex_usd - result.fleet_gpu_cost_usd)) < 1e-6
  };
}

function updateConstellationSpeedLabel() {
  els.constellationSpeedValue.textContent = `${state.constellationSpeedRps.toFixed(2)} rev/s`;
}

function updateConstellationPlayButton() {
  els.constellationPlayToggle.textContent = state.constellationAnimating ? "Pause Motion" : "Play Motion";
}

function redrawConstellationScene() {
  if (!state.constellationAnimationModel) return;
  drawConstellationScene(state.constellationAnimationModel);
}

function tickConstellationAnimation(now) {
  if (state.constellationLastTickMs == null) {
    state.constellationLastTickMs = now;
    redrawConstellationScene();
    return;
  }

  const dt = (now - state.constellationLastTickMs) / 1000;
  if (dt < 1 / 12) {
    return;
  }
  state.constellationLastTickMs = now;

  if (!state.constellationAnimating) return;
  if (!state.constellationAnimationModel) return;

  state.constellationPhase += dt * state.constellationSpeedRps * 2 * Math.PI;
  redrawConstellationScene();
}

function animationLoop(now) {
  if (!state.constellationAnimating) {
    state.constellationFrameHandle = null;
    return;
  }
  tickConstellationAnimation(now);
  state.constellationFrameHandle = requestAnimationFrame(animationLoop);
}

function startConstellationAnimation() {
  if (!state.constellationAnimating) return;
  if (state.constellationFrameHandle != null) return;
  state.constellationLastTickMs = null;
  state.constellationFrameHandle = requestAnimationFrame(animationLoop);
}

function stopConstellationAnimation() {
  if (state.constellationFrameHandle != null) {
    cancelAnimationFrame(state.constellationFrameHandle);
    state.constellationFrameHandle = null;
  }
}

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(renderAll, 110);
}

function wireEvents() {
  state.controls.forEach((el) => {
    el.addEventListener("input", scheduleRender);
    el.addEventListener("change", scheduleRender);
  });

  els.launchPreset.addEventListener("change", () => {
    const preset = state.defaults.launch_cost_presets[els.launchPreset.value];
    els.launchBaseCost.value = preset.base_cost_per_kg;
    els.ispTransfer.value = preset.isp_s;
    els.propulsionStructFrac.value = preset.propulsion_struct_frac;
    els.launchPresetSource.innerHTML = preset.source_links
      .map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`)
      .join(" | ");
    applyParameterTooltips(state.defaults);
    scheduleRender();
  });

  els.betaPreset.addEventListener("change", () => {
    if (els.betaPreset.value !== "__custom__") {
      setCustomSharesFromMix(getPresetOrDefaultMix(els.betaPreset.value));
    }
    renderBetaMixEditor();
    scheduleRender();
  });

  els.betaCustomSliders.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const angle = Number(event.target.dataset.betaAngle);
    if (!Number.isFinite(angle)) return;
    rebalanceCustomShares(angle, Number(event.target.value));
    els.betaPreset.value = "__custom__";
    renderBetaMixEditor();
    scheduleRender();
  });

  els.betaResetButton.addEventListener("click", () => {
    const presetKey = els.betaPreset.value === "__custom__" ? state.defaults.ranges.beta_preset.default : els.betaPreset.value;
    const mix = getPresetOrDefaultMix(presetKey);
    setCustomSharesFromMix(mix);
    if (els.betaPreset.value === "__custom__") {
      els.betaPreset.value = presetKey;
    }
    renderBetaMixEditor();
    scheduleRender();
  });

  els.constellationPlayToggle.addEventListener("click", () => {
    state.constellationAnimating = !state.constellationAnimating;
    state.constellationLastTickMs = null;
    updateConstellationPlayButton();
    if (state.constellationAnimating) {
      startConstellationAnimation();
    } else {
      stopConstellationAnimation();
      redrawConstellationScene();
    }
  });

  els.constellationSpeed.addEventListener("input", () => {
    state.constellationSpeedRps = Number(els.constellationSpeed.value);
    updateConstellationSpeedLabel();
    if (!state.constellationAnimating) {
      redrawConstellationScene();
    }
  });

  window.addEventListener("resize", scheduleRender);
}

function configureControls(defaults) {
  Object.entries(defaults.beta_mix_presets).forEach(([key, preset]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = preset.label;
    els.betaPreset.appendChild(option);
  });
  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "Custom visual mix (editable below)";
  els.betaPreset.appendChild(customOption);
  els.betaPreset.value = defaults.ranges.beta_preset.default;

  Object.entries(defaults.launch_cost_presets).forEach(([key, preset]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = preset.label;
    els.launchPreset.appendChild(option);
  });
  els.launchPreset.value = defaults.ranges.launch_preset.default;

  applyRangeConfig(els.datacenterMw, els.datacenterMwValue, defaults.ranges.datacenter_mw, (v) => `${v} MW`);
  applyRangeConfig(els.altitudeKm, els.altitudeKmValue, defaults.ranges.altitude_km, (v) => `${v} km`);
  applyRangeConfig(els.gpuTemp, els.gpuTempValue, defaults.ranges.gpu_temp_c, (v) => `${v} °C`);
  applyRangeConfig(els.transportDeltaT, els.transportDeltaTValue, defaults.ranges.transport_delta_t_c, (v) => `${v} °C`);
  applyRangeConfig(els.overheadFrac, els.overheadFracValue, defaults.ranges.overhead_frac, (v) => `${(v * 100).toFixed(1)}%`);
  applyRangeConfig(
    els.launchBaseCost,
    els.launchBaseCostValue,
    defaults.ranges.launch_base_cost_per_kg,
    (v) => `${formatCurrency(v)} / kg`
  );
  applyRangeConfig(
    els.ispTransfer,
    els.ispTransferValue,
    defaults.ranges.isp_transfer_s,
    (v) => `${v} s`
  );
  applyRangeConfig(
    els.propulsionStructFrac,
    els.propulsionStructFracValue,
    defaults.ranges.propulsion_struct_frac,
    (v) => `${(v * 100).toFixed(1)}%`
  );
  applyRangeConfig(
    els.arraySpecificPower,
    els.arraySpecificPowerValue,
    defaults.ranges.array_specific_power_w_per_kg,
    (v) => `${v} W/kg`
  );
  applyRangeConfig(
    els.epsilon,
    els.epsilonValue,
    defaults.ranges.epsilon,
    (v) => Number(v).toFixed(2)
  );
  applyRangeConfig(
    els.radiatorArealDensity,
    els.radiatorArealDensityValue,
    defaults.ranges.radiator_areal_density_kg_per_m2,
    (v) => `${Number(v).toFixed(1)} kg/m²`
  );

  const initialLaunchPreset = defaults.launch_cost_presets[els.launchPreset.value];
  els.launchBaseCost.value = initialLaunchPreset.base_cost_per_kg;
  els.ispTransfer.value = initialLaunchPreset.isp_s;
  els.propulsionStructFrac.value = initialLaunchPreset.propulsion_struct_frac;
  els.launchPresetSource.innerHTML = initialLaunchPreset.source_links
    .map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`)
    .join(" | ");
  applyParameterTooltips(defaults);
  renderParameterAnchorCards(defaults);
  configureBetaEditor(defaults);
  els.constellationSpeed.value = state.constellationSpeedRps;
  updateConstellationSpeedLabel();
  updateConstellationPlayButton();

  state.controls = [
    els.betaPreset,
    els.datacenterMw,
    els.altitudeKm,
    els.gpuTemp,
    els.transportDeltaT,
    els.overheadFrac,
    els.launchBaseCost,
    els.ispTransfer,
    els.propulsionStructFrac,
    els.arraySpecificPower,
    els.epsilon,
    els.radiatorArealDensity
  ];
}

async function init() {
  const [defaults, reference] = await Promise.all([
    loadJson("./data/model_defaults.json"),
    loadJson("./data/reference_snapshot.json")
  ]);

  state.defaults = defaults;
  state.reference = reference;
  configureControls(defaults);
  wireEvents();
  renderAll();
}

init().catch((err) => {
  document.body.innerHTML = `<main class=\"error\"><h1>Failed to initialize app</h1><pre>${err.message}</pre></main>`;
  throw err;
});
