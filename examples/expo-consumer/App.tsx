// Minimal Expo consumer for Metro export checks. It never sends a request.
import { useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import { createUprateClient } from '@upratehq/react-native';

export default function App() {
  const key = process.env.EXPO_PUBLIC_UPRATE_SDK_KEY;
  const client = useMemo(() => {
    if (!key || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
    return createUprateClient({ apiKey: key, platform: Platform.OS });
  }, [key]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text>{client ? 'Uprate SDK loaded' : 'Set EXPO_PUBLIC_UPRATE_SDK_KEY to configure Uprate'}</Text>
    </View>
  );
}
