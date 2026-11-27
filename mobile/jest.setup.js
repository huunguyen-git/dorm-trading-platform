jest.mock('@expo/vector-icons/Feather', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockFeather = React.forwardRef(
    (
      {
        testID,
        accessibilityLabel,
        accessibilityElementsHidden,
        importantForAccessibility,
        style,
      },
      ref,
    ) =>
      React.createElement(View, {
        ref,
        testID,
        accessibilityLabel,
        accessibilityElementsHidden,
        importantForAccessibility,
        style,
      }),
  );
  MockFeather.displayName = 'Feather';
  return { __esModule: true, default: MockFeather };
});
