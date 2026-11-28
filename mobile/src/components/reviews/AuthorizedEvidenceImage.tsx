import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSession } from '../../auth/session';
import { isRestrictedError } from '../../listings/sellerApi';
import { loadReviewEvidenceDataUri } from '../../reviews/api';
import type { ReviewEvidenceItem } from '../../reviews/types';
import { Icon } from '../ui';
import { primitive, semantic } from '../../theme';

export interface AuthorizedEvidenceImageProps {
  evidence: Pick<ReviewEvidenceItem, 'id' | 'url' | 'originalFilename'>;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  accessibilityLabel?: string;
  compact?: boolean;
  darkSurface?: boolean;
  testID?: string;
  onRestricted?: () => void;
}

export function AuthorizedEvidenceImage({
  evidence,
  style,
  containerStyle,
  resizeMode = 'cover',
  accessibilityLabel,
  compact = false,
  darkSurface = false,
  testID,
  onRestricted,
}: AuthorizedEvidenceImageProps) {
  const token = useSession((s) => s.token);
  const userId = useSession((s) => s.user?.id ?? '');
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setDataUri(null);

    void (async () => {
      try {
        const uri = await loadReviewEvidenceDataUri(evidence, { force: retryCount > 0 });
        if (cancelled) return;
        if (!uri) {
          setFailed(true);
        } else {
          setDataUri(uri);
        }
      } catch (err) {
        if (cancelled) return;
        if (isRestrictedError(err)) {
          if (!useSession.getState().restriction) {
            useSession.setState({ restriction: err.restriction, restrictionDismissed: false });
          }
          onRestricted?.();
          setFailed(true);
          return;
        }
        setFailed(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setDataUri(null);
    };
  }, [evidence.id, evidence.url, token, userId, retryCount, onRestricted]);

  if (loading) {
    return (
      <View
        testID={testID ? `${testID}-loading` : undefined}
        style={[
          styles.placeholder,
          darkSurface && styles.placeholderDark,
          style as StyleProp<ViewStyle>,
          containerStyle,
        ]}
      >
        <ActivityIndicator
          size={compact ? 'small' : 'large'}
          color={darkSurface ? semantic.color.textInverse : semantic.color.accent}
        />
      </View>
    );
  }

  if (failed || !dataUri) {
    return (
      <View
        testID={testID ? `${testID}-error` : undefined}
        style={[
          styles.placeholder,
          darkSurface && styles.placeholderDark,
          style as StyleProp<ViewStyle>,
          containerStyle,
        ]}
      >
        <Icon
          name="alert-circle"
          size={compact ? 16 : 24}
          color={darkSurface ? semantic.color.textInverseMuted : semantic.color.textSecondary}
        />
        {!compact ? (
          <Text style={[styles.errorText, darkSurface && styles.errorTextDark]}>
            Không tải được ảnh bằng chứng.
          </Text>
        ) : null}
        <Pressable
          testID={testID ? `${testID}-retry` : undefined}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Tải lại ảnh bằng chứng"
          onPress={() => setRetryCount((n) => n + 1)}
          style={({ pressed }) => [
            styles.retryBtn,
            compact && styles.retryBtnCompact,
            darkSurface && styles.retryBtnDark,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.retryText, darkSurface && styles.retryTextDark]}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Image
      testID={testID}
      source={{ uri: dataUri }}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel ?? evidence.originalFilename ?? 'Ảnh bằng chứng'}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.color.bgTrack,
    gap: primitive.space[1.5],
    padding: primitive.space[2],
  },
  placeholderDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  errorText: {
    ...semantic.type.caption,
    textAlign: 'center',
  },
  errorTextDark: {
    color: semantic.color.textInverseMuted,
  },
  retryBtn: {
    paddingHorizontal: primitive.space[3],
    paddingVertical: primitive.space[1.5],
    borderRadius: primitive.radius.full,
    backgroundColor: semantic.color.bgSurface,
    borderWidth: 1,
    borderColor: semantic.color.borderStrong,
  },
  retryBtnCompact: {
    paddingHorizontal: primitive.space[1.5],
    paddingVertical: 2,
  },
  retryBtnDark: {
    backgroundColor: semantic.color.inversePillBg,
    borderColor: semantic.color.inversePillBorder,
  },
  retryText: {
    ...semantic.type.micro,
    color: semantic.color.accent,
    fontWeight: primitive.fontWeight.semibold,
  },
  retryTextDark: {
    color: semantic.color.textInverse,
  },
  pressed: {
    opacity: primitive.opacity.pressed,
  },
});
