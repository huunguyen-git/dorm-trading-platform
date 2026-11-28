// Lucian UX/UI Prompt #439 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#439
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { primitive, semantic } from '../../theme';
import { useReduceMotion } from './LayoutPrimitives';

export interface SkeletonBoxProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SkeletonBox({
  width = '100%',
  height,
  radius = primitive.radius.sm,
  style,
  testID,
}: SkeletonBoxProps) {
  const reduceMotion = useReduceMotion();
  const shimmer = useRef(new Animated.Value(reduceMotion ? 0.85 : 0.55)).current;

  useEffect(() => {
    if (reduceMotion) {
      shimmer.setValue(0.85);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 625,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.48,
          duration: 625,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [reduceMotion, shimmer]);

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.bone,
        {
          width,
          height,
          borderRadius: radius,
          opacity: shimmer,
        },
        style,
      ]}
    />
  );
}

export interface TransactionListSkeletonProps {
  rows?: number;
  testID?: string;
}

export function TransactionListSkeleton({
  rows = 4,
  testID = 'transactions-loading-skeleton',
}: TransactionListSkeletonProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel="Đang tải danh sách giao dịch"
      style={styles.listRoot}
    >
      {Array.from({ length: rows }, (_, idx) => (
        <View key={idx} style={styles.listRow}>
          <View style={styles.listRowTop}>
            <SkeletonBox width={72} height={72} radius={primitive.radius.md} />
            <View style={styles.listRowBody}>
              <View style={styles.pillPair}>
                <SkeletonBox width={64} height={20} radius={primitive.radius.full} />
                <SkeletonBox width={88} height={20} radius={primitive.radius.full} />
              </View>
              <SkeletonBox width="88%" height={16} />
              <SkeletonBox width="62%" height={13} />
              <SkeletonBox width="48%" height={12} />
            </View>
          </View>
          <SkeletonBox width="100%" height={28} radius={primitive.radius.md} />
        </View>
      ))}
    </View>
  );
}

export interface TransactionDetailSkeletonProps {
  testID?: string;
}

export function TransactionDetailSkeleton({
  testID = 'transaction-detail-loading',
}: TransactionDetailSkeletonProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel="Đang tải chi tiết giao dịch"
      style={styles.detailRoot}
    >
      {/* Hero Pass Skeleton */}
      <View style={styles.detailSection}>
        <View style={styles.spaceBetweenRow}>
          <SkeletonBox width={128} height={24} radius={primitive.radius.full} />
          <SkeletonBox width={96} height={24} radius={primitive.radius.full} />
        </View>

        <View style={styles.stepperBones}>
          {[0, 1, 2, 3].map((dot) => (
            <View key={dot} style={styles.stepperCol}>
              <SkeletonBox width={30} height={30} radius={primitive.radius.full} />
              <SkeletonBox width={46} height={10} />
            </View>
          ))}
        </View>

        <View style={styles.hairline} />

        <View style={styles.listRowTop}>
          <SkeletonBox width={64} height={64} radius={primitive.radius.md} />
          <View style={styles.listRowBody}>
            <SkeletonBox width="85%" height={16} />
            <SkeletonBox width="42%" height={18} />
          </View>
        </View>

        <View style={styles.pillPair}>
          <SkeletonBox width="48%" height={34} radius={primitive.radius.md} />
          <SkeletonBox width="48%" height={34} radius={primitive.radius.md} />
        </View>
      </View>

      <View style={styles.sectionGap} />

      {/* Proof Stage Skeleton */}
      <View style={styles.detailSection}>
        <View style={styles.spaceBetweenRow}>
          <SkeletonBox width={150} height={16} />
          <SkeletonBox width={110} height={22} radius={primitive.radius.full} />
        </View>
        <SkeletonBox width="100%" height={196} radius={primitive.radius.lg} />
      </View>

      <View style={styles.sectionGap} />

      {/* Action Workbench Skeleton */}
      <View style={styles.detailSection}>
        <SkeletonBox width="68%" height={16} />
        <SkeletonBox width="100%" height={84} radius={primitive.radius.lg} />
        <SkeletonBox width="100%" height={48} radius={primitive.radius.lg} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: semantic.color.bgTrack,
  },
  listRoot: {
    backgroundColor: semantic.color.bgSurface,
  },
  listRow: {
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[3],
    gap: primitive.space[2.5],
    borderBottomWidth: 1,
    borderBottomColor: semantic.color.borderHairline,
  },
  listRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[3],
  },
  listRowBody: {
    flex: 1,
    gap: primitive.space[1.5],
  },
  pillPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  detailRoot: {
    flex: 1,
    backgroundColor: semantic.color.bgCanvas,
  },
  detailSection: {
    backgroundColor: semantic.color.bgSurface,
    paddingHorizontal: semantic.spacing.pageX,
    paddingVertical: primitive.space[4],
    gap: primitive.space[3],
  },
  spaceBetweenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  stepperBones: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: primitive.space[2],
  },
  stepperCol: {
    alignItems: 'center',
    gap: primitive.space[1.5],
    flex: 1,
  },
  hairline: {
    height: 1,
    backgroundColor: semantic.color.borderHairline,
  },
  sectionGap: {
    height: primitive.space[2],
    backgroundColor: semantic.color.bgCanvas,
  },
});
