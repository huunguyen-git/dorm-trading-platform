import Feather from '@expo/vector-icons/Feather';
import type { StyleProp, TextStyle } from 'react-native';
import { semantic } from '../../theme';

export type AppIconName =
  | 'home'
  | 'compass'
  | 'tag'
  | 'plus-circle'
  | 'package'
  | 'box'
  | 'user'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'more-horizontal'
  | 'x'
  | 'search'
  | 'sliders'
  | 'filter'
  | 'map-pin'
  | 'refresh-cw'
  | 'camera'
  | 'image'
  | 'plus'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'trash-2'
  | 'edit-2'
  | 'share-2'
  | 'copy'
  | 'clock'
  | 'layers'
  | 'award'
  | 'shield'
  | 'star'
  | 'check'
  | 'check-circle'
  | 'circle'
  | 'alert-circle'
  | 'alert-triangle'
  | 'info'
  | 'eye'
  | 'eye-off'
  | 'log-in'
  | 'log-out'
  | 'inbox'
  | 'lock'
  | 'mail'
  | 'message-circle'
  | 'flag'
  | 'book-open'
  | 'gift'
  | 'link'
  | 'bookmark'
  | 'key'
  | 'send'
  | 'grid'
  | 'list'
  | 'cpu'
  | 'shopping-bag'
  | 'zap'
  | 'maximize-2'
  | 'trending-up'
  | 'navigation'
  | 'coffee'
  | 'headphones'
  | 'music'
  | 'sun'
  | 'heart';

export interface IconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({
  name,
  size = 18,
  color = semantic.color.textPrimary,
  accessibilityLabel,
  testID,
  style,
}: IconProps) {
  const isAccessible = Boolean(accessibilityLabel);
  return (
    <Feather
      name={name}
      size={size}
      color={color}
      testID={testID}
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!isAccessible}
      importantForAccessibility={isAccessible ? 'yes' : 'no-hide-descendants'}
    />
  );
}
