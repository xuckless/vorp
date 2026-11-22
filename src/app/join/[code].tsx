// The guest's page, opened from the host's QR code: /join/<code>?host=<the host's language>.

import { useLocalSearchParams } from 'expo-router';

import { GuestScreen } from '@/features/pair/GuestScreen';

export default function Join() {
  const { code, host } = useLocalSearchParams<{ code: string; host?: string }>();
  return <GuestScreen code={code} host={typeof host === 'string' && host !== '' ? host : undefined} />;
}
