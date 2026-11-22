import { Geist_400Regular, Geist_500Medium, useFonts } from '@expo-google-fonts/geist';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  const [loaded, error] = useFonts({ Geist_400Regular, Geist_500Medium });
  // A font that fails to load must not hold the app back; text falls back to the system face.
  if (!loaded && !error) return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
