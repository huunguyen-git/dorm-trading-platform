import { useCallback, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { RestrictedAccountError } from '../api/client';
import { resolveUserRestriction, useSession } from '../auth/session';
import { useChat } from '../chat/store';
import type { ConversationSummary } from '../chat/types';
import { Action, Notice, ui } from '../components/AuthUI';
import { RestrictedAccountNotice } from '../components/RestrictedAccountNotice';
import { colors, radius, space, text } from '../theme';

const POLL_INTERVAL_MS = 5000;

function formatConversationTime(iso?: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const dd = pad(date.getDate());
  const MM = pad(date.getMonth() + 1);
  return `${hh}:${mm} ${dd}/${MM}`;
}

export default function ConversationsScreen() {
  const navigation = useNavigation<Nav>();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const restriction = useSession((s) => s.restriction);
  const restrictionDismissed = useSession((s) => s.restrictionDismissed);
  const hasVisibleRestriction = Boolean(
    restriction ?? (restrictionDismissed ? null : resolveUserRestriction(user)),
  );
  const { conversations, loadingList, error, loadConversations, clearError } = useChat();
  const [refreshError, setRefreshError] = useState<string>('');
  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);

  const runFetch = useCallback(
    async (silent: boolean) => {
      const currentSession = useSession.getState();
      if (
        stoppedRef.current ||
        inFlightRef.current ||
        !currentSession.token ||
        (currentSession.user && !currentSession.user.roles.includes('MEMBER'))
      ) {
        return;
      }
      inFlightRef.current = true;
      try {
        await loadConversations({ silent });
        setRefreshError('');
      } catch (err: any) {
        if (
          (typeof RestrictedAccountError === 'function' && err instanceof RestrictedAccountError) ||
          err?.status === 401 ||
          err?.code === 'ACCOUNT_RESTRICTED' ||
          err?.code === 'ACCOUNT_NOT_ACTIVE'
        ) {
          stoppedRef.current = true;
        }
        setRefreshError(err?.message || 'Không thể tải danh sách hộp thư.');
      } finally {
        inFlightRef.current = false;
      }
    },
    [loadConversations],
  );

  useFocusEffect(
    useCallback(() => {
      stoppedRef.current = false;
      setRefreshError('');
      clearError();
      void runFetch(false);

      let appState: AppStateStatus =
        AppState.currentState === 'background' || AppState.currentState === 'inactive'
          ? AppState.currentState
          : 'active';
      const intervalId = setInterval(() => {
        if (!stoppedRef.current && appState === 'active') {
          void runFetch(true);
        }
      }, POLL_INTERVAL_MS);

      const sub = AppState.addEventListener?.('change', (nextState: AppStateStatus) => {
        const wasBackground = appState !== 'active';
        appState = nextState;
        if (wasBackground && nextState === 'active' && !stoppedRef.current) {
          void runFetch(true);
        }
      });

      return () => {
        stoppedRef.current = true;
        clearInterval(intervalId);
        sub?.remove?.();
      };
    }, [runFetch, clearError]),
  );

  const handleManualRefresh = async () => {
    stoppedRef.current = false;
    setRefreshError('');
    clearError();
    await runFetch(false);
  };

  const renderConversationCard = ({ item }: { item: ConversationSummary }) => {
    const listingTitle =
      item.listing?.title ?? item.listingTitle ?? 'Tin đăng đã bị gỡ hoặc không còn tồn tại';
    const isListingRemoved = item.listing === null && item.listingId === null;
    const isFree = item.listingType === 'CHO_TANG' || item.listingPrice === 0;
    const isCounterpartyRestricted = Boolean(
      item.counterpartyRestricted ||
        (item.counterpartyStatus && item.counterpartyStatus !== 'HOAT_DONG'),
    );
    const lastMessagePreview = item.lastMessage
      ? item.lastMessage.content && item.lastMessage.content.trim().length > 0
        ? `${item.lastMessage.senderName}: ${item.lastMessage.content}`
        : item.lastMessage.type === 'DE_NGHI_GIA' || item.lastMessage.messageType === 'DE_NGHI_GIA'
          ? `${item.lastMessage.senderName}: Đề nghị giá ${(item.lastMessage.offeredPrice ?? 0).toLocaleString('vi-VN')} ₫`
          : `${item.lastMessage.senderName}:`
      : 'Chưa có tin nhắn nào.';

    const roleLabel =
      user?.id && item.buyerId === user.id
        ? 'Vai trò: Mua'
        : user?.id && item.sellerId === user.id
          ? 'Vai trò: Bán'
          : null;
    const isBuyerRole = Boolean(user?.id && item.buyerId === user.id);
    const updatedTime = formatConversationTime(item.lastMessage?.createdAt ?? item.updatedAt);

    return (
      <Pressable
        testID={`conversation-item-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Hội thoại với ${item.counterpartyName}`}
        onPress={() => navigation.navigate('Chat', { conversationId: item.id })}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.counterpartyName} numberOfLines={1}>
            {item.counterpartyName}
          </Text>
          {updatedTime ? (
            <Text style={styles.updatedTime} testID={`conversation-time-${item.id}`}>
              {updatedTime}
            </Text>
          ) : null}
        </View>

        {roleLabel || isCounterpartyRestricted ? (
          <View style={styles.metaBadgeRow}>
            {roleLabel ? (
              <View
                testID={`conversation-role-${item.id}`}
                style={[styles.badge, isBuyerRole ? styles.badgeBuyer : styles.badgeSeller]}
              >
                <Text style={isBuyerRole ? styles.badgeBuyerText : styles.badgeSellerText}>
                  {roleLabel}
                </Text>
              </View>
            ) : null}
            {isCounterpartyRestricted ? (
              <View style={[styles.badge, styles.badgeDanger]}>
                <Text style={styles.badgeDangerText}>Tài khoản hạn chế</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text
          style={[styles.listingTitle, isListingRemoved && { fontStyle: 'italic', color: colors.muted }]}
          numberOfLines={1}
        >
          {isListingRemoved ? 'Tin đăng đã bị gỡ' : listingTitle}
        </Text>

        <View style={styles.priceRow}>
          {item.agreedPrice != null ? (
            <View style={[styles.badge, styles.badgeSuccess]}>
              <Text style={styles.badgeSuccessText}>
                Giá thỏa thuận: {item.agreedPrice.toLocaleString('vi-VN')} ₫
              </Text>
            </View>
          ) : null}
          {item.pendingOfferPrice != null ? (
            <View style={[styles.badge, styles.badgePending]}>
              <Text style={styles.badgePendingText}>
                Đề nghị đang chờ: {item.pendingOfferPrice.toLocaleString('vi-VN')} ₫
              </Text>
            </View>
          ) : null}
          {item.agreedPrice == null && item.pendingOfferPrice == null ? (
            isFree && !isListingRemoved ? (
              <View style={[styles.badge, styles.badgeNeutral]}>
                <Text style={styles.badgeNeutralText}>Cho tặng miễn phí (0 ₫)</Text>
              </View>
            ) : item.listingPrice != null ? (
              <Text style={styles.listingPriceText}>
                Giá niêm yết: {item.listingPrice.toLocaleString('vi-VN')} ₫
              </Text>
            ) : null
          ) : null}
        </View>

        <Text style={styles.lastMessage} numberOfLines={2}>
          {lastMessagePreview}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={ui.brand}>DORM TRADING</Text>
        <Text style={[text.title, { marginTop: space.xs }]}>Hộp thư cá nhân</Text>
        <Text style={ui.caption}>
          Trao đổi trực tiếp về tình trạng đồ, địa điểm hẹn gặp và thương lượng mức giá.
        </Text>
        <View style={styles.actionsBar}>
          <Action
            secondary
            title="Làm mới"
            testID="refresh-conversations-button"
            disabled={!token || Boolean(user && !user.roles.includes('MEMBER'))}
            onPress={() => void handleManualRefresh()}
          />
          <Action
            secondary
            title="Tin đăng công khai"
            onPress={() => navigation.navigate('Listings')}
          />
        </View>
      </View>

      {hasVisibleRestriction ? (
        <View style={{ marginHorizontal: space.lg, marginBottom: space.sm }}>
          <RestrictedAccountNotice />
        </View>
      ) : null}

      {refreshError || error ? (
        <View style={{ marginHorizontal: space.lg, marginBottom: space.sm }}>
          <Notice message={refreshError || error || ''} error />
        </View>
      ) : null}

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loadingList} onRefresh={() => void handleManualRefresh()} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loadingList ? (
            <View style={styles.emptyContainer} testID="conversations-empty-state">
              <Text style={styles.emptyTitle}>Chưa có cuộc hội thoại nào</Text>
              <Text style={ui.caption}>
                Hãy chọn một tin đăng công khai và nhấn "Nhắn tin" hoặc "Thương lượng giá" để bắt đầu trao đổi.
              </Text>
            </View>
          ) : null
        }
        renderItem={renderConversationCard}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  header: {
    padding: space.lg,
    paddingBottom: space.sm,
  },
  actionsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  listContent: {
    padding: space.lg,
    gap: space.md,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: space.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  counterpartyName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  updatedTime: {
    fontSize: 12,
    color: colors.muted,
  },
  metaBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },
  listingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginVertical: 2,
  },
  listingPriceText: {
    fontSize: 13,
    color: colors.muted,
  },
  lastMessage: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeSuccess: {
    backgroundColor: '#e6f4ea',
  },
  badgeSuccessText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#137333',
  },
  badgePending: {
    backgroundColor: '#fef7e0',
  },
  badgePendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b06000',
  },
  badgeNeutral: {
    backgroundColor: '#f1f3f4',
  },
  badgeNeutralText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5f6368',
  },
  badgeDanger: {
    backgroundColor: '#fff0ec',
  },
  badgeDangerText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.danger,
  },
  badgeBuyer: {
    backgroundColor: '#e8f0fe',
  },
  badgeBuyerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a73e8',
  },
  badgeSeller: {
    backgroundColor: '#f3e8fd',
  },
  badgeSellerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7627bb',
  },
  emptyContainer: {
    padding: space.xl,
    borderRadius: radius.md,
    backgroundColor: '#f2ede4',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
});
