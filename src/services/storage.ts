// Settings and history stay on the device: AsyncStorage (MIT) is localStorage on web and the
// platform's key-value store on native, so one implementation serves every platform.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KeyValueStorage } from './types';

export function createStorage(): KeyValueStorage {
  return {
    get: (key) => AsyncStorage.getItem(key),
    set: (key, value) => AsyncStorage.setItem(key, value),
  };
}
