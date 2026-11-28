import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatTransactionDateTime,
  mapTimelineActionLabel,
  mapTransactionStatusLabel,
  TIMELINE_ACTOR_LABELS,
  type TransactionTimelineEvent,
} from '../../transactions/types';
import { primitive, semantic } from '../../theme';
import { Icon } from '../ui';

export interface TransactionTimelineProps {
  events: TransactionTimelineEvent[];
  defaultExpanded?: boolean;
  testID?: string;
}

function getTimelineDotColor(event: TransactionTimelineEvent, isLatest: boolean): string {
  const action = event.action.trim().toUpperCase();
  if (
    event.toStatus === 'HOAN_TAT' ||
    action === 'COMPLETED_BY_OTP' ||
    action === 'OTP_VERIFIED' ||
    action === 'TRANSACTION_COMPLETED'
  ) {
    return semantic.color.success;
  }
  if (
    event.toStatus === 'HUY' ||
    action === 'CANCEL_AGREED' ||
    action === 'TRANSACTION_CANCELLED' ||
    action === 'OTP_LOCKED_MAX_ATTEMPTS' ||
    action === 'OTP_ATTEMPTS_EXCEEDED'
  ) {
    return semantic.color.danger;
  }
  if (
    event.toStatus === 'CHO_XU_LY' ||
    action === 'CANCEL_REQUESTED' ||
    action === 'CANCEL_REJECTED' ||
    action === 'AUTO_ESCALATED_OVERDUE_24H' ||
    action === 'ESCALATED_OVERDUE_24H' ||
    action === 'ESCALATED_CANCEL_DISPUTE'
  ) {
    return semantic.color.warning;
  }
  return isLatest ? semantic.color.accent : semantic.color.borderStrong;
}

export function TransactionTimeline({
  events,
  defaultExpanded = false,
  testID = 'transaction-timeline',
}: TransactionTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!events || events.length === 0) {
    return null;
  }

  const canToggle = events.length > 2;
  const visibleEvents = expanded || !canToggle ? events : events.slice(-2);

  return (
    <View style={styles.container} testID={testID}>
      {canToggle ? (
        <Pressable
          testID={`${testID}-toggle`}
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Thu gọn nhật ký giao dịch' : 'Xem toàn bộ nhật ký giao dịch'}
          accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.headerRow, pressed && styles.pressed]}
        >
          <View style={styles.titleWrap}>
            <Text style={styles.title} accessibilityRole="header">
              Nhật ký giao dịch
            </Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{events.length} mốc</Text>
            </View>
          </View>
          <View style={styles.toggleRight}>
            <Text style={styles.toggleLabel}>{expanded ? 'Thu gọn' : 'Xem tất cả'}</Text>
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={semantic.color.accent}
            />
          </View>
        </Pressable>
      ) : (
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} accessibilityRole="header">
              Nhật ký giao dịch
            </Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{events.length} mốc</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.list}>
        {visibleEvents.map((event, index) => {
          const isLast = index === visibleEvents.length - 1;
          const timeStr = formatTransactionDateTime(event.createdAt);
          const actorStr = TIMELINE_ACTOR_LABELS[event.actorRole] ?? 'Hệ thống';
          const statusStr = mapTransactionStatusLabel(event.toStatus);
          const dotColor = getTimelineDotColor(event, isLast);

          return (
            <View key={event.id} style={styles.row} testID={`${testID}-event-${index}`}>
              <View style={styles.railCol}>
                <View style={[styles.dotWrap, isLast && styles.dotWrapLatest]}>
                  <View style={[styles.dot, { backgroundColor: dotColor }]} />
                </View>
                {!isLast ? <View style={styles.line} /> : null}
              </View>
              <View style={styles.contentCol}>
                <View style={styles.eventTop}>
                  <Text style={styles.actionText}>{mapTimelineActionLabel(event.action)}</Text>
                  {timeStr ? <Text style={styles.timeText}>{timeStr}</Text> : null}
                </View>
                <Text style={styles.metaText}>
                  {actorStr} · {statusStr}
                </Text>
                {event.note ? <Text style={styles.noteText}>“{event.note}”</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: primitive.space[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[2],
  },
  title: {
    ...semantic.type.sectionTitle,
  },
  countPill: {
    paddingHorizontal: primitive.space[2],
    paddingVertical: 2,
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgTrack,
  },
  countText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    color: semantic.color.textSecondary,
  },
  toggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggleLabel: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    gap: primitive.space[2.5],
  },
  railCol: {
    width: 16,
    alignItems: 'center',
    paddingTop: 2,
  },
  dotWrap: {
    width: 14,
    height: 14,
    borderRadius: primitive.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotWrapLatest: {
    backgroundColor: semantic.color.accentSoft,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: primitive.radius.full,
  },
  line: {
    width: 1.5,
    flex: 1,
    backgroundColor: semantic.color.borderHairline,
    marginVertical: 3,
  },
  contentCol: {
    flex: 1,
    paddingBottom: primitive.space[3],
    gap: 2,
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: primitive.space[2],
  },
  actionText: {
    ...semantic.type.label,
    flex: 1,
  },
  timeText: {
    ...semantic.type.micro,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  metaText: {
    ...semantic.type.micro,
    color: semantic.color.textSecondary,
  },
  noteText: {
    ...semantic.type.micro,
    color: semantic.color.textPrimary,
    marginTop: 2,
    lineHeight: 17,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
