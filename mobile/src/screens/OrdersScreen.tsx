import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import { formatVnd } from '../listings/types';
import { useOrders } from '../orders/store';
import {
  formatOrderDateTime,
  ORDER_STATUS_META,
  type OrderRoleFilter,
  type OrderStatus,
} from '../orders/types';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import {
  EmptyState,
  HairlineDivider,
  Icon,
  InlineBanner,
  SectionHeading,
  SegmentedControl,
  StatusIndicator,
} from '../components/ui';
import { primitive, semantic } from '../theme';

const ROLE_OPTIONS: { value: OrderRoleFilter; label: string; testID: string }[] = [
  { value: 'ALL', label: 'Tất cả', testID: 'orders-role-all' },
  { value: 'BUYER', label: 'Tôi mua', testID: 'orders-role-buyer' },
  { value: 'SELLER', label: 'Tôi bán', testID: 'orders-role-seller' },
];

const STATUS_FILTERS: { value: OrderStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'YEU_CAU', label: 'Chờ duyệt' },
  { value: 'GIU_CHO', label: 'Đang giữ chỗ' },
  { value: 'DANG_GIAO', label: 'Đang giao' },
  { value: 'HUY', label: 'Đã hủy' },
];

export default function OrdersScreen() {
  const navigation = useNavigation<Nav>();
  const user = useSession((s) => s.user);
  const {
    orders,
    roleFilter,
    statusFilter,
    loading,
    error,
    notifications,
    unreadCount,
    loadOrders,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useOrders();

  const refresh = useCallback(() => {
    void loadOrders();
    void loadNotifications();
  }, [loadOrders, loadNotifications]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return;
    return navigation.addListener('focus', refresh);
  }, [navigation, refresh]);

  const unreadNotifications = notifications.filter((n) => !n.read).slice(0, 3);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <RestrictedAccountNotice />

        {/* Unread order / listing-updated notifications */}
        {unreadNotifications.length > 0 ? (
          <View style={styles.notifSection} testID="orders-notifications-section">
            <SectionHeading
              title={`Thông báo mới (${unreadCount})`}
              actionLabel="Đánh dấu đã đọc"
              actionTestID="mark-all-notifications-read"
              onActionPress={() => void markAllNotificationsRead()}
            />
            {unreadNotifications.map((notif) => (
              <Pressable
                key={notif.id}
                testID={`notification-item-${notif.id}`}
                onPress={() => {
                  void markNotificationRead(notif.id);
                  if (notif.orderId) {
                    navigation.navigate('OrderDetail', { id: notif.orderId });
                  }
                }}
                style={({ pressed }) => [styles.notifCard, pressed && styles.pressed]}
              >
                <View style={styles.notifHeader}>
                  <Icon name="info" size={15} color={semantic.color.accent} />
                  <Text style={styles.notifTitle} numberOfLines={1}>
                    {notif.title}
                  </Text>
                </View>
                <Text style={styles.notifMessage}>{notif.message}</Text>
              </Pressable>
            ))}
            <HairlineDivider />
          </View>
        ) : null}

        {/* Role filter */}
        <SegmentedControl
          testID="orders-role-segmented"
          options={ROLE_OPTIONS}
          value={roleFilter}
          onChange={(nextRole) => void loadOrders({ role: nextRole, status: statusFilter })}
        />

        {/* Status pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusRow}
        >
          {STATUS_FILTERS.map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <Pressable
                key={opt.value}
                testID={`orders-status-${opt.value}`}
                onPress={() => void loadOrders({ role: roleFilter, status: opt.value })}
                style={[styles.statusPill, active && styles.statusPillActive]}
              >
                <Text style={[styles.statusPillText, active && styles.statusPillTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? (
          <InlineBanner
            testID="orders-error-banner"
            tone="danger"
            message={error}
            actionLabel="Thử lại"
            onActionPress={refresh}
          />
        ) : null}

        {loading && orders.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={semantic.color.accent} />
            <Text style={styles.loadingText}>Đang tải danh sách giao dịch…</Text>
          </View>
        ) : orders.length === 0 ? (
          <EmptyState
            testID="orders-empty-state"
            icon="shopping-bag"
            title="Chưa có giao dịch nào"
            subtitle="Khi bạn gửi yêu cầu giữ chỗ hoặc nhận được yêu cầu từ người mua, giao dịch sẽ hiển thị tại đây."
            primaryActionLabel="Khám phá tin đăng"
            onPrimaryAction={() => navigation.navigate('Listings')}
          />
        ) : (
          <View style={styles.list}>
            {orders.map((order) => {
              const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.YEU_CAU;
              const isSeller = user?.id === order.seller.id;
              const counterparty = isSeller ? order.buyer : order.seller;
              return (
                <Pressable
                  key={order.id}
                  testID={`order-card-${order.id}`}
                  onPress={() => navigation.navigate('OrderDetail', { id: order.id })}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  <View style={styles.cardHeader}>
                    <StatusIndicator variant="soft" tone={meta.tone} label={meta.label} />
                    <Text style={styles.roleTag}>{isSeller ? 'Bán' : 'Mua'}</Text>
                  </View>

                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {order.listing.title}
                  </Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.priceText}>{formatVnd(order.agreedPriceVnd)}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.metaText}>
                      {order.listing.isCombo ? `Combo ${order.itemCount} món` : '1 món'}
                    </Text>
                  </View>

                  <Text style={styles.metaText}>
                    {isSeller ? 'Người mua' : 'Người bán'}: {counterparty.displayName} (Uy tín{' '}
                    {counterparty.reputationScore})
                  </Text>

                  {order.scheduleConfirmed && order.meetingTime && order.meetingLocation ? (
                    <View style={styles.scheduleLine}>
                      <Icon name="clock" size={13} color={semantic.color.freeFg} />
                      <Text style={styles.scheduleText} numberOfLines={1}>
                        Đã hẹn: {formatOrderDateTime(order.meetingTime)} · {order.meetingLocation}
                      </Text>
                    </View>
                  ) : order.hasPendingScheduleProposal ? (
                    <View style={styles.scheduleLine}>
                      <Icon name="clock" size={13} color={semantic.color.warning} />
                      <Text style={styles.pendingScheduleText}>
                        Có đề xuất lịch hẹn đang chờ xác nhận
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semantic.color.bgPage },
  scrollContent: {
    padding: primitive.space[4],
    gap: primitive.space[3],
    paddingBottom: primitive.space[8],
  },
  notifSection: {
    gap: primitive.space[2],
  },
  notifCard: {
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    borderLeftWidth: 3,
    borderLeftColor: semantic.color.accent,
    borderRadius: primitive.radius.md,
    padding: primitive.space[3],
    gap: primitive.space[1],
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  notifTitle: {
    flex: 1,
    ...semantic.type.label,
    color: semantic.color.textPrimary,
  },
  notifMessage: {
    ...semantic.type.caption,
    color: semantic.color.textSecondary,
  },
  statusRow: {
    gap: primitive.space[2],
    paddingVertical: primitive.space[1],
  },
  statusPill: {
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  statusPillActive: {
    backgroundColor: semantic.color.accent,
    borderColor: semantic.color.accent,
  },
  statusPillText: {
    ...semantic.type.caption,
    color: semantic.color.textSecondary,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: semantic.color.textInverse,
  },
  center: {
    paddingVertical: primitive.space[10],
    alignItems: 'center',
    gap: primitive.space[2],
  },
  loadingText: {
    ...semantic.type.caption,
    color: semantic.color.textSecondary,
  },
  list: {
    gap: primitive.space[3],
  },
  card: {
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.lg,
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
    padding: primitive.space[4],
    gap: primitive.space[1.5],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleTag: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
    fontWeight: '600',
    backgroundColor: semantic.color.bgSubtle,
    paddingHorizontal: primitive.space[2],
    paddingVertical: 2,
    borderRadius: primitive.radius.sm,
  },
  cardTitle: {
    ...semantic.type.sectionTitle,
    color: semantic.color.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
  },
  priceText: {
    ...semantic.type.label,
    color: semantic.color.accent,
    fontWeight: '700',
  },
  dot: {
    color: semantic.color.textSecondary,
  },
  metaText: {
    ...semantic.type.caption,
    color: semantic.color.textSecondary,
  },
  scheduleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    marginTop: primitive.space[1],
  },
  scheduleText: {
    flex: 1,
    ...semantic.type.caption,
    color: semantic.color.freeFg,
    fontWeight: '600',
  },
  pendingScheduleText: {
    flex: 1,
    ...semantic.type.caption,
    color: semantic.color.warning,
    fontWeight: '600',
  },
  pressed: { opacity: primitive.opacity.pressed },
});
