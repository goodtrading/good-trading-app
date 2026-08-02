import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  Pressable,
  Platform,
  PanResponder,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMarketStateWithFallback } from "@/hooks/useMarketStateWithFallback";
import { useStableKeyZones } from "@/hooks/useStableKeyZones";
import { useActiveAsset } from "@/lib/assets";
import { formatValuedField } from "@/lib/market-state/dataStatusUi";
import { MOBILE_STATE_V2_ENABLED } from "@/lib/feature-flags";
import { resolveHeaderRegimeFromV2 } from "@/lib/market-state/headerRegimeView";
import { readMicroTransitionZone } from "@/lib/market-state/transitionZoneView";
import { resolveIsHomeReady } from "@/lib/market-state/homeReadiness";
import { filterIncrementalDrivers } from "@/lib/market-state/incrementalDrivers";
import {
  KEY_ZONE_LABEL_CALL_WALL,
  KEY_ZONE_LABEL_PUT_WALL,
} from "@/lib/market-state/v2UiMappers";
import { useColors } from "@/hooks/useColors";
import {
  getTabScrollViewStyle,
  TAB_SCROLL_VIEW_PROPS,
  useTabScreenScrollInsets,
} from "@/hooks/useTabScreenScrollInsets";
import { editorial } from "@/constants/editorial";
import { CommandBlock } from "@/components/CommandBlock";
import { ScenarioCard } from "@/components/ScenarioCard";
import { KeyZonesCard } from "@/components/KeyZonesCard";
import { MarketStateBadge } from "@/components/MarketStateBadge";
import { DriversCard } from "@/components/DriversCard";
import { formatUsd } from "@/lib/portfolio/accounts/format";

// NO mock imports. Every value shown comes from the API or shows explicit
// "awaiting data" state. If you see real-looking numbers here, the terminal pushed them.

const formatUsdPrice = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return formatUsd(n);
};

const normalizeGammaLabel = (value: unknown) => {
  const text = String(value ?? "").toUpperCase();
  if (text.includes("SHORT")) return "SHORT GAMMA";
  if (text.includes("LONG")) return "LONG GAMMA";
  if (text.includes("TRANSITION")) return "TRANSITION GAMMA";
  return "UNKNOWN";
};

const formatCompactUsd = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;

  return `${sign}$${abs.toFixed(0)}`;
};

const formatPercent = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
};

// Driver helper functions
const normalizeDriverLabel = (value: unknown) => {
  return String(value ?? "")
    .replace(/_/g, " ")
    .trim()
    .toUpperCase();
};

const classifyDriverImpact = (driver: string): "high" | "medium" | "low" => {
  const text = driver.toUpperCase();

  if (
    text.includes("FRAGILE") ||
    text.includes("NEAR GAMMA FLIP") ||
    text.includes("VOLATILITY EXPANSION") ||
    text.includes("HIGH VOLATILITY") ||
    text.includes("RISK")
  ) {
    return "high";
  }

  if (
    text.includes("TRANSITION") ||
    text.includes("MIXED") ||
    text.includes("LOW CONFIDENCE") ||
    text.includes("ACCEL") ||
    text.includes("VANNA")
  ) {
    return "medium";
  }

  return "low";
};

// Institutional market state derivation functions
const deriveVolatilityState = (gamma: string, gammaLevel: number) => {
  const gammaUpper = gamma.toUpperCase();
  const absGammaLevel = Math.abs(gammaLevel);

  // SHORT GAMMA + high gamma magnitude → HIGH VOLATILITY
  if (gammaUpper.includes("SHORT") && absGammaLevel > 50) {
    return "HIGH VOLATILITY";
  }

  // LONG GAMMA + compressed positioning → LOW VOLATILITY
  if (gammaUpper.includes("LONG") && absGammaLevel < 30) {
    return "LOW VOLATILITY";
  }

  // TRANSITION GAMMA → TRANSITIONAL VOLATILITY
  if (gammaUpper.includes("TRANSITION")) {
    return "TRANSITIONAL VOLATILITY";
  }

  // Default based on gamma level
  if (absGammaLevel > 50) return "HIGH VOLATILITY";
  if (absGammaLevel < 30) return "LOW VOLATILITY";

  return "MODERATE VOLATILITY";
};

const deriveDealerStructure = (gamma: string, probability: number, bias: string) => {
  const gammaUpper = gamma.toUpperCase();
  const biasUpper = bias.toUpperCase();

  // SHORT GAMMA OR low confidence OR transition regime → FRAGILE STRUCTURE
  if (
    gammaUpper.includes("SHORT") ||
    gammaUpper.includes("TRANSITION") ||
    probability < 50 ||
    biasUpper.includes("FRAGILE")
  ) {
    return "FRAGILE STRUCTURE";
  }

  // LONG GAMMA + stable positioning → STABLE STRUCTURE
  if (gammaUpper.includes("LONG") && probability >= 50) {
    return "STABLE STRUCTURE";
  }

  return "NEUTRAL STRUCTURE";
};

const deriveMarketModeNarrative = (
  gamma: string,
  probability: number,
  bias: string,
  tags: string[],
  outlook: string | undefined
) => {
  const gammaUpper = gamma.toUpperCase();
  const biasUpper = bias.toUpperCase();

  // Derive title based on gamma and bias combination
  let title = "NEUTRAL POSITIONING";

  if (gammaUpper.includes("SHORT") && biasUpper.includes("FRAGILE")) {
    title = "FRAGILE TRANSITION";
  } else if (gammaUpper.includes("SHORT")) {
    title = "VOLATILITY EXPANSION";
  } else if (gammaUpper.includes("LONG") && biasUpper.includes("STABLE")) {
    title = "CONTROLLED POSITIONING";
  } else if (gammaUpper.includes("LONG")) {
    title = "POSITIONING COMPRESSION";
  } else if (gammaUpper.includes("TRANSITION")) {
    title = "STRUCTURAL INSTABILITY";
  }

  // Derive subtitle based on outlook and gamma
  let subtitle = "Market positioning neutral";

  if (gammaUpper.includes("SHORT")) {
    subtitle = "Unstable regime with expanding volatility";
  } else if (gammaUpper.includes("LONG")) {
    subtitle = "Stable regime with compressed positioning";
  } else if (gammaUpper.includes("TRANSITION")) {
    subtitle = "Regime transition in progress";
  }

  // Derive drivers from tags and outlook
  const drivers: string[] = [];

  if (gammaUpper.includes("TRANSITION")) {
    drivers.push("Between gamma regimes");
  }

  if (biasUpper.includes("FRAGILE") || probability < 50) {
    drivers.push("Institutional bias fragile");
  }

  if (tags.length > 0) {
    drivers.push(...tags.slice(0, 2)); // Use first 2 tags as drivers
  }

  if (drivers.length === 0) {
    drivers.push("Trade state: monitoring");
  }

  return {
    title,
    subtitle,
    drivers,
    confidence: probability,
  };
};

const deriveFlipStates = (gammaFlip: unknown, dealerPivot: unknown) => {
  const globalFlip = gammaFlip ? formatUsdPrice(gammaFlip) : "—";
  const localFlip = dealerPivot ? formatUsdPrice(dealerPivot) : "—";

  return {
    globalFlip,
    localFlip,
  };
};

type MarketScope = "Macro" | "Micro";

export default function HomeScreen() {
  const colors = useColors();
  const safeInsets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const { bottomPad, contentPaddingTop, topPad } = useTabScreenScrollInsets(14);
  const [marketScope, setMarketScope] = useState<MarketScope>("Macro");
  const marketScopeRef = useRef(marketScope);
  marketScopeRef.current = marketScope;
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const hasEverRenderedHomeRef = useRef(false);

  const logHomeScrollAudit = useCallback(
    (trigger: string, extra?: Record<string, unknown>) => {
      if (!__DEV__) return;
      console.log("[HomeScrollAudit]", trigger, {
        scrollY: scrollYRef.current,
        contentHeight: contentHeightRef.current,
        paddingTopEffective: contentPaddingTop,
        topPad,
        bottomPad,
        safeAreaTop: safeInsets.top,
        safeAreaBottom: safeInsets.bottom,
        tabBarHeight: tabBarHeight ?? null,
        marketScope,
        platform: Platform.OS,
        ...extra,
      });
    },
    [
      bottomPad,
      contentPaddingTop,
      marketScope,
      safeInsets.bottom,
      safeInsets.top,
      tabBarHeight,
      topPad,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      logHomeScrollAudit("focus-enter");
      return () => {
        logHomeScrollAudit("focus-blur");
      };
    }, [logHomeScrollAudit]),
  );

  useEffect(() => {
    logHomeScrollAudit("scope-change");
    const frameId = requestAnimationFrame(() => {
      logHomeScrollAudit("scope-change-after-layout");
    });
    return () => cancelAnimationFrame(frameId);
  }, [marketScope, logHomeScrollAudit]);

  useEffect(() => {
    logHomeScrollAudit("insets-change", {
      contentPaddingTop,
      topPad,
      bottomPad,
      safeAreaTop: safeInsets.top,
      tabBarHeight: tabBarHeight ?? null,
    });
  }, [
    bottomPad,
    contentPaddingTop,
    logHomeScrollAudit,
    safeInsets.top,
    tabBarHeight,
    topPad,
  ]);

  const { activeAsset } = useActiveAsset();

  const { source: marketStateSource, v2: marketStateV2, legacy: legacyMarketQuery } =
    useMarketStateWithFallback(activeAsset);
  const { data: market, isError: legacyIsError } = legacyMarketQuery;
  const isV2MarketState = marketStateSource === "v2" && MOBILE_STATE_V2_ENABLED;
  const showConnectionError =
    legacyIsError && !isV2MarketState && !marketStateV2.data && !marketStateV2.isLoading;

  const handleScopeChange = useCallback(
    (option: MarketScope) => {
      logHomeScrollAudit("scope-change-request", {
        nextScope: option,
        previousScope: marketScopeRef.current,
      });
      setMarketScope(option);
      if (isV2MarketState) {
        marketStateV2.setSelectedMode(option === "Macro" ? "macro" : "micro");
      }
    },
    [isV2MarketState, logHomeScrollAudit, marketStateV2],
  );

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const absDx = Math.abs(gesture.dx);
          const absDy = Math.abs(gesture.dy);
          return absDx > 24 && absDx > absDy * 1.8;
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, gesture) => {
          const SWIPE_DISTANCE = 56;
          const SWIPE_VELOCITY = 0.35;
          const wentLeft =
            gesture.dx <= -SWIPE_DISTANCE || gesture.vx <= -SWIPE_VELOCITY;
          const wentRight =
            gesture.dx >= SWIPE_DISTANCE || gesture.vx >= SWIPE_VELOCITY;
          if (wentLeft && marketScopeRef.current === "Macro") {
            handleScopeChange("Micro");
            return;
          }
          if (wentRight && marketScopeRef.current === "Micro") {
            handleScopeChange("Macro");
          }
        },
      }),
    [handleScopeChange],
  );

  // Map real API response structure to UI fields
  const raw = market as any; // this is now the unwrapped data.data object
  const legacyBtcPrice = raw?.market?.spot;
  const v2BtcPrice =
    isV2MarketState && marketStateV2.spot
      ? formatValuedField(marketStateV2.spot.status, marketStateV2.spot.value, (value) =>
          String(value),
        )
      : null;
  const btcPrice = v2BtcPrice ?? legacyBtcPrice;
  const biasRaw = raw?.bias?.type ?? "NEUTRAL";
  const bias = biasRaw.replace(/_/g, " "); // Replace underscores with spaces
  const gammaRaw = raw?.market?.gammaRegime ?? "NEUTRAL";
  const gamma = normalizeGammaLabel(gammaRaw);
  const gammaLabel = gamma;
  const dealerPivot = raw?.levels?.dealerPivot;
  const setup = raw?.setup ?? raw?.playbook?.setup ?? (
    gammaLabel === "SHORT GAMMA" ? "Volatility expansion risk" :
    gammaLabel === "LONG GAMMA" ? "Mean reversion regime" :
    gammaLabel === "TRANSITION GAMMA" ? "Transition / flip watch" :
    "Waiting for setup"
  );
  const outlook = raw?.bias?.horizon ?? "—";
  const timeframe = raw?.bias?.horizon ?? "—";
  const tags = raw?.bias?.drivers ?? [];
  const probabilityRaw = raw?.bias?.confidence ?? 0;
  const probability = formatPercent(probabilityRaw);
  const gammaLevel = raw?.market?.gammaLevel ?? 0;
  const netGammaRaw = raw?.market?.totalGex ?? "—";
  const netGamma = formatCompactUsd(netGammaRaw);
  const flipPointRaw = raw?.market?.gammaFlip ?? "—";
  const flipPoint = formatUsdPrice(flipPointRaw);
  const dominantExpiry = raw?.market?.dominantExpiry ?? "N/A";
  const lastUpdate = raw?.market?.lastUpdate ?? new Date().toISOString();

  // Dev logs for scenario source
  if (__DEV__) {
    console.log("[GoodTrading Mobile] scenario payload fields:", {
      scenarios: raw?.scenarios,
      playbook: raw?.playbook,
      scenario: raw?.scenario,
      intradayScenario: raw?.intradayScenario,
      macroScenario: raw?.macroScenario,
      localScenario: raw?.localScenario,
    });
  }

  // Dev logs for market mode audit
  if (__DEV__) {
    console.log("[GoodTrading Mobile] market mode audit:", {
      marketMode: raw?.marketMode,
      marketModeBlock: raw?.market?.marketMode,
      mode: raw?.market?.mode,
      bias: raw?.bias,
      drivers: raw?.drivers,
      marketDrivers: raw?.market?.drivers,
      biasDrivers: raw?.bias?.drivers,
      confidenceRoot: raw?.confidence,
      confidenceMarket: raw?.market?.confidence,
      confidenceMarketMode: raw?.marketMode?.confidence,
      confidenceBias: raw?.bias?.confidence,
    });
  }

  // Select scenario from explicit fields only - no inference
  const explicitIntradayScenario =
    raw?.intradayScenario ??
    raw?.localScenario ??
    raw?.scenarios?.intraday ??
    null;

  const explicitMacroScenario =
    raw?.macroScenario ??
    raw?.scenarios?.macro ??
    null;

  const firstScenario =
    Array.isArray(raw?.scenarios) ? raw.scenarios[0] : null;

  const selectedScenario =
    explicitIntradayScenario ??
    explicitMacroScenario ??
    firstScenario ??
    raw?.playbook?.scenario ??
    raw?.scenario ??
    null;

  // Extract scenario text without inventing
  const scenarioText =
    typeof selectedScenario === "string"
      ? selectedScenario
      : selectedScenario?.thesis ??
        selectedScenario?.scenario ??
        selectedScenario?.title ??
        selectedScenario?.description ??
        "Sin escenario disponible";

  // Extract scenario label from explicit fields only - no inference
  const scenarioLabel =
    selectedScenario?.label ??
    selectedScenario?.type ??
    selectedScenario?.scope ??
    selectedScenario?.timeframe ??
    undefined;

  // Normalize label if it exists
  const normalizedScenarioLabel = scenarioLabel
    ? String(scenarioLabel).replace(/_/g, " ").toUpperCase()
    : undefined;

  // Market Mode from explicit fields - no inference
  const marketModeSource =
    raw?.marketMode ??
    raw?.market?.marketMode ??
    raw?.market?.mode ??
    null;

  const marketMode =
    typeof marketModeSource === "string"
      ? marketModeSource
      : marketModeSource?.type ??
        marketModeSource?.mode ??
        marketModeSource?.name ??
        raw?.bias?.type ??
        "N/A";

  // Normalize market mode label
  const normalizedMarketMode = String(marketMode).replace(/_/g, " ");

  // Confidence from Market Mode if exists, otherwise fallback
  const confidence =
    marketModeSource?.confidence ??
    raw?.market?.marketModeConfidence ??
    raw?.market?.confidence ??
    raw?.confidence ??
    raw?.bias?.confidence ??
    null;

  // Derive institutional market states
  const volatilityState = deriveVolatilityState(gamma, gammaLevel);
  const dealerStructure = deriveDealerStructure(gamma, probabilityRaw, bias);
  const marketModeNarrative = deriveMarketModeNarrative(gamma, probabilityRaw, bias, tags, outlook);
  const flipStates = deriveFlipStates(flipPointRaw, dealerPivot);

  // Driver sources - use Market Mode drivers if they exist, otherwise fallback
  const marketModeDrivers =
    marketModeSource?.drivers ??
    raw?.market?.marketModeDrivers ??
    raw?.market?.drivers ??
    raw?.drivers ??
    [];

  const rawDrivers = marketModeDrivers.length > 0 ? marketModeDrivers : raw?.bias?.drivers ?? [];

  const rawDriverLabels = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(rawDrivers) ? rawDrivers : [])
            .filter(Boolean)
            .map(normalizeDriverLabel),
        ),
      ),
    [rawDrivers],
  );

  // Color mapping for derived states
  const getGammaColor = () => {
    const gammaUpper = gamma.toUpperCase();
    if (gammaUpper.includes("SHORT")) return colors.primary; // red
    if (gammaUpper.includes("LONG")) return colors.success; // green
    if (gammaUpper.includes("TRANSITION")) return colors.gold; // amber
    return colors.mutedForeground;
  };

  const getVolatilityColor = () => {
    const volUpper = volatilityState.toUpperCase();
    if (volUpper.includes("HIGH")) return colors.primary; // red
    if (volUpper.includes("LOW")) return colors.success; // green
    if (volUpper.includes("TRANSITIONAL")) return colors.gold; // amber
    return colors.mutedForeground;
  };

  const getStructureColor = () => {
    const structUpper = dealerStructure.toUpperCase();
    if (structUpper.includes("FRAGILE")) return colors.primary; // red
    if (structUpper.includes("STABLE")) return colors.success; // green
    return colors.mutedForeground;
  };

  // Dev logs for derived institutional states
  if (__DEV__) {
    console.log("[GoodTrading Mobile] Institutional Market States:", {
      inputs: {
        gamma,
        gammaLevel,
        probability: probabilityRaw,
        bias,
        tags,
        outlook,
        flipPoint: flipPointRaw,
        dealerPivot,
      },
      derived: {
        volatilityState,
        dealerStructure,
        marketModeNarrative,
        flipStates,
      },
    });
  }

  // Build zones array from levels with formatted prices
  const callWall = raw?.levels?.callWall ?? null;
  const putWall = raw?.levels?.putWall ?? null;

  const legacyZones = useMemo(
    () => [
      {
        id: "call-wall",
        groupType: "single" as const,
        label: KEY_ZONE_LABEL_CALL_WALL,
        price: callWall ? formatUsdPrice(callWall) : "—",
        type: "resistance" as const,
        distance: "—",
        moreCount: 0,
      },
      {
        id: "put-wall",
        groupType: "single" as const,
        label: KEY_ZONE_LABEL_PUT_WALL,
        price: putWall ? formatUsdPrice(putWall) : "—",
        type: "support" as const,
        distance: "—",
        moreCount: 0,
      },
    ],
    [callWall, putWall],
  );

  const v2SpotValue = marketStateV2.spot?.value ?? null;
  const gammaV2Active = Boolean(isV2MarketState && marketStateV2.micro && marketStateV2.macro);
  const headerRegime = useMemo(
    () =>
      resolveHeaderRegimeFromV2({
        scope: marketScope,
        micro: marketStateV2.micro,
        macro: marketStateV2.macro,
        fallbackLabel: gammaLabel,
        useV2Regime: gammaV2Active,
      }),
    [gammaLabel, gammaV2Active, marketScope, marketStateV2.macro, marketStateV2.micro],
  );

  useEffect(() => {
    if (MOBILE_STATE_V2_ENABLED) {
      marketStateV2.setSelectedMode("macro");
    }
  }, [marketStateV2.setSelectedMode]);

  const microTransitionZone =
    marketScope === "Micro" && gammaV2Active
      ? readMicroTransitionZone(marketStateV2.micro)
      : null;

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[HEADER REGIME]", {
      scope: marketScope,
      microRegime: headerRegime.microRegime,
      macroRegime: headerRegime.macroRegime,
      displayedRegime: headerRegime.displayedRegime,
    });
  }, [headerRegime, marketScope]);

  const shouldUseV2KeyZones = gammaV2Active;
  const { zones } = useStableKeyZones({
    enabled: shouldUseV2KeyZones,
    mode: marketScope,
    micro: marketStateV2.micro,
    macro: marketStateV2.macro,
    spot: v2SpotValue,
    fallbackZones: legacyZones,
  });

  const drivers = useMemo(
    () =>
      filterIncrementalDrivers(rawDriverLabels, {
        regime: headerRegime.displayedRegime,
        marketMode: normalizedMarketMode,
        confidence,
        setup: String(setup),
        transitionZone: microTransitionZone,
        scope: marketScope,
        zoneLabels: zones.map((zone) => zone.label),
      }).map((label) => ({
        label,
        impact: classifyDriverImpact(label),
      })),
    [
      rawDriverLabels,
      headerRegime.displayedRegime,
      normalizedMarketMode,
      confidence,
      setup,
      microTransitionZone,
      marketScope,
      zones,
    ],
  );

  const isHomeReady = resolveIsHomeReady({
    v2Enabled: MOBILE_STATE_V2_ENABLED,
    marketStateSource,
    v2: {
      data: marketStateV2.data,
      micro: marketStateV2.micro,
      macro: marketStateV2.macro,
      spot: marketStateV2.spot,
    },
    legacyMarket: market,
  });

  if (isHomeReady) {
    hasEverRenderedHomeRef.current = true;
  }

  // Block only until the first complete snapshot; never again on poll refresh.
  const hasRenderableData = hasEverRenderedHomeRef.current;
  const isPending = !hasRenderableData;

  return (
    <View style={styles.container} {...swipeResponder.panHandlers}>
    <ScrollView
      ref={scrollViewRef}
      style={getTabScrollViewStyle(colors.background)}
      contentContainerStyle={{
        paddingTop: contentPaddingTop,
        paddingBottom: bottomPad,
        paddingHorizontal: 16,
      }}
      onScroll={(event) => {
        scrollYRef.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      onContentSizeChange={(_width, height) => {
        contentHeightRef.current = height;
      }}
      onLayout={(event) => {
        logHomeScrollAudit("scrollview-layout", {
          scrollViewHeight: event.nativeEvent.layout.height,
        });
      }}
      {...TAB_SCROLL_VIEW_PROPS}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.topBarTitle}>
          <Text style={[styles.appName, { color: colors.foreground }]}>
            GOOD<Text style={{ color: colors.primary }}>TRADING</Text>
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            INSTITUTIONAL DATA
          </Text>
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.scopeToggle}>
            {(["Macro", "Micro"] as const).map((option, index) => {
              const active = option === marketScope;
              return (
                <React.Fragment key={option}>
                  {index > 0 ? (
                    <Text style={[styles.scopeToggleDivider, { color: colors.mutedForeground }]}>
                      |
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => handleScopeChange(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Ver ${option}`}
                    style={styles.scopeToggleOption}
                  >
                    <Text
                      style={[
                        styles.scopeToggleText,
                        {
                          color: active ? colors.foreground : colors.mutedForeground,
                          opacity: active ? 1 : 0.55,
                        },
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
          {isPending && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
          {showConnectionError && (
            <View style={styles.offlinePill}>
              <Text style={[styles.offlineText, { color: colors.primary }]}>SIN SEÑAL</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Market State Bar ───────────────────────────────────── */}
      {/* REMOVED: Tags moved to CommandBlock component */}

      {/* ── Loading skeleton ───────────────────────────────────── */}
      {isPending && (
        <View style={styles.skeleton}>
          <Text style={[styles.skeletonText, { color: colors.mutedForeground }]}>
            CONECTANDO CON TERMINAL…
          </Text>
        </View>
      )}

      {/* ── Data layer — only renders when market has arrived ──── */}
      {hasRenderableData && (
        <>
          {/* CommandBlock: asset · gamma · setup · probability · lastUpdate */}
          <CommandBlock
            asset={formatUsdPrice(btcPrice) ?? "BTC"}
            gamma={headerRegime.displayedRegime}
            setup={setup}
            probability={probabilityRaw}
            lastUpdate={new Date(lastUpdate).toLocaleString("es-ES", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).toUpperCase() + " UTC"}
            marketMode={normalizedMarketMode}
            confidence={confidence}
            transitionZone={microTransitionZone}
            showTransitionInsteadOfSetup={marketScope === "Micro"}
          />

          {/* Context (+ scenario in Macro only) */}
          <View style={[styles.contextRow, marketScope === "Macro" && styles.contextRowMacro]}>
            <View style={[styles.contextColumn, marketScope === "Micro" && styles.contextColumnFull]}>
              <DriversCard drivers={drivers} />
            </View>

            {marketScope === "Macro" ? (
              <View style={styles.scenarioColumn}>
                <ScenarioCard
                  label={normalizedScenarioLabel}
                  title={scenarioText}
                  description=""
                  probability={probabilityRaw}
                />
              </View>
            ) : null}
          </View>

          {/* KeyZonesCard: zones from v2 or legacy */}
          <KeyZonesCard zones={zones} selectedMode={marketScope} />
        </>
      )}

      {/* ── Error state (no market + error) ───────────────────── */}
      {showConnectionError && !isPending && (
        <View style={styles.errorBlock}>
          <Text style={[styles.errorTitle, { color: colors.primary }]}>SIN CONEXIÓN</Text>
          <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>
            No se pudo contactar al backend. La app reintenta cada 7 segundos.
          </Text>
        </View>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: editorial.blockGap,
    zIndex: 10,
  },
  topBarTitle: {
    flex: 1,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scopeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scopeToggleDivider: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    opacity: 0.45,
  },
  scopeToggleOption: {
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  scopeToggleText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: editorial.frameRadius,
  },
  appName: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    letterSpacing: 2.5,
    marginTop: 1,
  },
  offlinePill: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  offlineText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  contextRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: editorial.blockGap,
    width: "100%",
    alignItems: "flex-start",
    marginBottom: editorial.sectionGap,
  },
  contextRowMacro: {
    flexDirection: "column",
    gap: Math.round(editorial.blockGap * 1.65),
  },
  contextColumn: {
    flex: 1,
    minWidth: 240,
  },
  contextColumnFull: {
    minWidth: "100%",
  },
  scenarioColumn: {
    width: "100%",
  },
  marketStateBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  spotPrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  skeleton: {
    paddingVertical: editorial.blockGap,
    marginBottom: editorial.blockGap,
    alignItems: "flex-start",
  },
  skeletonText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
  },
  emptyZones: {
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    gap: 6,
  },
  emptyZonesText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  emptyZonesHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  errorBlock: {
    paddingVertical: editorial.sectionGap,
    alignItems: "flex-start",
    gap: editorial.rowGap,
  },
  errorTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  errorBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
});
