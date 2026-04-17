import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '@/constants/theme';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch {
      Alert.alert('Error', 'Could not send reset email. Please check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.body}>
              We've sent a password reset link to {email}. Check your inbox and follow the link to reset your password.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/signin')}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.body}>
            Enter the email address associated with your account and we'll send you a reset link.
          </Text>
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
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleReset}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color={Colors.textPrimary} /> : <Text style={styles.buttonText}>Send Reset Link</Text>}
          </TouchableOpacity>

          <Link href="/(auth)/signin" asChild>
            <TouchableOpacity style={styles.link}>
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  card: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.bgCardBorder, padding: Spacing.lg },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  body: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 22 },
  input: { backgroundColor: Colors.bgInput, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: FontSize.md, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.bgCardBorder },
  button: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.md },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
  link: { alignItems: 'center', marginTop: Spacing.md },
  linkText: { color: Colors.primaryLight, fontSize: FontSize.sm },
});
