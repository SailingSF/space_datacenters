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
  betaCustomShares: {}
};

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
  launchIncrementalCost: document.getElementById("launch-incremental-cost-per-kg-per-km"),
  launchIncrementalCostValue: document.getElementById("launch-incremental-cost-per-kg-per-km-value"),
  launchBaselineAltValue: document.getElementById("launch-baseline-altitude-value"),
  launchPresetSource: document.getElementById("launch-preset-source"),
  arraySpecificPower: document.getElementById("array-specific-power-w-per-kg"),
  arraySpecificPowerValue: document.getElementById("array-specific-power-w-per-kg-value"),
  kpiSpacePremium: document.getElementById("kpi-space-premium"),
  kpiFleetCapex: document.getElementById("kpi-fleet-capex"),
  kpiGpuCost: document.getElementById("kpi-gpu-cost"),
  kpiSatellites: document.getElementById("kpi-satellites"),
  chartCostSplit: document.getElementById("chart-cost-split"),
  chartPremiumVsMw: document.getElementById("chart-premium-vs-mw"),
  chartSpaceComponents: document.getElementById("chart-space-components"),
  chartSpaceComponentsNote: document.getElementById("chart-space-components-note"),
  chartLaunchBreakdown: document.getElementById("chart-launch-breakdown"),
  chartLaunchBreakdownNote: document.getElementById("chart-launch-breakdown-note"),
  referenceMeta: document.getElementById("reference-meta"),
  referenceInputs: document.getElementById("reference-inputs"),
  referenceOutputs: document.getElementById("reference-outputs"),
  referenceDiff: document.getElementById("reference-diff")
};

const BETA_COLOR_SCALE = {
  0: "#c6492d",
  30: "#f08a5d",
  60: "#3d8c86",
  90: "#2f5d8a"
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
      `Select a launch pricing assumption package. It sets recommended base and altitude-dependent launch costs. ` +
      `Good default: ${launchDefaultLabel}.`,
    launch_base_cost_per_kg:
      `Launch price per kg to the preset baseline altitude before altitude adjustments. ` +
      `Good default: use the active preset value (${formatCurrency(activeLaunchPreset.base_cost_per_kg, { compact: false })} / kg).`,
    launch_incremental_cost_per_kg_per_km:
      `Additional launch price per kg for each km above baseline altitude. ` +
      `Good default: use the active preset value (${formatCurrency(activeLaunchPreset.incremental_cost_per_kg_per_km, { compact: false })} / kg / km).`,
    array_specific_power_w_per_kg:
      `Solar array watts delivered per kg of array mass. Higher values reduce array mass for the same power demand. ` +
      `Good default: ${ranges.array_specific_power_w_per_kg.default} W/kg.`,
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
      const color = BETA_COLOR_SCALE[angle] || "#5f6f7a";
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
        <span class="beta-slider-label"><span class="beta-dot" style="background:${BETA_COLOR_SCALE[angle] || "#5f6f7a"}"></span>${angle}° beta share</span>
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
  els.launchIncrementalCostValue.textContent = `${formatCurrency(Number(els.launchIncrementalCost.value), { compact: false })} / kg / km`;
  els.arraySpecificPowerValue.textContent = `${Number(els.arraySpecificPower.value).toFixed(0)} W/kg`;
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
    launch_incremental_cost_per_kg_per_km: Number(els.launchIncrementalCost.value),
    array_specific_power_w_per_kg: Number(els.arraySpecificPower.value),
    beta_preset: selectedPreset,
    beta_mix: activeBetaMix,
    launch_preset: els.launchPreset.value,
    launch_model: {
      base_alt_km: Number(launchPreset.base_alt_km),
      base_cost_per_kg: Number(els.launchBaseCost.value),
      incremental_cost_per_kg_per_km: Number(els.launchIncrementalCost.value)
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
      marker: { color: "#2f5d8a" },
      customdata: [compactMoney(result.fleet_gpu_cost_usd)],
      hovertemplate: "GPU Hardware: %{customdata}<extra></extra>"
    },
    {
      x: ["Fleet CAPEX"],
      y: [result.space_premium_usd],
      type: "bar",
      name: "Space Premium",
      marker: { color: "#f26b38" },
      customdata: [compactMoney(result.space_premium_usd)],
      hovertemplate: "Space Premium: %{customdata}<extra></extra>"
    }
  ];

  const layout = {
    barmode: "stack",
    margin: { t: 72, r: 20, b: 68, l: 92 },
    yaxis: {
      title: { text: "USD", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
      automargin: true
    },
    xaxis: {
      automargin: true
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.22,
      xanchor: "left",
      yanchor: "bottom",
      bgcolor: "rgba(255,255,255,0.65)"
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
      line: { color: "#115f4e", width: 3 },
      customdata: y.map((value) => compactMoney(value)),
      hovertemplate: "MW: %{x}<br>Space Premium: %{customdata}<extra></extra>"
    },
    {
      x: [currentInputs.datacenter_mw],
      y: [currentResult.space_premium_usd],
      type: "scatter",
      mode: "markers",
      name: "Current Selection",
      marker: { color: "#f26b38", size: 11 },
      customdata: [compactMoney(currentResult.space_premium_usd)],
      hovertemplate: "MW: %{x}<br>Current: %{customdata}<extra></extra>"
    }
  ];

  const layout = {
    margin: { t: 56, r: 20, b: 96, l: 92 },
    xaxis: {
      title: { text: "Datacenter Size Replaced (MW)", standoff: 18 },
      automargin: true
    },
    yaxis: {
      title: { text: "Space Premium (USD)", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
      automargin: true
    },
    legend: {
      orientation: "h",
      x: 0,
      y: -0.28,
      xanchor: "left",
      yanchor: "top",
      bgcolor: "rgba(255,255,255,0.65)"
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
          color: "rgba(90,90,90,0.35)",
          width: 1
        }
      },
      increasing: {
        marker: { color: "#0f8b8d" }
      },
      totals: {
        marker: { color: "#2f5d8a" }
      },
      customdata: [...components.map((item) => compactMoney(item.value)), compactMoney(total)],
      hovertemplate: "%{x}: %{customdata}<extra></extra>"
    }
  ];

  const layout = {
    margin: { t: 38, r: 20, b: 82, l: 92 },
    xaxis: {
      automargin: true
    },
    yaxis: {
      title: { text: "USD", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
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
    { name: "GPUs / Compute Module", value: launchByMass.compute_usd, color: "#2f5d8a" },
    { name: "Solar Arrays", value: launchByMass.array_usd, color: "#0f8b8d" },
    { name: "Radiators", value: launchByMass.radiator_usd, color: "#9c6644" },
    { name: "Bus/Structure", value: launchByMass.bus_usd, color: "#4c6a92" }
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
    xaxis: {
      automargin: true
    },
    yaxis: {
      title: { text: "USD", standoff: 12 },
      tickvals: yAxis.tickvals,
      ticktext: yAxis.ticktext,
      range: [0, yAxis.top],
      automargin: true
    },
    legend: {
      orientation: "h",
      x: 0,
      y: 1.18,
      xanchor: "left",
      yanchor: "bottom",
      bgcolor: "rgba(255,255,255,0.65)"
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)"
  };

  Plotly.react(els.chartLaunchBreakdown, data, layout, { responsive: true, displayModeBar: false });

  const launchMass = result.fleet_launch_mass_breakdown_kg;
  const totalMass = launchMass.compute_kg + launchMass.array_kg + launchMass.radiator_kg + launchMass.bus_kg + launchMass.battery_kg;
  const arraysMassShare = totalMass > 0 ? (100 * launchMass.array_kg) / totalMass : 0;
  els.chartLaunchBreakdownNote.textContent =
    `Stacked launch bar allocates launch spend by mass contribution at ${formatCurrency(result.launch_cost_per_kg_at_altitude)} / kg. ` +
    `Arrays contribute ${arraysMassShare.toFixed(1)}% of launched mass in this scenario.`;
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
    `Launch incremental: ${formatCurrency(refInputs.launch_incremental_cost_per_kg_per_km)} / kg / km`,
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

  const result = computeScenario(inputs, constants);
  renderBetaMixEditor(result);
  renderKpis(result);
  renderCostSplitChart(result);
  renderPremiumVsMwChart(inputs);
  renderSpaceComponentsChart(result);
  renderLaunchBreakdownChart(result);
  renderReferencePanel(result, inputs);

  window.spaceDatacenterDebug = {
    inputs,
    constants,
    result,
    checkIdentity: Math.abs(result.space_premium_usd - (result.fleet_capex_usd - result.fleet_gpu_cost_usd)) < 1e-6
  };
}

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(renderAll, 60);
}

function wireEvents() {
  state.controls.forEach((el) => {
    el.addEventListener("input", scheduleRender);
    el.addEventListener("change", scheduleRender);
  });

  els.launchPreset.addEventListener("change", () => {
    const preset = state.defaults.launch_cost_presets[els.launchPreset.value];
    els.launchBaseCost.value = preset.base_cost_per_kg;
    els.launchIncrementalCost.value = preset.incremental_cost_per_kg_per_km;
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
    els.launchIncrementalCost,
    els.launchIncrementalCostValue,
    defaults.ranges.launch_incremental_cost_per_kg_per_km,
    (v) => `${formatCurrency(v)} / kg / km`
  );
  applyRangeConfig(
    els.arraySpecificPower,
    els.arraySpecificPowerValue,
    defaults.ranges.array_specific_power_w_per_kg,
    (v) => `${v} W/kg`
  );

  const initialLaunchPreset = defaults.launch_cost_presets[els.launchPreset.value];
  els.launchBaseCost.value = initialLaunchPreset.base_cost_per_kg;
  els.launchIncrementalCost.value = initialLaunchPreset.incremental_cost_per_kg_per_km;
  els.launchPresetSource.innerHTML = initialLaunchPreset.source_links
    .map((link) => `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`)
    .join(" | ");
  applyParameterTooltips(defaults);
  configureBetaEditor(defaults);

  state.controls = [
    els.betaPreset,
    els.datacenterMw,
    els.altitudeKm,
    els.gpuTemp,
    els.transportDeltaT,
    els.overheadFrac,
    els.launchBaseCost,
    els.launchIncrementalCost,
    els.arraySpecificPower
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
