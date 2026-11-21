import { StyleSheet, Text, View } from 'react-native';

// Placeholder stage. Replaced by the conversation feature in phase 1.
export default function Stage() {
  return (
    <View style={styles.stage}>
      <Text style={styles.name}>Vorp</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0f11' },
  name: { color: '#e9c46a', fontSize: 32, fontWeight: '600' },
});
