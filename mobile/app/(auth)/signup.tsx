import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';
import * as Haptics from 'expo-haptics';

export default function SignUp() {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await signup(email.trim(), password, name.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        Alert.alert('Account exists', 'An account with this email already exists.');
      } else if (code === 'auth/invalid-email') {
        Alert.alert('Invalid email', 'Please enter a valid email address.');
      } else {
        Alert.alert('Sign up failed', 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Driiva</Text>
          <Text style={styles.tagline}>Join the safe driving revolution</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Create account</Text>

          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            textContentType="name"
          />

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <TextInput
            style={styles.input}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.terms}>
            By signing up you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/signin" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  logoContainer: { alignItems: 'center', marginBottom: Spacing.xxl },
  logoText: { fontSize: FontSize.display, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1 },
  tagline: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },
  card: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.lg },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },
  input: { backgroundColor: Colors.bgInput, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, color: Colors.textPrimary, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.bgCardBorder },
  button: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.md },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  terms: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, lineHeight: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg, paddingBottom: Spacing.xxl },
  footerText: { color: Colors.textSecondary, fontSize: FontSize.md },
  footerLink: { color: Colors.primaryLight, fontSize: FontSize.md, fontWeight: '600' },
});
