import { useContext } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Nav } from '../../navigation';
import { useSession } from '../../auth/session';
import { component, primitive, semantic } from '../../theme';
import { Icon, type AppIconName } from './Icon';

export type BottomNavTab =
  | 'Listings'
  | 'InventoryList'
  | 'CreateListing'
  | 'MyListings'
  | 'Profile'
  | 'Login';

export interface BottomNavBarProps {
  activeTab: BottomNavTab;
  onNavigate?: (route: BottomNavTab) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

interface NavItemSpec {
  key: string;
  label: string;
  icon: AppIconName;
  target: BottomNavTab;
  isActive: boolean;
  disabled: boolean;
  focal?: boolean;
  testID: string;
}

export function BottomNavBar({ activeTab, onNavigate, testID, style }: BottomNavBarProps) {
  const navigation = useContext(NavigationContext) as Nav | undefined;
  const insets = useContext(SafeAreaInsetsContext);
  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);

  const isAuthenticated = Boolean(token);
  const isMember = Boolean(token && user?.roles.includes('MEMBER'));
  const memberLockedOrPending = isAuthenticated && !isMember;

  const bottomPad = Math.max(insets?.bottom ?? 0, primitive.space[2]);

  const navigateTo = (target: BottomNavTab) => {
    if (onNavigate) {
      onNavigate(target);
      return;
    }
    if (navigation && typeof navigation.navigate === 'function') {
      if (target === 'CreateListing') {
        navigation.navigate('CreateListing');
      } else {
        navigation.navigate(target);
      }
    }
  };

  const accountTarget: BottomNavTab = isAuthenticated ? 'Profile' : 'Login';
  const accountLabel = isAuthenticated ? 'Hồ sơ' : 'Đăng nhập';
  const accountIcon: AppIconName = isAuthenticated ? 'user' : 'log-in';

  const items: NavItemSpec[] = [
    {
      key: 'listings',
      label: 'Khám phá',
      icon: 'home',
      target: 'Listings',
      isActive: activeTab === 'Listings',
      disabled: false,
      testID: 'bottom-nav-listings',
    },
    {
      key: 'inventory',
      label: 'Kho đồ',
      icon: 'package',
      target: isAuthenticated ? 'InventoryList' : 'Login',
      isActive: activeTab === 'InventoryList',
      disabled: memberLockedOrPending,
      testID: 'bottom-nav-inventory',
    },
    {
      key: 'create',
      label: 'Đăng tin',
      icon: 'plus',
      target: isAuthenticated ? 'CreateListing' : 'Login',
      isActive: activeTab === 'CreateListing',
      disabled: memberLockedOrPending,
      focal: true,
      testID: 'bottom-nav-create',
    },
    {
      key: 'my-listings',
      label: 'Tin của tôi',
      icon: 'tag',
      target: isAuthenticated ? 'MyListings' : 'Login',
      isActive: activeTab === 'MyListings',
      disabled: memberLockedOrPending,
      testID: 'bottom-nav-my-listings',
    },
    {
      key: 'account',
      label: accountLabel,
      icon: accountIcon,
      target: accountTarget,
      isActive: activeTab === 'Profile' || activeTab === 'Login',
      disabled: false,
      testID: 'bottom-nav-account',
    },
  ];

  return (
    <View
      testID={testID ?? 'bottom-nav-bar'}
      style={[styles.container, { paddingBottom: bottomPad }, style]}
    >
      {items.map((item) => {
        const tint = item.isActive
          ? component.bottomNav.activeFg
          : component.bottomNav.inactiveFg;

        return (
          <Pressable
            key={item.key}
            testID={item.testID}
            disabled={item.disabled}
            onPress={() => {
              if (!item.disabled) {
                navigateTo(item.target);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{
              disabled: item.disabled,
              selected: item.isActive,
            }}
            style={({ pressed }) => [
              styles.tabItem,
              item.disabled && styles.tabItemDisabled,
              pressed && !item.disabled && styles.tabItemPressed,
            ]}
          >
            {item.focal ? (
              <View
                style={[
                  styles.focalPill,
                  item.disabled && styles.focalPillDisabled,
                ]}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  color={component.bottomNav.focalFg}
                />
              </View>
            ) : (
              <View style={styles.iconSlot}>
                {item.isActive ? <View style={styles.activeIndicator} /> : null}
                <Icon name={item.icon} size={20} color={tint} />
              </View>
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                item.isActive && styles.labelActive,
                item.focal && !item.disabled && styles.labelFocal,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    minHeight: component.bottomNav.height,
    backgroundColor: component.bottomNav.bg,
    borderTopWidth: 1,
    borderTopColor: component.bottomNav.border,
    paddingTop: primitive.space[1.5],
    paddingHorizontal: primitive.space[1],
    ...primitive.elevation.thumb,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    gap: 3,
    paddingHorizontal: primitive.space[1],
  },
  tabItemDisabled: {
    opacity: primitive.opacity.disabled,
  },
  tabItemPressed: {
    opacity: primitive.opacity.pressed,
  },
  iconSlot: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: -6,
    width: 18,
    height: 2.5,
    borderRadius: primitive.radius.full,
    backgroundColor: component.bottomNav.activeFg,
  },
  focalPill: {
    width: 44,
    height: 30,
    borderRadius: primitive.radius.full,
    backgroundColor: component.bottomNav.focalBg,
    alignItems: 'center',
    justifyContent: 'center',
    ...primitive.elevation.floating,
  },
  focalPillDisabled: {
    backgroundColor: semantic.color.borderStrong,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: primitive.fontWeight.medium,
    color: component.bottomNav.inactiveFg,
  },
  labelActive: {
    color: component.bottomNav.activeFg,
    fontWeight: primitive.fontWeight.semibold,
  },
  labelFocal: {
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
});
