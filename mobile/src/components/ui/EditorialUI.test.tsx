import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AuthScreen } from '../AuthUI';
import { ListingCard } from '../ListingCard';
import ListingImageManager from '../ListingImageManager';
import { useSession } from '../../auth/session';
import {
  LISTING_STATUS_META,
  formatDisplayPrice,
  formatReputationSummary,
  formatVnd,
  mapListingStatusLabel,
  type ListingSummary,
} from '../../listings/types';
import { colors, component, primitive, radius, semantic, space, text } from '../../theme';
import {
  ActionSheet,
  BottomNavBar,
  BottomSheet,
  CheckboxRow,
  CollapsibleAlert,
  EmptyState,
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
  OrderProgressStepper,
  QuotaMeter,
  SectionHeading,
  SegmentedControl,
  StatusIndicator,
  SwitchRow,
  UnderlineTabs,
} from './index';

beforeEach(() => {
  useSession.setState({
    token: null,
    user: null,
    loading: false,
    restriction: null,
    restrictionDismissed: false,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Theme 3-layer tokens and listing helpers', () => {
  test('preserves backward-compatible exports and semantic mappings', () => {
    expect(primitive.color.paper).toBe('#FAF9F6');
    expect(semantic.color.bgPage).toBe(primitive.color.paper);
    expect(semantic.color.accent).toBe(primitive.color.terracotta500);
    expect(component.button.primaryBg).toBe(semantic.color.accent);
    expect(colors.brand).toBe(semantic.color.accent);
    expect(colors.ink).toBe(semantic.color.textPrimary);
    expect(space.lg).toBe(16);
    expect(radius.md).toBe(10);
    expect(text.title.color).toBe(colors.ink);
  });

  test('formats prices, reputation summaries, and status labels without emojis or raw enums', () => {
    expect(formatVnd(0)).toBe('Miễn phí (0đ)');
    expect(formatVnd(150000)).toBe('150.000đ');
    expect(formatDisplayPrice(0)).toBe('Tặng miễn phí');
    expect(formatDisplayPrice(null)).toBe('Tặng miễn phí');
    expect(formatDisplayPrice(45000)).toBe('45.000đ');

    expect(formatReputationSummary(125)).toEqual({
      scoreText: 'Uy tín 125',
      tierLabel: 'Tin cậy cao',
    });
    expect(formatReputationSummary(100)).toEqual({
      scoreText: 'Uy tín 100',
      tierLabel: 'Ổn định',
    });
    expect(formatReputationSummary(65)).toEqual({
      scoreText: 'Uy tín 65',
      tierLabel: 'Cần cải thiện',
    });
    expect(formatReputationSummary(30)).toEqual({
      scoreText: 'Uy tín 30',
      tierLabel: 'Hạn chế',
    });

    expect(LISTING_STATUS_META.CONG_KHAI.fg).toBe(semantic.color.success);
    expect(LISTING_STATUS_META.GIU_CHO.tier).toBe('urgent');
    expect(mapListingStatusLabel('DANG_GIU')).toBe('Đang giữ chỗ');
    expect(mapListingStatusLabel('HOAN_TAT')).toBe('Đã hoàn tất');
    expect(mapListingStatusLabel('CONG_KHAI')).toBe('Đang hiển thị');
    expect(mapListingStatusLabel('NHAP')).toBe('Bản nháp');
    expect(mapListingStatusLabel('AN')).toBe('Bị ẩn');
    expect(mapListingStatusLabel('UNKNOWN_CODE')).toBe('Không xác định');
    expect(mapListingStatusLabel('')).toBe('Không xác định');
  });
});

describe('Icon', () => {
  test('hides decorative icons from accessibility and exposes labeled icons', () => {
    render(
      <View>
        <Icon name="search" testID="decorative-icon" />
        <Icon name="sliders" testID="labeled-icon" accessibilityLabel="Bộ lọc" />
      </View>,
    );

    expect(screen.queryByTestId('decorative-icon')).toBeNull();
    const decorative = screen.getByTestId('decorative-icon', { includeHiddenElements: true });
    expect(decorative.props.accessibilityElementsHidden).toBe(true);
    expect(decorative.props.importantForAccessibility).toBe('no-hide-descendants');

    const labeled = screen.getByTestId('labeled-icon');
    expect(labeled.props.accessibilityLabel).toBe('Bộ lọc');
    expect(labeled.props.accessibilityElementsHidden).toBe(false);
    expect(labeled.props.importantForAccessibility).toBe('yes');
  });
});

describe('BottomNavBar', () => {
  test('renders safely outside SafeAreaProvider and handles guest routing', () => {
    const onNavigate = jest.fn();
    render(<BottomNavBar activeTab="Listings" onNavigate={onNavigate} />);

    expect(screen.getByRole('button', { name: 'Khám phá' }).props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Đăng tin' }));
    fireEvent.press(screen.getByRole('button', { name: 'Kho đồ' }));
    fireEvent.press(screen.getByRole('button', { name: 'Tin của tôi' }));
    fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'Login');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'Login');
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'Login');
    expect(onNavigate).toHaveBeenNthCalledWith(4, 'Login');
  });

  test('disables member-only tabs for pending or locked users without MEMBER role', () => {
    useSession.setState({
      token: 'pending-token',
      user: {
        id: 'u-1',
        name: 'Sinh viên A',
        email: 'a@uit.edu.vn',
        studentId: '22520001',
        role: 'member',
        roles: [],
        emailVerified: true,
        profileApproved: false,
        accountStatus: 'CHO_KICH_HOAT',
      },
    });
    const onNavigate = jest.fn();
    render(<BottomNavBar activeTab="Listings" onNavigate={onNavigate} />);

    const createBtn = screen.getByRole('button', { name: 'Đăng tin' });
    const invBtn = screen.getByRole('button', { name: 'Kho đồ' });
    const myBtn = screen.getByRole('button', { name: 'Tin của tôi' });
    expect(createBtn.props.accessibilityState.disabled).toBe(true);
    expect(invBtn.props.accessibilityState.disabled).toBe(true);
    expect(myBtn.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(createBtn);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));
    expect(onNavigate).toHaveBeenCalledWith('Profile');
  });

  test('navigates all 5 tabs for verified MEMBER account', () => {
    useSession.setState({
      token: 'member-token',
      user: {
        id: 'u-2',
        name: 'Sinh viên B',
        email: 'b@uit.edu.vn',
        studentId: '22520002',
        role: 'member',
        roles: ['MEMBER'],
        emailVerified: true,
        profileApproved: true,
        accountStatus: 'HOAT_DONG',
      },
    });
    const onNavigate = jest.fn();
    render(<BottomNavBar activeTab="MyListings" onNavigate={onNavigate} />);

    expect(
      screen.getByRole('button', { name: 'Tin của tôi' }).props.accessibilityState.selected,
    ).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: 'Khám phá' }));
    fireEvent.press(screen.getByRole('button', { name: 'Kho đồ' }));
    fireEvent.press(screen.getByRole('button', { name: 'Đăng tin' }));
    fireEvent.press(screen.getByRole('button', { name: 'Tin của tôi' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hồ sơ' }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'Listings');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'InventoryList');
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'CreateListing');
    expect(onNavigate).toHaveBeenNthCalledWith(4, 'MyListings');
    expect(onNavigate).toHaveBeenNthCalledWith(5, 'Profile');
  });
});

describe('BottomSheet and ActionSheet', () => {
  test('BottomSheet renders header, body, footer CTA, and invokes callbacks', () => {
    const onClose = jest.fn();
    const onReset = jest.fn();
    const onApply = jest.fn();

    render(
      <BottomSheet
        visible
        onClose={onClose}
        title="Bộ lọc nâng cao"
        rightActionLabel="Đặt lại"
        onRightAction={onReset}
        rightActionTestID="sheet-reset"
        footerLabel="Xem kết quả"
        footerCount={12}
        onFooterPress={onApply}
        footerTestID="sheet-apply"
        testID="filter-sheet"
      >
        <Text>Nội dung bộ lọc</Text>
      </BottomSheet>,
    );

    expect(screen.getByText('Bộ lọc nâng cao')).toBeTruthy();
    expect(screen.getByText('Nội dung bộ lọc')).toBeTruthy();
    expect(screen.getByText('Xem kết quả (12)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sheet-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('sheet-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('filter-sheet-close'));
    fireEvent.press(screen.getByTestId('filter-sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('ActionSheet executes normal/destructive actions, respects disabled, and cancels', () => {
    const onClose = jest.fn();
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const onDisabled = jest.fn();

    render(
      <ActionSheet
        visible
        onClose={onClose}
        title="Tùy chọn tin đăng"
        testID="owner-actions"
        options={[
          { key: 'edit', label: 'Chỉnh sửa tin', icon: 'edit-2', onPress: onEdit, testID: 'act-edit' },
          {
            key: 'locked',
            label: 'Rút tin',
            icon: 'eye-off',
            disabled: true,
            onPress: onDisabled,
            testID: 'act-locked',
          },
          {
            key: 'delete',
            label: 'Xóa vĩnh viễn',
            icon: 'trash-2',
            destructive: true,
            onPress: onDelete,
            testID: 'act-delete',
          },
        ]}
      />,
    );

    fireEvent.press(screen.getByTestId('act-locked'));
    expect(onDisabled).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('act-edit'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('act-delete'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('owner-actions-cancel'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('SegmentedControl and UnderlineTabs', () => {
  test('SegmentedControl updates selection and exposes tab accessibility state', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <SegmentedControl
        testID="listing-mode"
        value="single"
        onChange={onChange}
        options={[
          { value: 'single', label: 'Bán lẻ', testID: 'seg-single' },
          { value: 'combo', label: 'Bán combo', testID: 'seg-combo' },
        ]}
      />,
    );

    fireEvent(screen.getByTestId('listing-mode'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 44 } },
    });
    fireEvent(screen.getByTestId('seg-single'), 'layout', {
      nativeEvent: { layout: { x: 4, y: 4, width: 146, height: 36 } },
    });
    fireEvent(screen.getByTestId('seg-combo'), 'layout', {
      nativeEvent: { layout: { x: 150, y: 4, width: 146, height: 36 } },
    });

    expect(screen.getByTestId('seg-single').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('seg-combo').props.accessibilityState.selected).toBe(false);

    fireEvent.press(screen.getByTestId('seg-combo'));
    expect(onChange).toHaveBeenCalledWith('combo');

    rerender(
      <SegmentedControl
        testID="listing-mode"
        value="combo"
        onChange={onChange}
        options={[
          { value: 'single', label: 'Bán lẻ', testID: 'seg-single' },
          { value: 'combo', label: 'Bán combo', testID: 'seg-combo' },
        ]}
      />,
    );
    expect(screen.getByTestId('seg-combo').props.accessibilityState.selected).toBe(true);
  });

  test('UnderlineTabs renders counts and triggers tab changes', () => {
    const onChange = jest.fn();
    render(
      <UnderlineTabs
        testID="status-tabs"
        value="ALL"
        onChange={onChange}
        items={[
          { value: 'ALL', label: 'Tất cả', count: 8, testID: 'tab-all' },
          { value: 'ACTIVE', label: 'Đang hiển thị', count: 5, testID: 'tab-active' },
          { value: 'DRAFT', label: 'Bản nháp', count: 3, testID: 'tab-draft' },
        ]}
      />,
    );

    fireEvent(screen.getByTestId('status-tabs'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 46 } },
    });
    fireEvent(screen.getByTestId('tab-all'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 90, height: 46 } },
    });
    fireEvent(screen.getByTestId('tab-active'), 'layout', {
      nativeEvent: { layout: { x: 94, y: 0, width: 130, height: 46 } },
    });

    expect(screen.getByTestId('tab-all').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('tab-active'));
    expect(onChange).toHaveBeenCalledWith('ACTIVE');
  });
});

describe('FormField', () => {
  test('supports label association, suffix, validation/error states, and password visibility toggle', () => {
    const onChangeText = jest.fn();
    const { rerender } = render(
      <FormField
        testID="price-input"
        label="Giá bán"
        required
        suffix="đ"
        helperText="Nhập 0 nếu muốn tặng miễn phí."
        value="50000"
        onChangeText={onChangeText}
      />,
    );

    const input = screen.getByLabelText('Giá bán');
    expect(screen.getByText('đ')).toBeTruthy();
    expect(screen.getByText('Nhập 0 nếu muốn tặng miễn phí.')).toBeTruthy();
    fireEvent(input, 'focus');
    fireEvent.changeText(input, '75000');
    fireEvent(input, 'blur');
    expect(onChangeText).toHaveBeenCalledWith('75000');

    rerender(
      <FormField
        testID="price-input"
        label="Giá bán"
        value="75000"
        valid
        onChangeText={onChangeText}
      />,
    );
    expect(screen.getByTestId('price-input-status-icon')).toBeTruthy();

    rerender(
      <FormField
        testID="price-input"
        label="Giá bán"
        value=""
        error="Vui lòng nhập giá hợp lệ."
        onChangeText={onChangeText}
      />,
    );
    expect(screen.getByText('Vui lòng nhập giá hợp lệ.')).toBeTruthy();
    expect(screen.getByTestId('price-input-status-icon')).toBeTruthy();

    rerender(
      <FormField
        testID="password-input"
        label="Mật khẩu"
        value="Secret123!"
        passwordToggle
        onChangeText={onChangeText}
      />,
    );
    expect(screen.getByTestId('password-input').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByTestId('password-input-toggle-password'));
    expect(screen.getByTestId('password-input').props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByTestId('password-input-toggle-password'));
    expect(screen.getByTestId('password-input').props.secureTextEntry).toBe(true);
  });
});

describe('EmptyState, QuotaMeter, ToggleControl, StatusIndicator, LayoutPrimitives', () => {
  test('EmptyState renders loosening suggestions and CTA buttons', () => {
    const onClearZone = jest.fn();
    const onResetAll = jest.fn();
    const onCreate = jest.fn();

    render(
      <EmptyState
        icon="search"
        title="Không tìm thấy tin phù hợp"
        subtitle="Thử bỏ bớt một vài tiêu chí để xem thêm đồ dùng gần bạn."
        suggestions={[
          {
            key: 'zone',
            activeLabel: 'KTX Khu B',
            actionLabel: 'Mở rộng ra toàn khu vực',
            onPress: onClearZone,
            testID: 'loosen-zone',
          },
        ]}
        primaryActionLabel="Xóa tất cả bộ lọc"
        onPrimaryAction={onResetAll}
        primaryActionTestID="reset-all"
        secondaryActionLabel="Đăng tin mới"
        onSecondaryAction={onCreate}
        secondaryActionTestID="go-create"
      />,
    );

    expect(screen.getByText('Không tìm thấy tin phù hợp')).toBeTruthy();
    expect(screen.getByText('KTX Khu B')).toBeTruthy();
    fireEvent.press(screen.getByTestId('loosen-zone'));
    fireEvent.press(screen.getByTestId('reset-all'));
    fireEvent.press(screen.getByTestId('go-create'));

    expect(onClearZone).toHaveBeenCalledTimes(1);
    expect(onResetAll).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  test('QuotaMeter displays progressbar semantics, unlock cue without jargon, and threshold warnings', () => {
    const { rerender } = render(
      <QuotaMeter activeCount={3} limit={5} warningTestID="quota-warn" />,
    );

    expect(screen.getByText('3 / 5 tin')).toBeTruthy();
    expect(screen.getByText('< 120 điểm: tối đa 5 tin · ≥ 120 điểm: tối đa 10 tin')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({
      min: 0,
      max: 5,
      now: 3,
    });
    expect(screen.queryByTestId('quota-warn')).toBeNull();

    rerender(<QuotaMeter activeCount={4} limit={5} warningTestID="quota-warn" />);
    expect(screen.getByTestId('quota-warn')).toBeTruthy();
    expect(screen.getByText('Còn 1 suất tin đang hiển thị.')).toBeTruthy();

    rerender(<QuotaMeter activeCount={5} limit={5} warningTestID="quota-warn" />);
    expect(screen.getByTestId('quota-warn')).toBeTruthy();
    expect(
      screen.getByText(
        'Đã đạt hạn mức tin đang mở. Rút bớt tin cũ hoặc lưu bản nháp để đăng sau.',
      ),
    ).toBeTruthy();
  });

  test('CheckboxRow and SwitchRow expose roles and respect disabled state', () => {
    const onCheck = jest.fn();
    const onSwitch = jest.fn();

    render(
      <View>
        <CheckboxRow
          testID="cb-item"
          label="Đèn bàn học"
          description="Còn mới 90%"
          checked={false}
          onChange={onCheck}
        />
        <CheckboxRow
          testID="cb-disabled"
          label="Món đã khóa"
          checked
          disabled
          onChange={onCheck}
        />
        <SwitchRow
          testID="sw-free"
          label="Tặng miễn phí"
          value={false}
          onValueChange={onSwitch}
        />
        <SwitchRow
          testID="sw-disabled"
          label="Khóa chuyển đổi"
          value
          disabled
          onValueChange={onSwitch}
        />
      </View>,
    );

    const cb = screen.getByTestId('cb-item');
    expect(cb.props.accessibilityRole).toBe('checkbox');
    expect(cb.props.accessibilityState).toEqual({ checked: false, disabled: false });
    fireEvent.press(cb);
    expect(onCheck).toHaveBeenCalledWith(true);

    const cbDisabled = screen.getByTestId('cb-disabled');
    expect(cbDisabled.props.accessibilityState).toEqual({ checked: true, disabled: true });
    fireEvent.press(cbDisabled);
    expect(onCheck).toHaveBeenCalledTimes(1);

    const sw = screen.getByTestId('sw-free');
    expect(sw.props.accessibilityRole).toBe('switch');
    expect(sw.props.accessibilityState).toEqual({ checked: false, disabled: false });
    fireEvent.press(sw);
    expect(onSwitch).toHaveBeenCalledWith(true);

    const swDisabled = screen.getByTestId('sw-disabled');
    expect(swDisabled.props.accessibilityState).toEqual({ checked: true, disabled: true });
    fireEvent.press(swDisabled);
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  test('StatusIndicator renders dot, soft, and urgent variants', () => {
    render(
      <>
        <StatusIndicator testID="st-dot" label="Đang hiển thị" tone="success" variant="dot" />
        <StatusIndicator testID="st-soft" label="Combo · 3 món" tone="neutral" variant="soft" />
        <StatusIndicator
          testID="st-urgent"
          label="Đang giữ chỗ"
          tone="warning"
          variant="urgent"
          icon="clock"
        />
      </>,
    );

    expect(screen.getByText('Đang hiển thị')).toBeTruthy();
    expect(screen.getByText('Combo · 3 món')).toBeTruthy();
    expect(screen.getByText('Đang giữ chỗ')).toBeTruthy();
  });

  test('LayoutPrimitives render divider, heading action, and inline banner', () => {
    const onSectionAction = jest.fn();
    const onBannerAction = jest.fn();
    const onDismiss = jest.fn();

    render(
      <View>
        <HairlineDivider testID="hairline" />
        <SectionHeading
          title="Đồ vật trong tin"
          subtitle="Chọn tối đa 5 đồ vật"
          actionLabel="Xem kho"
          actionIcon="chevron-right"
          onActionPress={onSectionAction}
          actionTestID="sec-action"
        />
        <InlineBanner
          tone="warning"
          title="Sắp hết hạn"
          message="Tin sẽ ẩn sau 7 ngày nếu không gia hạn."
          actionLabel="Gia hạn ngay"
          onActionPress={onBannerAction}
          actionTestID="banner-action"
          onDismiss={onDismiss}
          dismissTestID="banner-dismiss"
        />
      </View>,
    );

    expect(screen.queryByTestId('hairline')).toBeNull();
    expect(
      screen.getByTestId('hairline', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
    expect(screen.getByText('Đồ vật trong tin')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sec-action'));
    expect(onSectionAction).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Sắp hết hạn')).toBeTruthy();
    fireEvent.press(screen.getByTestId('banner-action'));
    fireEvent.press(screen.getByTestId('banner-dismiss'));
    expect(onBannerAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('respects reduce-motion preference across animated components', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');

    const { rerender } = render(
      <>
        <BottomSheet visible={false} onClose={() => {}} title="Lọc">
          <Text>Body</Text>
        </BottomSheet>
        <QuotaMeter activeCount={2} limit={5} />
        <SwitchRow testID="rm-switch" label="Miễn phí" value={false} onValueChange={() => {}} />
        <FormField testID="rm-field" label="Tiêu đề" value="Bàn học" />
      </>,
    );

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });
    timingSpy.mockClear();

    rerender(
      <>
        <BottomSheet visible onClose={() => {}} title="Lọc">
          <Text>Body</Text>
        </BottomSheet>
        <QuotaMeter activeCount={5} limit={5} />
        <SwitchRow testID="rm-switch" label="Miễn phí" value onValueChange={() => {}} />
        <FormField testID="rm-field" label="Tiêu đề" value="" error="Bắt buộc nhập." />
      </>,
    );

    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('5 / 5 tin')).toBeTruthy();
    expect(screen.getByText('Bắt buộc nhập.')).toBeTruthy();
    expect(timingSpy).not.toHaveBeenCalled();
  });

  test('SegmentedControl disabled mode strips thumb elevation to avoid Android shadow bleed', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <SegmentedControl
        testID="disabled-segmented"
        disabled={false}
        options={[
          { value: 'single', label: 'Tin đơn', testID: 'seg-single' },
          { value: 'combo', label: 'Combo', testID: 'seg-combo' },
        ]}
        value="single"
        onChange={onChange}
      />,
    );

    fireEvent(screen.getByTestId('disabled-segmented'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 44 } },
    });
    fireEvent(screen.getByTestId('seg-single'), 'layout', {
      nativeEvent: { layout: { x: 3, y: 3, width: 157, height: 38 } },
    });
    fireEvent(screen.getByTestId('seg-combo'), 'layout', {
      nativeEvent: { layout: { x: 160, y: 3, width: 157, height: 38 } },
    });

    const enabledThumbStyle = StyleSheet.flatten(
      screen.getByTestId('disabled-segmented-thumb', { includeHiddenElements: true }).props.style,
    );
    expect(enabledThumbStyle.elevation).toBeGreaterThan(0);

    rerender(
      <SegmentedControl
        testID="disabled-segmented"
        disabled
        options={[
          { value: 'single', label: 'Tin đơn', testID: 'seg-single' },
          { value: 'combo', label: 'Combo', testID: 'seg-combo' },
        ]}
        value="single"
        onChange={onChange}
      />,
    );

    const disabledThumbStyle = StyleSheet.flatten(
      screen.getByTestId('disabled-segmented-thumb', { includeHiddenElements: true }).props.style,
    );
    expect(disabledThumbStyle.elevation).toBe(0);
    expect(disabledThumbStyle.shadowOpacity).toBe(0);

    const singleTab = screen.getByTestId('seg-single');
    expect(singleTab.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('seg-combo'));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('BottomSheet shrinks maxHeight when keyboard opens and restores when keyboard hides', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const addListenerSpy = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation(((eventName: string, cb: (event: unknown) => void) => {
        listeners.set(eventName, cb);
        return { remove: jest.fn() };
      }) as unknown as typeof Keyboard.addListener);

    try {
      render(
        <BottomSheet visible onClose={() => {}} title="Bộ lọc" testID="kb-sheet">
          <Text>Filter body</Text>
        </BottomSheet>,
      );

      const initialMaxHeight = StyleSheet.flatten(
        screen.getByTestId('kb-sheet').props.style,
      ).maxHeight as number;
      expect(initialMaxHeight).toBeGreaterThan(400);

      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
      const showCb = listeners.get(showEvent);
      const hideCb = listeners.get(hideEvent);
      expect(showCb).toBeDefined();
      expect(hideCb).toBeDefined();

      act(() => {
        showCb?.({ endCoordinates: { height: 340 } });
      });
      const shrunkMaxHeight = StyleSheet.flatten(
        screen.getByTestId('kb-sheet').props.style,
      ).maxHeight as number;
      expect(shrunkMaxHeight).toBeLessThan(initialMaxHeight);

      act(() => {
        hideCb?.({});
      });
      const restoredMaxHeight = StyleSheet.flatten(
        screen.getByTestId('kb-sheet').props.style,
      ).maxHeight as number;
      expect(restoredMaxHeight).toBe(initialMaxHeight);
    } finally {
      addListenerSpy.mockRestore();
    }
  });

  test('AuthScreen disables KeyboardAvoidingView padding on Android (resize mode) and keeps padding on iOS', () => {
    const originalOs = Platform.OS;
    try {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
      const androidTree = render(
        <AuthScreen title="Đăng nhập">
          <Text>Body</Text>
        </AuthScreen>,
      );
      const androidKav = androidTree.UNSAFE_getByType(KeyboardAvoidingView);
      expect(androidKav.props.behavior).toBeUndefined();
      expect(androidKav.props.keyboardVerticalOffset).toBe(0);
      androidTree.unmount();

      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
      const iosTree = render(
        <AuthScreen title="Đăng nhập">
          <Text>Body</Text>
        </AuthScreen>,
      );
      const iosKav = iosTree.UNSAFE_getByType(KeyboardAvoidingView);
      expect(iosKav.props.behavior).toBe('padding');
      expect(iosKav.props.keyboardVerticalOffset).toBe(88);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOs });
    }
  });

  test('ListingCard omits Authorization header for public CONG_KHAI media and attaches it only for non-public media', () => {
    const prevApiUrl = process.env.EXPO_PUBLIC_API_URL;
    const prevToken = useSession.getState().token;
    const mediaId = '7f255386-74df-4ed0-8334-c0a345ea24f4';
    const baseListing: ListingSummary = {
      id: 'lst-1',
      title: 'Giáo trình SE100',
      description: 'Sách sạch đẹp',
      condition: 'Mới 95%',
      priceVnd: 50000,
      listingType: 'BAN_LE',
      isCombo: false,
      isFree: false,
      status: 'CONG_KHAI',
      categoryId: 'GT_CNTT',
      categoryName: 'Giáo trình CNTT',
      courseCode: 'SE100',
      courseName: null,
      author: null,
      locationCode: 'UIT',
      locationName: 'UIT',
      locationText: 'UIT',
      latitude: null,
      longitude: null,
      distanceKm: null,
      thumbnailUrl: `/api/v1/media/${mediaId}`,
      images: [`/api/v1/media/${mediaId}`],
      itemCount: 1,
      seller: {
        id: 'u-1',
        displayName: 'Nguyễn Văn A',
        reputationScore: 100,
        averageRating: null,
        reviewCount: 0,
      },
      hasUnavailableItems: false,
      publishedAt: null,
      expiresAt: null,
      renewalReminderDue: false,
      renewalCount: 0,
      createdAt: null,
      updatedAt: null,
      version: 0,
    };

    try {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.dormtrading.vn/api/v1';
      useSession.setState({ token: 'active-jwt' });

      const publicTree = render(<ListingCard listing={baseListing} onPress={() => {}} />);
      const publicImg = publicTree.UNSAFE_getByType(Image);
      expect(publicImg.props.source).toEqual({
        uri: `https://api.dormtrading.vn/api/v1/media/${mediaId}`,
      });
      publicTree.unmount();

      const draftTree = render(
        <ListingCard listing={{ ...baseListing, status: 'NHAP' }} onPress={() => {}} />,
      );
      const draftImg = draftTree.UNSAFE_getByType(Image);
      expect(draftImg.props.source).toEqual({
        uri: `https://api.dormtrading.vn/api/v1/media/${mediaId}`,
        headers: { Authorization: 'Bearer active-jwt' },
      });
      draftTree.unmount();
    } finally {
      process.env.EXPO_PUBLIC_API_URL = prevApiUrl;
      useSession.setState({ token: prevToken });
    }
  });

  test('ListingImageManager deduplicates canonical relative and resolved app media URLs', () => {
    const prevApiUrl = process.env.EXPO_PUBLIC_API_URL;
    const mediaId = '7f255386-74df-4ed0-8334-c0a345ea24f4';
    const onChange = jest.fn();

    try {
      process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8082/api/v1';
      render(
        <ListingImageManager
          images={[`http://10.0.2.2:8082/api/v1/media/${mediaId}`]}
          onChange={onChange}
        />,
      );

      fireEvent.press(screen.getByTestId('listing-toggle-url-input'));
      fireEvent.changeText(
        screen.getByTestId('listing-image-url-input'),
        `/api/v1/media/${mediaId}`,
      );
      fireEvent.press(screen.getByTestId('listing-add-url-btn'));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByText('Ảnh này đã có trong danh sách.')).toBeTruthy();
    } finally {
      process.env.EXPO_PUBLIC_API_URL = prevApiUrl;
    }
  });

  test('OrderProgressStepper (Lucian #444) exposes progressbar semantics, cancelled state, and respects reduce-motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');

    const { rerender } = render(
      <OrderProgressStepper
        testID="stepper-test"
        currentStep={1}
        statusNote="Đã giữ chỗ · Hai bên thống nhất lịch hẹn."
      />,
    );

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });
    timingSpy.mockClear();

    const bar = screen.getByTestId('stepper-test');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 4, now: 1 });
    expect(screen.getByText('Yêu cầu')).toBeTruthy();
    expect(screen.getByText('Giữ chỗ')).toBeTruthy();
    expect(screen.getByText('Đang giao')).toBeTruthy();
    expect(screen.getByText('Hoàn tất')).toBeTruthy();
    expect(screen.getByText('Đã giữ chỗ · Hai bên thống nhất lịch hẹn.')).toBeTruthy();

    rerender(
      <OrderProgressStepper
        testID="stepper-test"
        currentStep={2}
        cancelled
        statusNote="Giữ chỗ đã hủy."
      />,
    );
    expect(screen.getByTestId('stepper-test').props.accessibilityLabel).toContain('đã hủy');
    expect(timingSpy).not.toHaveBeenCalled();
  });

  test('CollapsibleAlert (Lucian #072) toggles details, fires press/dismiss, and respects reduce-motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');
    const onPress = jest.fn();
    const onDismiss = jest.fn();

    render(
      <CollapsibleAlert
        testID="alert-test"
        tone="warning"
        title="Tin đăng vừa cập nhật"
        message="Người bán vừa điều chỉnh mô tả tin."
        details="Giá không đổi, cập nhật địa điểm sảnh A1."
        onPress={onPress}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });
    timingSpy.mockClear();

    expect(screen.queryByText('Giá không đổi, cập nhật địa điểm sảnh A1.')).toBeNull();
    fireEvent.press(screen.getByTestId('alert-test-details-toggle'));
    expect(screen.getByText('Giá không đổi, cập nhật địa điểm sảnh A1.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('alert-test-press'));
    expect(onPress).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('alert-test-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(timingSpy).not.toHaveBeenCalled();
  });
});
