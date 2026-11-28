import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Nav } from '../navigation';
import { useSession } from '../auth/session';
import {
  extractReviewApiError,
  fetchSellerReceivedReviews,
  isReviewRestrictedError,
  respondSupplementalRequest,
  withdrawReviewComplaint,
} from '../reviews/api';
import {
  formatComplaintStatusLabel,
  formatReviewStatusLabel,
  type SellerReceivedReview,
} from '../reviews/types';
import { formatShortDate } from '../listings/types';
import { EmptyState, HairlineDivider, Icon, InlineBanner, StatusIndicator } from '../components/ui';
import { component, primitive, semantic } from '../theme';

export default function MyReviewsScreen() {
  const navigation = useNavigation<Nav>();
  const token = useSession((s) => s.token);

  const [reviews, setReviews] = useState<SellerReceivedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const items = await fetchSellerReceivedReviews();
      setReviews(items);
    } catch (err) {
      if (!isReviewRestrictedError(err)) {
        setError(extractReviewApiError(err, 'Không thể tải danh sách đánh giá.').message);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return;
    return navigation.addListener('focus', () => {
      void load();
    });
  }, [navigation, load]);

  const confirmWithdraw = (complaintId: string) => {
    Alert.alert(
      'Rút khiếu nại đánh giá',
      'Sau khi rút khiếu nại, người mua sẽ được mở lại quyền sửa/xóa và bạn không thể gửi khiếu nại mới cho cùng đánh giá này. Tiếp tục?',
      [
        { text: 'Giữ nguyên', style: 'cancel' },
        {
          text: 'Rút khiếu nại',
          style: 'destructive',
          onPress: () => void performWithdraw(complaintId),
        },
      ],
    );
  };

  const performWithdraw = async (complaintId: string) => {
    setBusyId(complaintId);
    setError('');
    setNotice('');
    try {
      await withdrawReviewComplaint(complaintId);
      setNotice('Đã rút khiếu nại đánh giá.');
      await load();
    } catch (err) {
      if (!isReviewRestrictedError(err)) {
        setError(extractReviewApiError(err, 'Không thể rút khiếu nại.').message);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleRespondSupplemental = async (requestId: string) => {
    const note = (replyDrafts[requestId] ?? '').trim();
    if (!note) {
      setError('Vui lòng nhập nội dung phản hồi bổ sung cho Kiểm duyệt viên.');
      return;
    }
    setBusyId(requestId);
    setError('');
    setNotice('');
    try {
      await respondSupplementalRequest(requestId, note, []);
      setReplyDrafts((prev) => ({ ...prev, [requestId]: '' }));
      setNotice('Đã gửi thông tin bổ sung cho Kiểm duyệt viên.');
      await load();
    } catch (err) {
      if (!isReviewRestrictedError(err)) {
        setError(extractReviewApiError(err, 'Không thể gửi phản hồi bổ sung.').message);
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.center}>
        <EmptyState
          icon="lock"
          title="Cần đăng nhập"
          subtitle="Đăng nhập để xem đánh giá đã nhận và theo dõi trạng thái khiếu nại."
          primaryActionLabel="Đăng nhập"
          onPrimaryAction={() => navigation.navigate('Login')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {notice ? <InlineBanner testID="reviews-notice" tone="success" message={notice} /> : null}
        {error ? (
          <InlineBanner
            testID="reviews-error"
            tone="danger"
            message={error}
            actionLabel="Tải lại"
            onActionPress={() => void load()}
          />
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={semantic.color.accent} />
            <Text style={styles.caption}>Đang tải đánh giá đã nhận…</Text>
          </View>
        ) : reviews.length === 0 ? (
          <EmptyState
            testID="reviews-empty"
            icon="award"
            title="Chưa có đánh giá nào"
            subtitle="Các đánh giá sau khi giao dịch hoàn tất và kết quả khiếu nại sẽ hiển thị tại đây."
          />
        ) : (
          reviews.map((item) => {
            const complaint = item.complaint;
            const complaintTone =
              complaint?.status === 'DA_XU_LY'
                ? complaint.conclusion === 'CHAP_NHAN_KHIEU_NAI'
                  ? 'success'
                  : 'neutral'
                : complaint?.status === 'DA_RUT'
                  ? 'neutral'
                  : 'warning';

            return (
              <View key={item.reviewId} style={styles.card} testID={`received-review-${item.reviewId}`}>
                <View style={styles.cardHeader}>
                  <View style={styles.starBadge}>
                    <Icon name="star" size={14} color={semantic.color.ratingStar} />
                    <Text style={styles.starText}>{item.stars}/5 sao</Text>
                  </View>
                  <StatusIndicator
                    variant="soft"
                    tone={item.status === 'DA_GO' ? 'neutral' : 'success'}
                    label={formatReviewStatusLabel(item.status)}
                  />
                </View>

                <Text style={styles.listingTitle}>{item.listingTitle}</Text>
                <Text style={styles.meta}>
                  Người mua: {item.buyerName} · Công khai: {formatShortDate(item.publishedAt)}
                </Text>

                {item.comment ? <Text style={styles.comment}>“{item.comment}”</Text> : null}

                {typeof item.appliedScoreDelta === 'number' && item.appliedScoreDelta !== 0 ? (
                  <Text style={styles.scoreDelta}>
                    Tác động điểm đánh giá: {item.appliedScoreDelta > 0 ? '+' : ''}
                    {item.appliedScoreDelta} điểm
                  </Text>
                ) : null}

                {complaint ? (
                  <View style={styles.complaintBox} testID={`complaint-status-${complaint.id}`}>
                    <View style={styles.complaintHeader}>
                      <StatusIndicator
                        variant="urgent"
                        tone={complaintTone}
                        label={formatComplaintStatusLabel(complaint.status, complaint.conclusion)}
                      />
                    </View>
                    <Text style={styles.complaintReason}>Lý do: {complaint.reasonLabel}</Text>
                    {complaint.description ? (
                      <Text style={styles.meta}>{complaint.description}</Text>
                    ) : null}
                    {complaint.moderationRationale ? (
                      <Text style={styles.rationale}>
                        Kết luận kiểm duyệt: {complaint.moderationRationale}
                      </Text>
                    ) : null}
                    {complaint.status === 'CHO_XU_LY' ? (
                      <Pressable
                        testID={`withdraw-complaint-${complaint.id}`}
                        disabled={busyId === complaint.id}
                        onPress={() => confirmWithdraw(complaint.id)}
                        style={({ pressed }) => [styles.withdrawBtn, pressed && styles.pressed]}
                      >
                        <Text style={styles.withdrawBtnText}>
                          {busyId === complaint.id ? 'Đang rút…' : 'Rút khiếu nại'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : item.canComplain ? (
                  <>
                    <HairlineDivider />
                    <View style={styles.complainFooter}>
                      <Text style={styles.deadlineText}>
                        Còn {item.daysRemainingToComplain} ngày để khiếu nại
                      </Text>
                      <Pressable
                        testID={`complain-review-${item.reviewId}`}
                        onPress={() =>
                          navigation.navigate('ReviewComplaint', {
                            reviewId: item.reviewId,
                            reviewVersion: item.version,
                            listingTitle: item.listingTitle,
                            buyerName: item.buyerName,
                            stars: item.stars,
                            comment: item.comment,
                            daysRemaining: item.daysRemainingToComplain,
                          })
                        }
                        style={({ pressed }) => [styles.complainBtn, pressed && styles.pressed]}
                      >
                        <Icon name="flag" size={14} color={semantic.color.danger} />
                        <Text style={styles.complainBtnText}>Khiếu nại đánh giá</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={styles.expiredNote}>
                    {item.status === 'DA_GO'
                      ? 'Đánh giá đã được gỡ khỏi hồ sơ.'
                      : 'Đã hết thời hạn 7 ngày để khiếu nại đánh giá này.'}
                  </Text>
                )}

                {item.pendingSupplementalRequests.map((req) => (
                  <View key={req.id} style={styles.supplementalBox} testID={`supplemental-req-${req.id}`}>
                    <Text style={styles.supplementalTitle}>Yêu cầu bổ sung từ Kiểm duyệt viên</Text>
                    <Text style={styles.meta}>{req.requestNote}</Text>
                    <TextInput
                      testID={`supplemental-input-${req.id}`}
                      multiline
                      value={replyDrafts[req.id] ?? ''}
                      onChangeText={(text) =>
                        setReplyDrafts((prev) => ({ ...prev, [req.id]: text }))
                      }
                      placeholder="Nhập thông tin giải trình bổ sung…"
                      placeholderTextColor={semantic.color.textSecondary}
                      style={styles.supplementalInput}
                    />
                    <Pressable
                      testID={`supplemental-send-${req.id}`}
                      disabled={busyId === req.id}
                      onPress={() => void handleRespondSupplemental(req.id)}
                      style={({ pressed }) => [styles.sendReplyBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.sendReplyText}>
                        {busyId === req.id ? 'Đang gửi…' : 'Gửi phản hồi bổ sung'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semantic.color.bgCanvas },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: semantic.spacing.section },
  content: { padding: semantic.spacing.pageX, gap: primitive.space[3], paddingBottom: primitive.space[8] },
  loadingWrap: { paddingVertical: primitive.space[8], alignItems: 'center', gap: primitive.space[2] },
  caption: { ...semantic.type.caption },
  card: {
    backgroundColor: semantic.color.bgSurface,
    borderRadius: primitive.radius.xl,
    padding: primitive.space[4],
    gap: primitive.space[2.5],
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: primitive.space[2] },
  starBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: semantic.color.ratingBg,
    paddingHorizontal: primitive.space[2.5],
    paddingVertical: primitive.space[1],
    borderRadius: primitive.radius.full,
  },
  starText: { ...semantic.type.label, color: semantic.color.ratingText },
  listingTitle: { ...semantic.type.cardTitle },
  meta: { ...semantic.type.caption },
  comment: { ...semantic.type.body, fontStyle: 'italic' },
  scoreDelta: { ...semantic.type.micro, color: semantic.color.textSecondary },
  complaintBox: {
    backgroundColor: semantic.color.bgSubtle,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[3],
    gap: primitive.space[1.5],
    borderWidth: 1,
    borderColor: semantic.color.borderHairline,
  },
  complaintHeader: { flexDirection: 'row', alignItems: 'center' },
  complaintReason: { ...semantic.type.label },
  rationale: { ...semantic.type.caption, color: semantic.color.textPrimary },
  withdrawBtn: {
    alignSelf: 'flex-start',
    marginTop: primitive.space[1],
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.danger,
  },
  withdrawBtnText: { ...semantic.type.label, color: semantic.color.danger },
  complainFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: primitive.space[2] },
  deadlineText: { ...semantic.type.micro, color: semantic.color.warning },
  complainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: primitive.space[1.5],
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[2],
    borderRadius: component.button.radius,
    backgroundColor: semantic.color.dangerSoft,
  },
  complainBtnText: { ...semantic.type.label, color: semantic.color.danger },
  expiredNote: { ...semantic.type.micro },
  supplementalBox: {
    backgroundColor: semantic.color.warningSoft,
    borderRadius: primitive.radius.lg,
    padding: primitive.space[3],
    gap: primitive.space[2],
  },
  supplementalTitle: { ...semantic.type.label, color: semantic.color.warning },
  supplementalInput: {
    minHeight: 72,
    borderRadius: primitive.radius.md,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
    backgroundColor: semantic.color.bgSurface,
    padding: primitive.space[2.5],
    color: semantic.color.textPrimary,
    textAlignVertical: 'top',
  },
  sendReplyBtn: {
    minHeight: 40,
    borderRadius: component.button.radius,
    backgroundColor: component.button.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: primitive.space[3],
  },
  sendReplyText: { ...semantic.type.label, color: component.button.primaryFg },
  pressed: { opacity: primitive.opacity.pressed },
});
