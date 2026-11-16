import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, space, text } from '../theme';

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f4ef' },
  content: { flexGrow: 1, padding: space.xl, gap: space.xl },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.surface, padding: space.xl, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, gap: space.lg },
  heading: { gap: space.sm },
  brand: { color: colors.brand, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  caption: { color: colors.muted, lineHeight: 22 },
  label: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  field: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: 48, paddingVertical: space.md, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  button: { minHeight: 48, borderRadius: radius.md, padding: space.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.brand, flexDirection: 'row', gap: space.sm },
  notice: { padding: space.lg, borderRadius: radius.md, backgroundColor: '#f2ede4', gap: space.xs },
  divider: { borderTopWidth: 1, borderColor: colors.line, paddingTop: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: { paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: '#f2ede4', borderRadius: 20, color: colors.ink, fontSize: 12, overflow: 'hidden' },
});
export function AuthScreen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <KeyboardAvoidingView style={ui.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <View style={[ui.heading, { maxWidth: 520, width: '100%', alignSelf: 'center' }]}>
        <Text style={ui.brand}>DORM TRADING</Text><Text accessibilityRole="header" style={text.title}>{title}</Text><Text style={ui.caption}>{subtitle}</Text>
      </View>
      <View style={ui.card}>{children}</View>
      <Text style={[ui.caption, { textAlign: 'center', fontSize: 12 }]}>Trao đổi đồ dùng. Kết nối sinh viên.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View style={{ gap: space.sm }}><Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={[ui.field, props.editable === false && { backgroundColor: '#f5f4ef' }]} {...props} />
    {hint && <Text style={ui.caption}>{hint}</Text>}
  </View>;
}
export function PasswordField({ label, ...props }: TextInputProps & { label: string }) {
  const [show, setShow] = useState(false);
  return <View style={{ gap: space.xs }}><Field {...props} label={label} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${show ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`} accessibilityState={{ expanded: show }} onPress={() => setShow(!show)} hitSlop={8} style={{ alignSelf: 'flex-end', paddingVertical: space.sm }}>
      <Text style={{ color: colors.brand }}>{show ? 'Ẩn' : 'Hiện'} mật khẩu</Text>
    </Pressable>
  </View>;
}
export function Action({ title, onPress, disabled = false, busy = false, secondary = false, testID }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [ui.button, { backgroundColor: secondary ? colors.surface : colors.brand, opacity: disabled || busy ? 0.45 : pressed ? 0.8 : 1 }]}>
    {busy && <ActivityIndicator color={secondary ? colors.brand : colors.surface} />}<Text style={{ fontWeight: '600', color: secondary ? colors.brand : colors.surface }}>{title}</Text>
  </Pressable>;
}
export function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return message ? <View style={[ui.notice, error && { backgroundColor: '#fff0ec' }]}>
    <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={{ color: error ? colors.danger : colors.ink, lineHeight: 22 }}>{message}</Text>
  </View> : null;
}
export function Steps({ current, labels }: { current: number; labels: string[] }) {
  return <View accessibilityLabel={`Bước ${current + 1}: ${labels[current]}`} style={ui.row}>{labels.map((label, i) =>
    <Text key={label} style={[ui.badge, i === current && { backgroundColor: colors.ink, color: colors.surface }]}>{i + 1}. {label}</Text>)}</View>;
}
