const SIGMA = 5.670374419e-8;
const MU_EARTH = 3.986004418e14;
const R_EARTH = 6371000.0;
const SOLAR_CONSTANT = 1361.0;
const G0 = 9.80665;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function validateInputs(inputs, ranges) {
  const normalized = {
    datacenter_mw: clamp(Number(inputs.datacenter_mw), ranges.datacenter_mw.min, ranges.datacenter_mw.max),
    altitude_km: clamp(Number(inputs.altitude_km), ranges.altitude_km.min, ranges.altitude_km.max),
    gpu_temp_c: clamp(Number(inputs.gpu_temp_c), ranges.gpu_temp_c.min, ranges.gpu_temp_c.max),
    transport_delta_t_c: clamp(Number(inputs.transport_delta_t_c), ranges.transport_delta_t_c.min, ranges.transport_delta_t_c.max),
    launch_base_cost_per_kg: clamp(
      Number(inputs.launch_base_cost_per_kg),
      ranges.launch_base_cost_per_kg.min,
      ranges.launch_base_cost_per_kg.max
    ),
    isp_transfer_s: clamp(Number(inputs.isp_transfer_s), ranges.isp_transfer_s.min, ranges.isp_transfer_s.max),
    propulsion_struct_frac: clamp(
      Number(inputs.propulsion_struct_frac),
      ranges.propulsion_struct_frac.min,
      ranges.propulsion_struct_frac.max
    ),
    array_specific_power_w_per_kg: clamp(
      Number(inputs.array_specific_power_w_per_kg),
      ranges.array_specific_power_w_per_kg.min,
      ranges.array_specific_power_w_per_kg.max
    ),
    epsilon: clamp(Number(inputs.epsilon), ranges.epsilon.min, ranges.epsilon.max),
    radiator_areal_density_kg_per_m2: clamp(
      Number(inputs.radiator_areal_density_kg_per_m2),
      ranges.radiator_areal_density_kg_per_m2.min,
      ranges.radiator_areal_density_kg_per_m2.max
    ),
    overhead_frac: clamp(Number(inputs.overhead_frac), ranges.overhead_frac.min, ranges.overhead_frac.max),
    beta_preset: String(inputs.beta_preset),
    beta_mix: inputs.beta_mix,
    launch_preset: String(inputs.launch_preset),
    launch_model: {
      base_alt_km: Number(inputs.launch_model.base_alt_km),
      base_cost_per_kg: clamp(
        Number(inputs.launch_model.base_cost_per_kg),
        ranges.launch_base_cost_per_kg.min,
        ranges.launch_base_cost_per_kg.max
      ),
      isp_s: clamp(Number(inputs.launch_model.isp_s), ranges.isp_transfer_s.min, ranges.isp_transfer_s.max),
      propulsion_struct_frac: clamp(
        Number(inputs.launch_model.propulsion_struct_frac),
        ranges.propulsion_struct_frac.min,
        ranges.propulsion_struct_frac.max
      )
    }
  };

  return normalized;
}

export function formatCurrency(value, options = {}) {
  const {
    compact = false,
    decimals = 2
  } = options;

  const sign = value < 0 ? "-" : "";
  const absValue = Math.abs(value);

  if (compact && absValue >= 1e6) {
    let scaled = absValue;
    let suffix = "";

    if (absValue >= 1e12) {
      scaled = absValue / 1e12;
      suffix = "T";
    } else if (absValue >= 1e9) {
      scaled = absValue / 1e9;
      suffix = "B";
    } else {
      scaled = absValue / 1e6;
      suffix = "M";
    }

    return `${sign}$${scaled.toFixed(decimals)}${suffix}`;
  }

  return `${sign}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(absValue)}`;
}

function totalLoadW(pComputeKw, overheadFrac) {
  return 1000.0 * pComputeKw * (1.0 + overheadFrac);
}

function radiatorTempC(tGpuC, deltaTC) {
  return tGpuC - deltaTC;
}

function orbitalPeriodS(altKm) {
  const r = R_EARTH + 1000.0 * altKm;
  return 2.0 * Math.PI * Math.sqrt((r ** 3) / MU_EARTH);
}

function sunlightFraction(altKm, betaDeg = 0.0) {
  const r = R_EARTH + 1000.0 * altKm;
  const beta = (betaDeg * Math.PI) / 180.0;
  const ratio = R_EARTH / r;

  if (Math.abs(Math.sin(beta)) >= ratio) {
    return 1.0;
  }

  const numerator = ratio ** 2 - Math.sin(beta) ** 2;
  const denominator = Math.cos(beta) ** 2;
  const x = clamp(numerator / denominator, 0.0, 1.0);
  const thetaE = Math.asin(Math.sqrt(x));
  return 1.0 - thetaE / Math.PI;
}

function normalizeBetaMix(betaMix) {
  if (!Array.isArray(betaMix) || betaMix.length === 0) {
    throw new Error("beta_mix must be a non-empty array");
  }

  const totalWeight = betaMix.reduce((sum, row) => sum + Number(row[1]), 0);
  if (!(totalWeight > 0)) {
    throw new Error("beta_mix must have positive total weight");
  }

  return betaMix.map(([betaDeg, weight]) => [Number(betaDeg), Number(weight) / totalWeight]);
}

function earthViewFactorMax(altKm) {
  const r = R_EARTH + 1000.0 * altKm;
  return (R_EARTH / r) ** 2;
}

function radiatorBackloadFluxWm2(altKm, betaDeg, constants) {
  const fSun = sunlightFraction(altKm, betaDeg);
  const fEarth = clamp(
    earthViewFactorMax(altKm) * constants.EARTH_VIEW_FRACTION_OF_MAX,
    0.0,
    1.0
  );

  const qIr = constants.ALPHA_IR * constants.EARTH_IR_FLUX_W_PER_M2 * fEarth;
  const qAlbedo =
    constants.ALPHA_SOLAR *
    SOLAR_CONSTANT *
    constants.EARTH_BOND_ALBEDO *
    fEarth *
    constants.ALBEDO_GEOMETRY_FACTOR *
    fSun;
  const qSolar =
    constants.ALPHA_SOLAR *
    SOLAR_CONSTANT *
    constants.RADIATOR_SOLAR_VIEW_FACTOR *
    fSun;

  return {
    q_backload_total_w_m2: qIr + qAlbedo + qSolar,
    q_backload_earth_ir_w_m2: qIr,
    q_backload_albedo_w_m2: qAlbedo,
    q_backload_solar_w_m2: qSolar,
    earth_view_factor_effective: fEarth,
    sunlight_fraction: fSun
  };
}

function radiatorAreaM2WithBackload(qInternalW, tRadC, altKm, betaDeg, constants) {
  const tRadK = tRadC + 273.15;
  const qEmit = constants.EPSILON * SIGMA * constants.K_EFFECTIVE * (tRadK ** 4 - constants.T_SINK_K ** 4);
  const back = radiatorBackloadFluxWm2(altKm, betaDeg, constants);
  const qNet = qEmit - back.q_backload_total_w_m2;

  if (qNet <= 0) {
    return {
      area_m2: Number.POSITIVE_INFINITY,
      diagnostics: {
        ...back,
        q_emit_w_m2: qEmit,
        q_net_w_m2: qNet
      }
    };
  }

  return {
    area_m2: qInternalW / qNet,
    diagnostics: {
      ...back,
      q_emit_w_m2: qEmit,
      q_net_w_m2: qNet
    }
  };
}

function totalMassWithBus(nonBusMassKg, busFraction) {
  return nonBusMassKg / Math.max(1.0 - busFraction, 1e-9);
}

function hohmannDeltaVmS(alt1Km, alt2Km) {
  const r1 = R_EARTH + 1000.0 * alt1Km;
  const r2 = R_EARTH + 1000.0 * alt2Km;
  const v1 = Math.sqrt(MU_EARTH / r1);
  const v2 = Math.sqrt(MU_EARTH / r2);
  const aTransfer = 0.5 * (r1 + r2);
  const vTransfer1 = Math.sqrt(MU_EARTH * (2 / r1 - 1 / aTransfer));
  const vTransfer2 = Math.sqrt(MU_EARTH * (2 / r2 - 1 / aTransfer));
  const dv1 = Math.abs(vTransfer1 - v1);
  const dv2 = Math.abs(v2 - vTransfer2);
  return dv1 + dv2;
}

function effectiveCostPerKgToAltitude(altKm, launchModel) {
  if (altKm <= launchModel.base_alt_km) {
    return {
      cost_per_kg: launchModel.base_cost_per_kg,
      mass_multiplier: 1.0,
      delta_v_m_s: 0.0
    };
  }

  const deltaV = hohmannDeltaVmS(launchModel.base_alt_km, altKm);
  const rocketMassRatio = Math.exp(deltaV / (G0 * Math.max(launchModel.isp_s, 1e-9)));
  let massMultiplier = rocketMassRatio;

  if (launchModel.propulsion_struct_frac > 0) {
    const denom = 1.0 - launchModel.propulsion_struct_frac * (rocketMassRatio - 1.0);
    if (denom <= 0) {
      return {
        cost_per_kg: Number.POSITIVE_INFINITY,
        mass_multiplier: Number.POSITIVE_INFINITY,
        delta_v_m_s: deltaV
      };
    }
    massMultiplier = rocketMassRatio / denom;
  }

  return {
    cost_per_kg: launchModel.base_cost_per_kg * massMultiplier,
    mass_multiplier: massMultiplier,
    delta_v_m_s: deltaV
  };
}

function satelliteMassBreakdownSunOnly(altKm, betaDeg, constants, runtime) {
  const fSun = sunlightFraction(altKm, betaDeg);
  const pLoadW = totalLoadW(constants.P_COMPUTE_KW, runtime.overhead_frac);
  const tRadC = radiatorTempC(runtime.gpu_temp_c, runtime.transport_delta_t_c);

  const rad = radiatorAreaM2WithBackload(pLoadW, tRadC, altKm, betaDeg, constants);
  const mRadiatorKg = rad.area_m2 * runtime.radiator_areal_density_kg_per_m2;

  const pArrayPeakW = pLoadW;
  const mArrayKg = pArrayPeakW / runtime.array_specific_power_w_per_kg;
  const mBatteryKg = 0.0;

  const mNonBusKg = constants.M_COMPUTE_KG + mRadiatorKg + mArrayKg + mBatteryKg;
  const mTotalKg = totalMassWithBus(mNonBusKg, constants.BUS_MASS_FRACTION_OF_TOTAL);
  const mBusKg = mTotalKg * constants.BUS_MASS_FRACTION_OF_TOTAL;

  return {
    alt_km: altKm,
    beta_deg: betaDeg,
    sunlight_fraction: fSun,
    uptime_fraction: fSun,
    avg_compute_kw: constants.P_COMPUTE_KW * fSun,
    p_array_peak_w: pArrayPeakW,
    m_total_kg: mTotalKg,
    m_compute_kg: constants.M_COMPUTE_KG,
    m_radiator_kg: mRadiatorKg,
    m_array_kg: mArrayKg,
    m_battery_kg: mBatteryKg,
    m_bus_kg: mBusKg,
    a_radiator_m2: rad.area_m2,
    q_backload_w_m2: rad.diagnostics.q_backload_total_w_m2,
    q_net_radiator_w_m2: rad.diagnostics.q_net_w_m2
  };
}

function satelliteCapexUsdSunOnly(breakdown, constants, runtime) {
  const computeCost = constants.COMPUTE_COST_PER_KW * constants.P_COMPUTE_KW;
  const arrayCost = breakdown.p_array_peak_w * constants.ARRAY_COST_PER_W;
  const radiatorCost = breakdown.a_radiator_m2 * constants.RADIATOR_COST_PER_M2;
  const busCost = constants.BUS_COST_FIXED;
  const launch = effectiveCostPerKgToAltitude(breakdown.alt_km, runtime.launch_model);
  const launchCostPerKg = launch.cost_per_kg;
  const launchCost = breakdown.m_total_kg * launchCostPerKg;

  return {
    total_capex_usd: computeCost + arrayCost + radiatorCost + busCost + launchCost,
    components: {
      compute_usd: computeCost,
      array_usd: arrayCost,
      radiator_usd: radiatorCost,
      battery_usd: 0.0,
      bus_usd: busCost,
      launch_usd: launchCost
    },
    launch
  };
}

export function computeFleetFromMix(inputs, constants) {
  const mix = normalizeBetaMix(inputs.beta_mix);

  const perBeta = mix.map(([betaDeg, weight]) => {
    const breakdown = satelliteMassBreakdownSunOnly(inputs.altitude_km, betaDeg, constants, inputs);
    const capex = satelliteCapexUsdSunOnly(breakdown, constants, inputs);
    return {
      beta_deg: betaDeg,
      weight,
      sunlight_fraction: breakdown.sunlight_fraction,
      avg_compute_kw: breakdown.avg_compute_kw,
      m_total_kg: breakdown.m_total_kg,
      m_compute_kg: breakdown.m_compute_kg,
      m_array_kg: breakdown.m_array_kg,
      m_radiator_kg: breakdown.m_radiator_kg,
      m_battery_kg: breakdown.m_battery_kg,
      m_bus_kg: breakdown.m_bus_kg,
      sat_capex_usd: capex.total_capex_usd,
      sat_component_costs: capex.components,
      launch_cost_per_kg_at_altitude: capex.launch.cost_per_kg,
      launch_mass_multiplier: capex.launch.mass_multiplier,
      transfer_delta_v_m_s: capex.launch.delta_v_m_s
    };
  });

  const weighted = perBeta.reduce(
    (acc, row) => {
      acc.avg_compute_kw += row.weight * row.avg_compute_kw;
      acc.mass_kg += row.weight * row.m_total_kg;
      acc.mass_components_kg.compute_kg += row.weight * row.m_compute_kg;
      acc.mass_components_kg.array_kg += row.weight * row.m_array_kg;
      acc.mass_components_kg.radiator_kg += row.weight * row.m_radiator_kg;
      acc.mass_components_kg.battery_kg += row.weight * row.m_battery_kg;
      acc.mass_components_kg.bus_kg += row.weight * row.m_bus_kg;
      acc.capex_usd += row.weight * row.sat_capex_usd;
      acc.sunlight_fraction += row.weight * row.sunlight_fraction;
      acc.component_costs.compute_usd += row.weight * row.sat_component_costs.compute_usd;
      acc.component_costs.array_usd += row.weight * row.sat_component_costs.array_usd;
      acc.component_costs.radiator_usd += row.weight * row.sat_component_costs.radiator_usd;
      acc.component_costs.battery_usd += row.weight * row.sat_component_costs.battery_usd;
      acc.component_costs.bus_usd += row.weight * row.sat_component_costs.bus_usd;
      acc.component_costs.launch_usd += row.weight * row.sat_component_costs.launch_usd;
      acc.launch_cost_per_kg_at_altitude += row.weight * row.launch_cost_per_kg_at_altitude;
      acc.launch_mass_multiplier += row.weight * row.launch_mass_multiplier;
      acc.transfer_delta_v_m_s += row.weight * row.transfer_delta_v_m_s;
      return acc;
    },
    {
      avg_compute_kw: 0.0,
      mass_kg: 0.0,
      capex_usd: 0.0,
      sunlight_fraction: 0.0,
      mass_components_kg: {
        compute_kg: 0.0,
        array_kg: 0.0,
        radiator_kg: 0.0,
        battery_kg: 0.0,
        bus_kg: 0.0
      },
      component_costs: {
        compute_usd: 0.0,
        array_usd: 0.0,
        radiator_usd: 0.0,
        battery_usd: 0.0,
        bus_usd: 0.0,
        launch_usd: 0.0
      },
      launch_cost_per_kg_at_altitude: 0.0,
      launch_mass_multiplier: 0.0,
      transfer_delta_v_m_s: 0.0
    }
  );

  const targetComputeMw = inputs.datacenter_mw;
  const satAvgMw = weighted.avg_compute_kw / 1000.0;
  const satellitesNeeded = Math.ceil(targetComputeMw / Math.max(satAvgMw, 1e-9));

  const fleetComponentCosts = {
    compute_usd: weighted.component_costs.compute_usd * satellitesNeeded,
    array_usd: weighted.component_costs.array_usd * satellitesNeeded,
    radiator_usd: weighted.component_costs.radiator_usd * satellitesNeeded,
    battery_usd: weighted.component_costs.battery_usd * satellitesNeeded,
    bus_usd: weighted.component_costs.bus_usd * satellitesNeeded,
    launch_usd: weighted.component_costs.launch_usd * satellitesNeeded
  };
  const launchCostPerKgAtAltitude = weighted.launch_cost_per_kg_at_altitude;
  const fleetLaunchMassBreakdownKg = {
    compute_kg: weighted.mass_components_kg.compute_kg * satellitesNeeded,
    array_kg: weighted.mass_components_kg.array_kg * satellitesNeeded,
    radiator_kg: weighted.mass_components_kg.radiator_kg * satellitesNeeded,
    battery_kg: weighted.mass_components_kg.battery_kg * satellitesNeeded,
    bus_kg: weighted.mass_components_kg.bus_kg * satellitesNeeded
  };
  const fleetLaunchCostBreakdownUsd = {
    compute_usd: fleetLaunchMassBreakdownKg.compute_kg * launchCostPerKgAtAltitude,
    array_usd: fleetLaunchMassBreakdownKg.array_kg * launchCostPerKgAtAltitude,
    radiator_usd: fleetLaunchMassBreakdownKg.radiator_kg * launchCostPerKgAtAltitude,
    battery_usd: fleetLaunchMassBreakdownKg.battery_kg * launchCostPerKgAtAltitude,
    bus_usd: fleetLaunchMassBreakdownKg.bus_kg * launchCostPerKgAtAltitude
  };

  return {
    alt_km: inputs.altitude_km,
    target_compute_mw: targetComputeMw,
    satellites_needed: satellitesNeeded,
    fleet_capex_usd: weighted.capex_usd * satellitesNeeded,
    fleet_mass_tonnes: (weighted.mass_kg * satellitesNeeded) / 1000.0,
    avg_compute_mw_delivered: satAvgMw * satellitesNeeded,
    sunlight_fraction_weighted: weighted.sunlight_fraction,
    sat_capex_weighted_usd: weighted.capex_usd,
    sat_mass_weighted_kg: weighted.mass_kg,
    sat_array_mass_weighted_kg: weighted.mass_components_kg.array_kg,
    sat_radiator_mass_weighted_kg: weighted.mass_components_kg.radiator_kg,
    beta_mix_used: mix,
    launch_cost_per_kg_at_altitude: launchCostPerKgAtAltitude,
    launch_mass_multiplier_at_altitude: weighted.launch_mass_multiplier,
    transfer_delta_v_m_s: weighted.transfer_delta_v_m_s,
    fleet_component_costs_usd: fleetComponentCosts,
    fleet_launch_mass_breakdown_kg: fleetLaunchMassBreakdownKg,
    fleet_launch_cost_breakdown_usd: fleetLaunchCostBreakdownUsd,
    weighted_satellite_component_costs_usd: weighted.component_costs,
    weighted_orbital_period_s: orbitalPeriodS(inputs.altitude_km)
  };
}

export function computeScenario(inputs, constants) {
  const fleet = computeFleetFromMix(inputs, constants);
  const fleetGpuCostUsd = fleet.satellites_needed * constants.COMPUTE_COST_PER_KW * constants.P_COMPUTE_KW;
  const spacePremiumUsd = fleet.fleet_capex_usd - fleetGpuCostUsd;

  return {
    ...fleet,
    fleet_gpu_cost_usd: fleetGpuCostUsd,
    space_premium_usd: spacePremiumUsd
  };
}
