import { useContext } from "react";
import { Platform, type ScrollViewProps } from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { editorial } from "@/constants/editorial";

export function useTabScreenScrollInsets(contentTopExtra = 16) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad =
    Platform.OS === "web"
      ? 34 + 84
      : (tabBarHeight ?? insets.bottom + 49) + editorial.blockGap;

  return {
    topPad,
    bottomPad,
    contentPaddingTop: topPad + contentTopExtra,
  };
}

export function getTabScrollViewStyle(backgroundColor: string) {
  return [
    { flex: 1, backgroundColor },
    Platform.OS === "web" ? ({ overscrollBehavior: "none" } as object) : null,
  ];
}

export const TAB_SCROLL_VIEW_PROPS = {
  bounces: false,
  alwaysBounceVertical: false,
  overScrollMode: "never",
  contentInsetAdjustmentBehavior: "never",
  showsVerticalScrollIndicator: false,
} satisfies Partial<ScrollViewProps>;
