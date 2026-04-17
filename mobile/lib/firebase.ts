/**
 * Firebase configuration for Driiva Mobile
 * Uses @react-native-firebase which reads from GoogleService-Info.plist (iOS)
 * and google-services.json (Android) at build time.
 *
 * For Expo development builds, the config plugins handle native file placement.
 */
import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export { firebase, auth, firestore };

// Firestore settings
firestore().settings({
  persistence: true,         // Offline persistence
  cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
});
