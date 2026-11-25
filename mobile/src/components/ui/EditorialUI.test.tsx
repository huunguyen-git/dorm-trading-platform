import React from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { useSession } from '../../auth/session';
import {
  LISTING_STATUS_META,
  formatDisplayPrice,
  formatReputationSummary,
  formatVnd,
  mapListingStatusLabel,
} from '../../listings/types';
import { colors, component, primitive, radius, semantic, space, text } from '../../theme';
import {
  ActionSheet,
  BottomNavBar,
  BottomSheet,
  CheckboxRow,
  EmptyState,
  FormField,
  HairlineDivider,
  Icon,
  InlineBanner,
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
});
